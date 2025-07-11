// routes/public.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const Experiment = require('../models/experiment');
const ExperimentData = require('../models/experimentData');
const { UPLOAD_DIR } = require('../config/upload');

// GET /run/:id - Start experiment page
router.get('/run/:id', async (req, res) => {
  try {
    const experiment = await Experiment.findByPk(req.params.id);
    
    if (!experiment) {
      return res.status(404).send('Experiment not found');
    }

    if (!experiment.live) {
      return res.status(403).send('This experiment is not currently live');
    }

    const experimentPath = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', experiment.id);
    
    // Check if index.html exists
    try {
      await fs.access(path.join(experimentPath, 'index.html'));
      // If index.html exists, inject our data collection script into it
      const indexHtml = await fs.readFile(path.join(experimentPath, 'index.html'), 'utf8');
      
      // Generate session ID and get Prolific PID
      const sessionId = uuidv4();
      const prolificPid = req.query.PROLIFIC_PID || req.query.prolific_pid || null;
      
      // Inject our data collection script at the beginning of head for early execution
      const dataCollectionScript = `
      <script>
        // Injected by experiment host - DEBUG VERSION
        console.log('=== INTERCEPTION SCRIPT LOADED ===');
        console.log('Experiment ID:', "${experiment.id}");
        console.log('Session ID:', "${sessionId}");
        console.log('Script injection time:', new Date().toISOString());
        
        (function() {
          const experimentId = "${experiment.id}";
          const sessionId = "${sessionId}";
          const prolificPid = ${JSON.stringify(prolificPid)};
          const completionCode = "${experiment.completion_code || 'COMPLETED'}";
          let dataSaved = false;
          
          console.log('Interception function wrapper started');
          
          // Monitor what's happening
          window.addEventListener('error', function(e) {
            console.error('Window error:', e);
          });
          
          // Data saving function
          async function saveDataToServer(data) {
            console.log('=== saveDataToServer CALLED ===');
            console.log('Data type:', typeof data);
            console.log('Data sample:', JSON.stringify(data).substring(0, 200) + '...');
            
            if (dataSaved) {
              console.log('Data already saved, skipping');
              return;
            }
            
            try {
              console.log('Posting to:', '/run/' + experimentId + '/data');
              const response = await fetch('/run/' + experimentId + '/data', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  session_id: sessionId,
                  prolific_pid: prolificPid,
                  data: data
                })
              });
              
              console.log('Response status:', response.status);
              
              if (!response.ok) {
                throw new Error('Failed to save data');
              }
              
              dataSaved = true;
              console.log('=== DATA SAVED SUCCESSFULLY ===');
              
              // If this is a Prolific participant, redirect to completion
              if (prolificPid) {
                console.log('Prolific participant detected, redirecting to completion...');
                window.location.href = 'https://app.prolific.com/submissions/complete?cc=' + completionCode;
              } else {
                // For non-Prolific participants, redirect to completion page
                window.location.href = '/run/' + experimentId + '/complete';
              }
              
              return await response.json();
            } catch (error) {
              console.error('Error saving data:', error);
              alert('There was an error saving your data. Please contact the researcher.');
              throw error;
            }
          }
          
          // Track jsPsych loading
          let checkCount = 0;
          
          // Wait for jsPsych to load
          function interceptJsPsych() {
            checkCount++;
            console.log('Checking for jsPsych... attempt #' + checkCount);
            
            if (typeof jsPsych !== 'undefined') {
              console.log('=== jsPsych FOUND ===');
              console.log('jsPsych:', jsPsych);
              console.log('jsPsych.version:', jsPsych.version);
              console.log('jsPsych.data:', jsPsych.data);
              console.log('typeof initJsPsych:', typeof initJsPsych);
              
              // For jsPsych v8+ (uses initJsPsych function)
              if (typeof initJsPsych !== 'undefined') {
                const originalInitJsPsych = window.initJsPsych;
                window.initJsPsych = function(config) {
                  // Add our on_finish handler
                  const originalOnFinish = config ? config.on_finish : undefined;
                  if (!config) config = {};
                  
                  config.on_finish = async function(data) {
                    console.log('Experiment finished, saving data...');
                    await saveDataToServer(data.json());
                    if (originalOnFinish) originalOnFinish(data);
                  };
                  
                  // Create jsPsych instance
                  const jsPsychInstance = originalInitJsPsych(config);
                  
                  // Override the instance's data.localSave
                  if (jsPsychInstance.data) {
                    console.log('Overriding jsPsychInstance.data.localSave');
                    const originalLocalSave = jsPsychInstance.data.localSave;
                    console.log('Original localSave:', originalLocalSave);
                    
                    jsPsychInstance.data.localSave = async function(filename, format) {
                      console.log('=== LOCALSAVE INTERCEPTED ===');
                      console.log('Filename:', filename);
                      console.log('Format:', format);
                      const data = format === 'csv' ? this.get().csv() : this.get().json();
                      console.log('Calling saveDataToServer...');
                      await saveDataToServer(data);
                    };
                    
                    // Also override get().localSave
                    const originalGet = jsPsychInstance.data.get;
                    jsPsychInstance.data.get = function() {
                      const dataCollection = originalGet.call(this);
                      dataCollection.localSave = async function(filename, format) {
                        console.log('DataCollection localSave intercepted');
                        const data = format === 'csv' ? this.csv() : this.json();
                        await saveDataToServer(data);
                      };
                      return dataCollection;
                    };
                  }
                  
                  return jsPsychInstance;
                };
                console.log('jsPsych v8+ interception complete');
              }
              
              // For jsPsych v7
              else if (jsPsych.version && jsPsych.run) {
                const originalRun = jsPsych.run;
                jsPsych.run = function(timeline) {
                  // Add completion handler to timeline
                  if (Array.isArray(timeline)) {
                    timeline.push({
                      type: jsPsychHtmlKeyboardResponse,
                      stimulus: 'Saving data...',
                      choices: "NO_KEYS",
                      trial_duration: 100,
                      on_load: function() {
                        saveDataToServer(jsPsych.data.get().json());
                      }
                    });
                  }
                  return originalRun.call(this, timeline);
                };
                
                // Override localSave
                if (jsPsych.data) {
                  jsPsych.data.localSave = async function(filename, format) {
                    console.log('localSave intercepted - saving to server');
                    const data = format === 'csv' ? jsPsych.data.get().csv() : jsPsych.data.get().json();
                    await saveDataToServer(data);
                  };
                }
                console.log('jsPsych v7 interception complete');
              }
              
              // For jsPsych v6 and older
              else if (jsPsych.init) {
                const originalInit = jsPsych.init;
                jsPsych.init = function(config) {
                  const originalOnFinish = config.on_finish;
                  config.on_finish = async function() {
                    await saveDataToServer(jsPsych.data.get().json());
                    if (originalOnFinish) originalOnFinish();
                  };
                  return originalInit.call(this, config);
                };
                console.log('jsPsych v6 interception complete');
              }
              
              // Override jsPsych.data.get().localSave for all versions
              if (jsPsych.data && jsPsych.data.get) {
                const originalGet = jsPsych.data.get;
                jsPsych.data.get = function() {
                  const dataCollection = originalGet.call(this);
                  if (dataCollection.localSave) {
                    dataCollection.localSave = async function(filename, format) {
                      console.log('DataCollection localSave intercepted');
                      const data = format === 'csv' ? this.csv() : this.json();
                      await saveDataToServer(data);
                    };
                  }
                  return dataCollection;
                };
              }
              
            } else {
              // Try again in 100ms
              setTimeout(interceptJsPsych, 100);
            }
          }
          
          // Start interception
          interceptJsPsych();
          
          // Also try on DOMContentLoaded
          document.addEventListener('DOMContentLoaded', function() {
            console.log('DOMContentLoaded fired');
            interceptJsPsych();
          });
          
          // And on window load
          window.addEventListener('load', function() {
            console.log('Window load fired');
            interceptJsPsych();
          });
          
        })();
      </script>
      `;
      
      // Inject at the beginning of <head> for earliest possible execution
      let modifiedHtml;
      if (indexHtml.includes('<head>')) {
        modifiedHtml = indexHtml.replace('<head>', '<head>' + dataCollectionScript);
      } else if (indexHtml.includes('</head>')) {
        modifiedHtml = indexHtml.replace('</head>', dataCollectionScript + '</head>');
      } else {
        // If no head tag, inject at the beginning
        modifiedHtml = dataCollectionScript + indexHtml;
      }
      
      res.send(modifiedHtml);
      
    } catch (error) {
      // No index.html, check for other files
      const files = await fs.readdir(experimentPath);
      
      if (files.includes('experiment.js')) {
        // Serve our wrapper for JS experiments
        res.send(createJsExperimentWrapper(experiment));
      } else if (files.length > 0) {
        // Just redirect to the first HTML file found
        const htmlFile = files.find(f => f.endsWith('.html'));
        if (htmlFile) {
          res.redirect(`/run/${experiment.id}/assets/${htmlFile}`);
        } else {
          res.status(400).send('No valid experiment files found (index.html or experiment.js required)');
        }
      } else {
        res.status(400).send('No experiment files uploaded');
      }
    }
  } catch (error) {
    console.error('Error serving experiment:', error);
    res.status(500).send('Internal server error');
  }
});

