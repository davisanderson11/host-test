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

    // Generate a unique session ID
    const sessionId = uuidv4();
    
    // Get Prolific PID from URL query params
    const prolificPid = req.query.PROLIFIC_PID || req.query.prolific_pid || null;

    // Create the experiment runner HTML
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>${experiment.title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://unpkg.com/jspsych@7.3.4"></script>
    <link href="https://unpkg.com/jspsych@7.3.4/css/jspsych.css" rel="stylesheet" type="text/css" />
</head>
<body>
    <div id="jspsych-target"></div>
    <script>
        // Experiment configuration
        const experimentId = "${experiment.id}";
        const sessionId = "${sessionId}";
        const prolificPid = ${JSON.stringify(prolificPid)};
        const completionCode = "${experiment.completion_code || 'COMPLETED'}";
        
        // Data saving function
        async function saveData(data) {
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
                
                return await response.json();
            } catch (error) {
                console.error('Error saving data:', error);
                alert('There was an error saving your data. Please contact the researcher.');
            }
        }
        
        // Override jsPsych.data.get().json() to save automatically
        const originalDataGet = jsPsych.data.get;
        jsPsych.data.get = function() {
            const dataObj = originalDataGet.call(this);
            const originalJson = dataObj.json;
            dataObj.json = function() {
                const jsonData = originalJson.call(this);
                // Save data when experiment ends
                if (typeof saveData !== 'undefined') {
                    saveData(jsonData);
                }
                return jsonData;
            };
            return dataObj;
        };
    </script>
    <!-- Load the experiment script -->
    <script src="/run/${experiment.id}/assets/experiment.js"></script>
    <script>
        // Add completion code display at the end
        if (typeof timeline !== 'undefined' && Array.isArray(timeline)) {
            timeline.push({
                type: jsPsychHtmlKeyboardResponse,
                stimulus: function() {
                    // Save final data
                    const data = jsPsych.data.get().json();
                    saveData(data);
                    
                    return \`
                        <h2>Thank you for completing the experiment!</h2>
                        <p>Your completion code is:</p>
                        <h1 style="font-family: monospace; background: #f0f0f0; padding: 20px; border-radius: 5px;">
                            \${completionCode}
                        </h1>
                        <p>Please copy this code and return to Prolific to paste it.</p>
                        <p>Press any key to continue.</p>
                    \`;
                },
                on_finish: function() {
                    // Redirect to Prolific if we have the completion URL
                    if (prolificPid) {
                        window.location.href = \`https://app.prolific.co/submissions/complete?cc=\${completionCode}\`;
                    }
                }
            });
        }
    </script>
</body>
</html>
    `;
    
    res.send(html);
  } catch (error) {
    console.error('Error serving experiment:', error);
    res.status(500).send('Internal server error');
  }
});

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

    // Save the data
    const experimentData = await ExperimentData.create({
      experiment_id: experiment.id,
      session_id,
      prolific_pid,
      data: data
    });

    res.json({ 
      success: true, 
      id: experimentData.id,
      message: 'Data saved successfully' 
    });
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data' });
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