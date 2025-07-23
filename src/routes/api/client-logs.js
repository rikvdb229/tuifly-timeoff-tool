// src/routes/api/client-logs.js - Handle client-side logging
const express = require('express');
const { createLogger } = require('../../utils/logger');
const router = express.Router();

const clientLogLogger = createLogger({ component: 'clientLogs' });

// Endpoint to receive client-side logs
router.post('/client', (req, res) => {
  try {
    const { level, message, sessionId, url, userAgent, ...meta } = req.body;

    // Add server-side context
    const logContext = {
      ...meta,
      clientSessionId: sessionId,
      clientUrl: url,
      clientUserAgent: userAgent,
      serverSessionId: req.sessionID,
      userId: req.user?.id,
      ip: req.ip,
      timestamp: new Date().toISOString(),
    };

    // Log based on level
    switch (level) {
      case 'error':
        clientLogLogger.error(`CLIENT: ${message}`, logContext);
        break;
      case 'warn':
        clientLogLogger.warn(`CLIENT: ${message}`, logContext);
        break;
      case 'info':
        clientLogLogger.info(`CLIENT: ${message}`, logContext);
        break;
      case 'debug':
        clientLogLogger.debug(`CLIENT: ${message}`, logContext);
        break;
      default:
        clientLogLogger.info(`CLIENT: ${message}`, logContext);
    }

    res.json({ success: true });
  } catch (error) {
    clientLogLogger.logError(error, {
      operation: 'receiveClientLog',
      userId: req.user?.id,
      body: req.body,
    });
    res.status(500).json({ success: false, error: 'Failed to log message' });
  }
});

module.exports = router;