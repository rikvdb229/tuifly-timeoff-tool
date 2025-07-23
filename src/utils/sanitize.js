// src/utils/sanitize.js - Input sanitization utilities
const sanitizeHtml = require('sanitize-html');
const validator = require('validator');

/**
 * Sanitize HTML content to prevent XSS
 * @param {string} html - HTML content to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} - Sanitized HTML
 */
function sanitizeHTML(html, options = {}) {
  if (!html || typeof html !== 'string') {return '';}

  const defaultOptions = {
    allowedTags: ['b', 'i', 'em', 'strong', 'br'], // Very restrictive by default
    allowedAttributes: {},
    allowedSchemes: ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  };

  return sanitizeHtml(html, { ...defaultOptions, ...options });
}

/**
 * Sanitize plain text input (remove HTML completely)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') {return '';}

  // Remove all HTML tags and decode entities
  return sanitizeHtml(text, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  }).trim();
}

/**
 * Sanitize email input
 * @param {string} email - Email to sanitize
 * @returns {string|null} - Sanitized email or null if invalid
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') {return null;}

  const cleaned = email.toLowerCase().trim();
  return validator.isEmail(cleaned) ? cleaned : null;
}

/**
 * Sanitize user signature (allow basic formatting)
 * @param {string} signature - User signature
 * @returns {string} - Sanitized signature
 */
function sanitizeSignature(signature) {
  if (!signature || typeof signature !== 'string') {return '';}

  return sanitizeHtml(signature, {
    allowedTags: ['br'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  });
}

/**
 * Sanitize employee code (alphanumeric only)
 * @param {string} code - Employee code
 * @returns {string} - Sanitized code
 */
function sanitizeEmployeeCode(code) {
  if (!code || typeof code !== 'string') {return '';}

  // Allow only alphanumeric characters
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Sanitize custom message (remove scripts but allow basic formatting)
 * @param {string} message - Custom message
 * @returns {string} - Sanitized message
 */
function sanitizeCustomMessage(message) {
  if (!message || typeof message !== 'string') {return '';}

  return sanitizeHtml(message, {
    allowedTags: ['br', 'b', 'i', 'strong', 'em'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  });
}

/**
 * Sanitize flight number (TB prefix pattern)
 * @param {string} flightNumber - Flight number
 * @returns {string} - Sanitized flight number
 */
function sanitizeFlightNumber(flightNumber) {
  if (!flightNumber || typeof flightNumber !== 'string') {return '';}

  // Remove HTML and keep only alphanumeric chars, then uppercase
  const cleaned = sanitizeText(flightNumber)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();

  // Validate TB prefix pattern
  if (cleaned && !cleaned.startsWith('TB')) {
    return ''; // Return empty if doesn't match pattern
  }

  return cleaned;
}

/**
 * Sanitize status enum values
 * @param {string} status - Status value
 * @returns {string|null} - Sanitized status or null if invalid
 */
function sanitizeStatus(status) {
  if (!status || typeof status !== 'string') {return null;}

  const cleaned = status.toUpperCase().trim();
  const validStatuses = ['APPROVED', 'DENIED', 'PENDING'];

  return validStatuses.includes(cleaned) ? cleaned : null;
}

/**
 * Sanitize email preference enum values
 * @param {string} preference - Email preference
 * @returns {string|null} - Sanitized preference or null if invalid
 */
function sanitizeEmailPreference(preference) {
  if (!preference || typeof preference !== 'string') {return null;}

  const cleaned = preference.toLowerCase().trim();
  const validPreferences = ['automatic', 'manual'];

  return validPreferences.includes(cleaned) ? cleaned : null;
}

/**
 * Sanitize redirect URL (basic validation for internal routes)
 * @param {string} url - URL to sanitize
 * @returns {string} - Sanitized URL or empty string if invalid
 */
function sanitizeRedirectUrl(url) {
  if (!url || typeof url !== 'string') {return '';}

  // Remove HTML and trim
  const cleaned = sanitizeText(url).trim();

  // Only allow internal routes starting with / but not //
  if (!cleaned.startsWith('/') || cleaned.startsWith('//')) {return '';}

  // Basic URL validation - only allow safe characters
  if (!/^[/a-zA-Z0-9/_?&=.-]*$/.test(cleaned)) {return '';}

  return cleaned;
}

/**
 * Middleware to sanitize request body
 * @param {Array} fields - Fields to sanitize
 * @returns {Function} - Express middleware
 */
function sanitizeRequestBody(fields = []) {
  return (req, res, next) => {
    if (req.body && typeof req.body === 'object') {
      fields.forEach(field => {
        if (req.body[field]) {
          switch (field) {
            case 'email':
              req.body[field] = sanitizeEmail(req.body[field]);
              break;
            case 'signature':
              req.body[field] = sanitizeSignature(req.body[field]);
              break;
            case 'code':
              req.body[field] = sanitizeEmployeeCode(req.body[field]);
              break;
            case 'customMessage':
              req.body[field] = sanitizeCustomMessage(req.body[field]);
              break;
            case 'flightNumber':
              req.body[field] = sanitizeFlightNumber(req.body[field]);
              break;
            case 'status':
              req.body[field] = sanitizeStatus(req.body[field]);
              break;
            case 'preference':
            case 'emailPreference':
              req.body[field] = sanitizeEmailPreference(req.body[field]);
              break;
            case 'redirectTo':
              req.body[field] = sanitizeRedirectUrl(req.body[field]);
              break;
            default:
              req.body[field] = sanitizeText(req.body[field]);
          }
        }
      });
    }
    next();
  };
}

module.exports = {
  sanitizeHTML,
  sanitizeText,
  sanitizeEmail,
  sanitizeSignature,
  sanitizeEmployeeCode,
  sanitizeCustomMessage,
  sanitizeFlightNumber,
  sanitizeStatus,
  sanitizeEmailPreference,
  sanitizeRedirectUrl,
  sanitizeRequestBody,
};
