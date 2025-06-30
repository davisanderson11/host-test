// services/prolific.js
const axios = require('axios');

class ProlificService {
  constructor() {
    this.baseURL = 'https://api.prolific.com/api/v1';
  }

  // Create headers with user's Prolific token
  getHeaders(token) {
    return {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Create a draft study on Prolific
   */
  async createStudy(token, studyData) {
    try {
      const response = await axios.post(
        `${this.baseURL}/studies/`,
        studyData,
        { headers: this.getHeaders(token) }
      );
      return response.data;
    } catch (error) {
      console.error('Prolific create study error:', JSON.stringify(error.response?.data, null, 2) || error.message);
      
      // Better error handling
      if (error.response?.data) {
        const errorData = error.response.data;
        let errorMessage = '';
        
        if (errorData.error) {
          errorMessage = `${errorData.error.title}`;
          if (errorData.error.detail) {
            // Get the actual error messages from the detail object
            for (const [field, messages] of Object.entries(errorData.error.detail)) {
              errorMessage += ` ${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`;
            }
          }
        } else {
          errorMessage = errorData.message || JSON.stringify(errorData);
        }
        
        throw new Error(`Failed to create Prolific study: ${errorMessage}`);
      }
      
      throw new Error(`Failed to create Prolific study: ${error.message}`);
    }
  }

  /**
   * Publish a study (make it live)
   */
  async publishStudy(token, studyId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/studies/${studyId}/transition/`,
        { action: 'PUBLISH' },
        { headers: this.getHeaders(token) }
      );
      return response.data;
    } catch (error) {
      console.error('Prolific publish study error:', error.response?.data || error.message);
      throw new Error(`Failed to publish Prolific study: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get study details
   */
  async getStudy(token, studyId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/studies/${studyId}/`,
        { headers: this.getHeaders(token) }
      );
      return response.data;
    } catch (error) {
      console.error('Prolific get study error:', error.response?.data || error.message);
      throw new Error(`Failed to get Prolific study: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Stop a study
   */
  async stopStudy(token, studyId) {
    try {
      const response = await axios.post(
        `${this.baseURL}/studies/${studyId}/transition/`,
        { action: 'STOP' },
        { headers: this.getHeaders(token) }
      );
      return response.data;
    } catch (error) {
      console.error('Prolific stop study error:', error.response?.data || error.message);
      throw new Error(`Failed to stop Prolific study: ${error.response?.data?.error || error.message}`);
    }
  }

  /**
   * Get workspace balance
   */
  async getBalance(token, workspaceId) {
    try {
      const response = await axios.get(
        `${this.baseURL}/workspaces/${workspaceId}/`,
        { headers: this.getHeaders(token) }
      );
      return response.data.balance;
    } catch (error) {
      console.error('Prolific get balance error:', error.response?.data || error.message);
      throw new Error(`Failed to get Prolific balance: ${error.response?.data?.error || error.message}`);
    }
  }
}

module.exports = new ProlificService();