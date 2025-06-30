// services/datapipe.js
const axios = require('axios');

class DataPipeService {
  constructor() {
    this.baseURL = process.env.DATAPIPE_API_URL || 'https://pipe.jspsych.org/api';
  }

  /**
   * Create experiment on DataPipe
   */
  async createExperiment(osfToken, experimentData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/experiments`,
        {
          experiment_id: experimentData.id,
          experiment_name: experimentData.title,
          osf_project_id: experimentData.datapipe_project_id,
          osf_component_id: experimentData.datapipe_component_id
        },
        {
          headers: {
            'Authorization': `Bearer ${osfToken}`,
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
   * Send data to DataPipe
   */
  async sendData(osfToken, experimentId, data) {
    try {
      const response = await axios.post(
        `${this.baseURL}/data`,
        {
          experiment_id: experimentId,
          data: data
        },
        {
          headers: {
            'Authorization': `Bearer ${osfToken}`,
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
  async syncExperimentData(osfToken, experiment, experimentData) {
    const results = {
      success: [],
      failed: [],
      total: experimentData.length
    };

    // First, ensure experiment exists on DataPipe
    if (!experiment.datapipe_experiment_id) {
      try {
        const datapipeExp = await this.createExperiment(osfToken, experiment);
        experiment.datapipe_experiment_id = datapipeExp.id;
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
        // Format data for DataPipe
        const formattedData = {
          session_id: participant.session_id,
          prolific_pid: participant.prolific_pid,
          participant_id: participant.id,
          data: participant.data,
          created_at: participant.created_at
        };

        await this.sendData(osfToken, experiment.id, formattedData);
        
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
   * Validate OSF token
   */
  async validateToken(osfToken) {
    try {
      const response = await axios.get(
        'https://api.osf.io/v2/users/me/',
        {
          headers: {
            'Authorization': `Bearer ${osfToken}`
          }
        }
      );
      return {
        valid: true,
        user: response.data.data.attributes.full_name
      };
    } catch (error) {
      return {
        valid: false,
        error: error.response?.data?.errors?.[0]?.detail || 'Invalid token'
      };
    }
  }
}

module.exports = new DataPipeService();