// services/datapipe.js
const axios = require('axios');

class DataPipeService {
  constructor() {
    // DataPipe API v2 endpoint
    this.baseURL = process.env.DATAPIPE_API_URL || 'https://pipe.jspsych.org/api';
  }

  /**
   * NOTE: DataPipe does not support creating experiments via API.
   * Experiments must be created manually at https://pipe.jspsych.org
   * This method is kept for future use if the API adds this functionality.
   */
  async createExperiment(datapipeCredentials, experimentData) {
    throw new Error(
      'DataPipe experiments must be created manually at https://pipe.jspsych.org. ' +
      'After creating the experiment, use the DataPipe experiment ID to configure this experiment.'
    );
  }

  /**
   * Send data to DataPipe using the DataPipe experiment ID
   */
  async sendData(datapipeExperimentId, sessionId, data) {
    try {
      // DataPipe expects data as a text string with experimentID and filename
      const response = await axios.post(
        `${this.baseURL}/data`,
        {
          experimentID: datapipeExperimentId,
          filename: `${sessionId}.json`,
          data: JSON.stringify(data) // Convert to string as required by API
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('DataPipe send data error:', error.response?.data || error.message);
      throw new Error(`Failed to send data to DataPipe: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Sync all unsync'd data for an experiment
   */
  async syncExperimentData(experiment, experimentData) {
    const results = {
      success: [],
      failed: [],
      total: experimentData.length
    };

    // Ensure experiment has DataPipe ID configured
    if (!experiment.datapipe_experiment_id) {
      throw new Error(
        'DataPipe experiment ID not configured. Please create the experiment at https://pipe.jspsych.org ' +
        'and configure it using the /datapipe/config endpoint with the DataPipe experiment ID.'
      );
    }

    // Send each participant's data
    for (const participant of experimentData) {
      if (participant.synced_to_osf) {
        continue; // Skip already synced data
      }

      try {
        // Send to DataPipe using the DataPipe experiment ID
        await this.sendData(
          experiment.datapipe_experiment_id,
          participant.session_id,
          participant.data
        );
        
        // Mark as synced
        participant.synced_to_osf = true;
        participant.synced_at = new Date();
        await participant.save();
        
        results.success.push(participant.id);
      } catch (error) {
        console.error(`Failed to sync participant ${participant.id}:`, error);
        results.failed.push({
          participant_id: participant.id,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get condition assignment from DataPipe
   */
  async getCondition(datapipeExperimentId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/condition`,
        {
          experimentID: datapipeExperimentId
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('DataPipe get condition error:', error.response?.data || error.message);
      throw new Error(`Failed to get condition from DataPipe: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new DataPipeService();