// services/datapipe.js
const axios = require('axios');

class DataPipeService {
  constructor() {
    this.baseURL = process.env.DATAPIPE_API_URL || 'https://pipe.jspsych.org/api';
  }

  /**
   * Create experiment on DataPipe
   * DataPipe creates an experiment ID and links it to OSF project/component
   */
  async createExperiment(datapipeCredentials, experimentData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/experiment`,
        {
          experimentName: experimentData.title,
          osiFrameworkNodeId: experimentData.datapipe_project_id,
          dataComponentId: experimentData.datapipe_component_id || experimentData.datapipe_project_id
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('DataPipe create experiment error:', error.response?.data || error.message);
      throw new Error(`Failed to create experiment on DataPipe: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Send data to DataPipe using the DataPipe experiment ID
   */
  async sendData(datapipeExperimentId, sessionId, data) {
    try {
      // DataPipe expects data in a specific format
      const response = await axios.post(
        `${this.baseURL}/data/${datapipeExperimentId}/${sessionId}`,
        data, // Send the jsPsych data directly
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

    // First, ensure experiment exists on DataPipe
    if (!experiment.datapipe_experiment_id) {
      try {
        const datapipeResponse = await this.createExperiment({}, experiment);
        // Store the DataPipe experiment ID
        experiment.datapipe_experiment_id = datapipeResponse.experimentId;
        await experiment.save();
      } catch (error) {
        throw new Error(`Failed to create experiment on DataPipe: ${error.message}`);
      }
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
   * Get experiment info from DataPipe
   */
  async getExperiment(datapipeExperimentId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/experiment/${datapipeExperimentId}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('DataPipe get experiment error:', error.response?.data || error.message);
      throw new Error(`Failed to get experiment from DataPipe: ${error.response?.data?.message || error.message}`);
    }
  }
}

module.exports = new DataPipeService();