// Helper function to create wrapper for JS experiments
function createJsExperimentWrapper(experiment) {
  const sessionId = uuidv4();
  const prolificPid = null; // Will be captured from URL params if present
  
  return `
<!DOCTYPE html>
<html>
<head>
    <title>${experiment.title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://unpkg.com/jspsych@8.2.1"></script>
    <link href="https://unpkg.com/jspsych@8.2.1/css/jspsych.css" rel="stylesheet" type="text/css" />
</head>
<body>
    <div id="jspsych-target"></div>
    <script>
      // Data collection script for JS experiments
      (function() {
        const experimentId = "${experiment.id}";
        const sessionId = "${sessionId}";
        const urlParams = new URLSearchParams(window.location.search);
        const prolificPid = urlParams.get('PROLIFIC_PID') || urlParams.get('prolific_pid');
        const completionCode = "${experiment.completion_code || 'COMPLETED'}";
        let dataSaved = false;
        
        async function saveDataToServer(data) {
          if (dataSaved) return;
          
          try {
            const response = await fetch('/run/' + experimentId + '/data', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                session_id: sessionId,
                prolific_pid: prolificPid,
                data: data
              })
            });
            
            if (!response.ok) {
              throw new Error('Failed to save data');
            }
            
            dataSaved = true;
            console.log('Data saved to server successfully');
            
            // If this is a Prolific participant, redirect to completion
            if (prolificPid) {
              console.log('Prolific participant detected, redirecting to completion...');
              window.location.href = 'https://app.prolific.com/submissions/complete?cc=' + completionCode;
            } else {
              // For non-Prolific participants, redirect to completion page
              window.location.href = '/run/' + experimentId + '/complete';
            }
            
            return await response.json();
          } catch (error) {
            console.error('Error saving data:', error);
            alert('There was an error saving your data. Please contact the researcher.');
            throw error;
          }
        }
        
        // Intercept data saving
        function interceptJsPsych() {
          // For jsPsych v8+
          if (typeof initJsPsych !== 'undefined') {
            const originalInitJsPsych = window.initJsPsych;
            window.initJsPsych = function(config) {
              const originalOnFinish = config ? config.on_finish : undefined;
              if (!config) config = {};
              
              config.on_finish = async function(data) {
                console.log('Experiment finished, saving data...');
                await saveDataToServer(data.json());
                if (originalOnFinish) originalOnFinish(data);
              };
              
              const jsPsychInstance = originalInitJsPsych(config);
              
              if (jsPsychInstance.data) {
                jsPsychInstance.data.localSave = async function(filename, format) {
                  console.log('localSave intercepted - saving to server');
                  const data = format === 'csv' ? this.get().csv() : this.get().json();
                  await saveDataToServer(data);
                };
              }
              
              return jsPsychInstance;
            };
          }
          // For older versions
          else if (typeof jsPsych !== 'undefined') {
            if (jsPsych.data) {
              jsPsych.data.localSave = function(filename, format) {
                console.log('localSave intercepted - saving to server');
                const data = format === 'csv' ? jsPsych.data.get().csv() : jsPsych.data.get().json();
                saveDataToServer(data);
              };
            }
          } else {
            setTimeout(interceptJsPsych, 100);
          }
        }
        
        interceptJsPsych();
      })();
    </script>
    <script src="/run/${experiment.id}/assets/experiment.js"></script>
</body>
</html>
  `;
}

