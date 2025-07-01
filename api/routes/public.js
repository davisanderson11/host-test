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
      
      // Inject our data collection script before the closing body tag
      const dataCollectionScript = `
      <script>
        // Injected by experiment host - Enhanced interception
        (function() {
          const experimentId = "${experiment.id}";
          const sessionId = "${sessionId}";
          const prolificPid = ${JSON.stringify(prolificPid)};
          const completionCode = "${experiment.completion_code || 'COMPLETED'}";
          let dataSaved = false;
          
          // Monitor for when jsPsych displays data on the page
          function checkForDataDisplay() {
            // Check if the page content looks like JSON data
            const bodyText = document.body.innerText || document.body.textContent;
            
            // Simple check: starts with [ and contains trial data
            if (bodyText && bodyText.trim().startsWith('[') && bodyText.includes('"trial_type"')) {
              console.log('jsPsych data display detected! Capturing data...');
              
              try {
                // Parse the JSON data
                const data = JSON.parse(bodyText.trim());
                console.log('Successfully parsed experiment data, saving to server...');
                
                // Save to server
                saveDataToServer(data);
                
                // Replace the page content with a success message
                document.body.innerHTML = `
                  <div style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
                    <h1>Experiment Complete!</h1>
                    <p>Your data has been saved successfully.</p>
                    <p>Completion Code: <strong style="font-size: 24px; background: #f0f0f0; padding: 10px; border-radius: 5px;">${completionCode}</strong></p>
                    ${prolificPid ? '<p><a href="https://app.prolific.co/submissions/complete?cc=' + completionCode + '">Return to Prolific</a></p>' : ''}
                  </div>
                `;
                
                // Clear the interval since we found the data
                clearInterval(dataCheckInterval);
              } catch (e) {
                // Not valid JSON yet, keep checking
              }
            }
          }
          
          // Check for data display every 500ms
          let dataCheckInterval = setInterval(checkForDataDisplay, 500);
          
          // Also check on DOM changes
          const observer = new MutationObserver(checkForDataDisplay);
          observer.observe(document.body, { childList: true, subtree: true });
          
          // Stop checking after 5 minutes (experiment should be done by then)
          setTimeout(() => {
            clearInterval(dataCheckInterval);
            observer.disconnect();
          }, 5 * 60 * 1000);
          
          // Data saving function
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
              return await response.json();
            } catch (error) {
              console.error('Error saving data:', error);
              alert('There was an error saving your data. Please contact the researcher.');
              throw error;
            }
          }
          
          
          // Wait for jsPsych to load
          function interceptJsPsych() {
            if (typeof jsPsych !== 'undefined') {
              console.log('jsPsych detected, version:', jsPsych.version);
              
              // For jsPsych v8+ (uses initJsPsych function)
              if (typeof initJsPsych !== 'undefined') {
                const originalInitJsPsych = window.initJsPsych;
                window.initJsPsych = function(config) {
                  // Add our on_finish handler
                  const originalOnFinish = config ? config.on_finish : undefined;
                  if (!config) config = {};
                  
                  config.on_finish = function(data) {
                    console.log('Experiment finished, saving data...');
                    saveDataToServer(data.json());
                    if (originalOnFinish) originalOnFinish(data);
                  };
                  
                  // Create jsPsych instance
                  const jsPsychInstance = originalInitJsPsych(config);
                  
                  // Override the instance's data.localSave
                  if (jsPsychInstance.data) {
                    jsPsychInstance.data.localSave = function(filename, format) {
                      console.log('localSave intercepted - saving to server');
                      const data = format === 'csv' ? this.get().csv() : this.get().json();
                      saveDataToServer(data);
                    };
                    
                    // Also override get().localSave
                    const originalGet = jsPsychInstance.data.get;
                    jsPsychInstance.data.get = function() {
                      const dataCollection = originalGet.call(this);
                      dataCollection.localSave = function(filename, format) {
                        console.log('DataCollection localSave intercepted');
                        const data = format === 'csv' ? this.csv() : this.json();
                        saveDataToServer(data);
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
                  jsPsych.data.localSave = function(filename, format) {
                    console.log('localSave intercepted - saving to server');
                    const data = format === 'csv' ? jsPsych.data.get().csv() : jsPsych.data.get().json();
                    saveDataToServer(data);
                  };
                }
                console.log('jsPsych v7 interception complete');
              }
              
              // For jsPsych v6 and older
              else if (jsPsych.init) {
                const originalInit = jsPsych.init;
                jsPsych.init = function(config) {
                  const originalOnFinish = config.on_finish;
                  config.on_finish = function() {
                    saveDataToServer(jsPsych.data.get().json());
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
                    dataCollection.localSave = function(filename, format) {
                      console.log('DataCollection localSave intercepted');
                      const data = format === 'csv' ? this.csv() : this.json();
                      saveDataToServer(data);
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
          document.addEventListener('DOMContentLoaded', interceptJsPsych);
          
          // And on window load
          window.addEventListener('load', interceptJsPsych);
        })();
      </script>
      `;
      
      // Inject before </body> or at the end if no body tag
      let modifiedHtml;
      if (indexHtml.includes('</body>')) {
        modifiedHtml = indexHtml.replace('</body>', dataCollectionScript + '</body>');
      } else {
        modifiedHtml = indexHtml + dataCollectionScript;
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
              
              config.on_finish = function(data) {
                console.log('Experiment finished, saving data...');
                saveDataToServer(data.json());
                if (originalOnFinish) originalOnFinish(data);
              };
              
              const jsPsychInstance = originalInitJsPsych(config);
              
              if (jsPsychInstance.data) {
                jsPsychInstance.data.localSave = function(filename, format) {
                  console.log('localSave intercepted - saving to server');
                  const data = format === 'csv' ? this.get().csv() : this.get().json();
                  saveDataToServer(data);
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

    // Save the data to database
    const experimentData = await ExperimentData.create({
      experiment_id: experiment.id,
      session_id,
      prolific_pid,
      data: parsedData
    });

    // Also save to file system in data folder
    const dataDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || './uploads', 'experiments', experiment.id, 'data');
    
    // Create data directory if it doesn't exist
    try {
      await fs.mkdir(dataDir, { recursive: true });
      
      // Save data file with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${session_id}_${timestamp}.json`;
      const filepath = path.join(dataDir, filename);
      
      await fs.writeFile(filepath, JSON.stringify(parsedData, null, 2));
      console.log(`Data saved to file: ${filepath}`);
    } catch (fileError) {
      console.error('Error saving data file:', fileError);
      // Continue even if file save fails - database save is primary
    }

    console.log(`Data saved for experiment ${experiment.id}, session ${session_id}`);

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
        ${req.query.PROLIFIC_PID ? `
            <a href="https://app.prolific.co/submissions/complete?cc=${completionCode}" class="button">
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