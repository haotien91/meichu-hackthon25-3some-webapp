/**
 * API Service for communicating with Python FastAPI backend
 * Provides Mi Band BLE device scanning and heart rate monitoring
 */

// API Base URL from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_HEART_RATE_API_URL || 'http://localhost:8000/api';

// Debug logging
if (process.env.NEXT_PUBLIC_DEBUG_HEART_RATE === 'true') {
  console.log('🔧 Heart Rate API Config:', {
    baseUrl: API_BASE_URL,
    reconnectDelay: process.env.NEXT_PUBLIC_HEART_RATE_STREAM_RECONNECT_DELAY,
    timeout: process.env.NEXT_PUBLIC_HEART_RATE_CONNECTION_TIMEOUT
  });
}

class ApiService {
  constructor() {
    this.eventSource = null;
    this.listeners = new Map();
  }

  // Device management
  async getDevices() {
    try {
      const response = await fetch(`${API_BASE_URL}/devices`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching devices:', error);
      throw error;
    }
  }

  async selectDevice(deviceId) {
    try {
      const response = await fetch(`${API_BASE_URL}/devices/${deviceId}/select`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error selecting device:', error);
      throw error;
    }
  }

  // Heart rate data
  async getCurrentHeartRate() {
    try {
      const response = await fetch(`${API_BASE_URL}/heartrate/current`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching current heart rate:', error);
      throw error;
    }
  }

  // Real-time data streaming using Server-Sent Events
  startHeartRateStream() {
    if (this.eventSource) {
      this.stopHeartRateStream();
    }

    console.log('🔗 Starting heart rate stream...');
    this.eventSource = new EventSource(`${API_BASE_URL}/heartrate/stream`);

    this.eventSource.onopen = (event) => {
      console.log('✅ Heart rate stream connected');
      this.emit('connected', event);
    };

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('❤️ Heart rate data:', data);
        this.emit('heartRate', data);
      } catch (error) {
        console.error('Error parsing heart rate data:', error);
      }
    };

    this.eventSource.addEventListener('heartbeat', (event) => {
      this.emit('heartbeat', { timestamp: event.data });
    });

    this.eventSource.addEventListener('error', (event) => {
      console.error('❌ Heart rate stream error:', event.data);
      this.emit('error', { message: event.data });
    });

    this.eventSource.onerror = (event) => {
      console.error('❌ EventSource error:', event);
      this.emit('disconnected', event);

      // Attempt to reconnect after configured delay
      const reconnectDelay = parseInt(process.env.NEXT_PUBLIC_HEART_RATE_STREAM_RECONNECT_DELAY) || 3000;
      setTimeout(() => {
        if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
          console.log('🔄 Attempting to reconnect...');
          this.startHeartRateStream();
        }
      }, reconnectDelay);
    };

    return this.eventSource;
  }

  stopHeartRateStream() {
    if (this.eventSource) {
      console.log('🔌 Stopping heart rate stream...');
      this.eventSource.close();
      this.eventSource = null;
      this.emit('disconnected');
    }
  }

  // Scanning control
  async getScanningStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/scanning/status`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Error fetching scanning status:', error);
      throw error;
    }
  }

  async restartScanning() {
    try {
      const response = await fetch(`${API_BASE_URL}/scanning/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error restarting scanning:', error);
      throw error;
    }
  }

  // Event emitter functionality
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in event callback:', error);
        }
      });
    }
  }

  // Utility methods
  isConnected() {
    return this.eventSource && this.eventSource.readyState === EventSource.OPEN;
  }

  getConnectionState() {
    if (!this.eventSource) return 'CLOSED';

    switch (this.eventSource.readyState) {
      case EventSource.CONNECTING:
        return 'CONNECTING';
      case EventSource.OPEN:
        return 'OPEN';
      case EventSource.CLOSED:
        return 'CLOSED';
      default:
        return 'UNKNOWN';
    }
  }

  // Cleanup
  disconnect() {
    this.stopHeartRateStream();
    this.listeners.clear();
  }
}

// Export singleton instance
const apiService = new ApiService();
export default apiService;