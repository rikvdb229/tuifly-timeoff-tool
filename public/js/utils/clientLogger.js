/**
 * Client-side logging utility
 * Provides structured logging for browser JavaScript
 */
class ClientLogger {
  constructor() {
    this.isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    this.sessionId = this.generateSessionId();
  }

  generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  createLogEntry(level, message, meta = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      sessionId: this.sessionId,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...meta
    };
  }

  // Send logs to server in production
  async sendToServer(logEntry) {
    if (this.isProduction) {
      try {
        await fetch('/api/logs/client', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(logEntry),
          credentials: 'same-origin'
        });
      } catch (error) {
        // Fallback to console if server logging fails
        console.warn('Failed to send log to server:', error);
      }
    }
  }

  error(message, meta = {}) {
    const logEntry = this.createLogEntry('error', message, meta);
    console.error(`[${logEntry.timestamp}] ERROR:`, message, meta);
    this.sendToServer(logEntry);
  }

  warn(message, meta = {}) {
    const logEntry = this.createLogEntry('warn', message, meta);
    console.warn(`[${logEntry.timestamp}] WARN:`, message, meta);
    this.sendToServer(logEntry);
  }

  info(message, meta = {}) {
    const logEntry = this.createLogEntry('info', message, meta);
    console.info(`[${logEntry.timestamp}] INFO:`, message, meta);
    this.sendToServer(logEntry);
  }

  debug(message, meta = {}) {
    const logEntry = this.createLogEntry('debug', message, meta);
    if (!this.isProduction) {
      console.log(`[${logEntry.timestamp}] DEBUG:`, message, meta);
    }
    // Only send debug logs in development
    if (!this.isProduction) {
      this.sendToServer(logEntry);
    }
  }

  // API call logging
  logApiCall(method, url, responseStatus, responseTime, meta = {}) {
    this.info('API call completed', {
      method,
      url,
      responseStatus,
      responseTime: `${responseTime}ms`,
      ...meta
    });
  }

  // User action logging
  logUserAction(action, details = {}) {
    this.info('User action', {
      action,
      ...details
    });
  }

  // Error with context
  logError(error, context = {}) {
    this.error('Application error', {
      error: error.message,
      stack: error.stack,
      ...context
    });
  }

  // Performance logging
  logPerformance(operation, duration, meta = {}) {
    if (duration > 1000) {
      this.warn('Slow operation detected', {
        operation,
        duration: `${duration}ms`,
        ...meta
      });
    } else {
      this.debug('Performance metric', {
        operation,
        duration: `${duration}ms`,
        ...meta
      });
    }
  }
}

// Create global logger instance
window.logger = new ClientLogger();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientLogger;
}