// POST /run/:id/data - Save experiment data
router.post('/run/:id/data', express.json(), async (req, res) => {
  try {
    const { session_id, prolific_pid, data } = req.body;
    
    if (!session_id || !data) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const experiment = await Experiment.findByPk(req.params.id);
    
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Parse data if it's a string (from jsPsych.data.get().json())
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        // If parsing fails, keep as string
        parsedData = data;
      }
    }

    // Save the data to database only
    const experimentData = await ExperimentData.create({
      experiment_id: experiment.id,
      session_id,
      prolific_pid,
      data: parsedData
    });

    console.log(`Data saved to database for experiment ${experiment.id}, session ${session_id}`);

    res.json({ 
      success: true, 
      id: experimentData.id,
      message: 'Data saved successfully' 
    });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data: ' + error.message });
  }
});

// GET /run/:id/complete - Completion page
router.get('/run/:id/complete', async (req, res) => {
  try {
    const experiment = await Experiment.findByPk(req.params.id);
    
    if (!experiment) {
      return res.status(404).send('Experiment not found');
    }

    const completionCode = experiment.completion_code || 'COMPLETED';
    const prolificPid = req.query.PROLIFIC_PID || req.query.prolific_pid;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Experiment Complete</title>
    <meta charset="utf-8">
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 500px;
        }
        .code {
            font-family: monospace;
            font-size: 32px;
            background: #f0f0f0;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            user-select: all;
        }
        .button {
            background: #007bff;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
            margin-top: 20px;
        }
        .button:hover {
            background: #0056b3;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Thank You!</h1>
        <p>You have completed the experiment. Your completion code is:</p>
        <div class="code" onclick="selectText(this)">${completionCode}</div>
        <p>Click the code to select it, then copy and paste it into Prolific.</p>
        ${prolificPid ? `
            <a href="https://app.prolific.com/submissions/complete?cc=${completionCode}" class="button">
                Return to Prolific
            </a>
        ` : ''}
    </div>
    <script>
        function selectText(element) {
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
        }
    </script>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error serving completion page:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;