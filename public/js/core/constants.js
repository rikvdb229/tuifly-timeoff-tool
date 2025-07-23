/**
 * TUIfly Time-Off Tool - Application Constants
 * Centralized constants to replace magic numbers and strings throughout the application
 */

// ===================================================================
// AUTHENTICATION & SESSION
// ===================================================================
const AUTH = {
  MAX_LOGIN_ATTEMPTS: 5,
  SESSION_TIMEOUT_MS: 24 * 60 * 60 * 1000, // 24 hours
  TOKEN_REFRESH_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
  LOCKOUT_DURATION_MS: 15 * 60 * 1000, // 15 minutes
};

// ===================================================================
// HTTP & API
// ===================================================================
const HTTP = {
  REQUEST_TIMEOUT_MS: 30 * 1000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  UPLOAD_MAX_SIZE_MB: 10,
  RATE_LIMIT_REQUESTS: 100,
  RATE_LIMIT_WINDOW_MS: 60 * 1000, // 1 minute
};

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

// ===================================================================
// TIME-OFF REQUEST SYSTEM
// ===================================================================
const REQUEST_TYPES = {
  VACATION: 'vacation',
  SICK_LEAVE: 'sick_leave',
  PERSONAL: 'personal',
  TRAINING: 'training',
  COMPENSATORY: 'compensatory',
  OTHER: 'other',
};

const REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DENIED: 'denied',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

const REQUEST_PRIORITY = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

// ===================================================================
// BUSINESS RULES
// ===================================================================
const BUSINESS_RULES = {
  MIN_ADVANCE_DAYS: 60,
  MAX_ADVANCE_DAYS: 120,
  MAX_DAYS_PER_REQUEST: 4,
  MAX_CONSECUTIVE_REQUESTS: 2,
  MIN_PILOT_CODE_LENGTH: 3,
  MAX_PILOT_CODE_LENGTH: 3,
  MAX_NAME_LENGTH: 100,
  MAX_SIGNATURE_LENGTH: 500,
  MIN_SIGNATURE_LENGTH: 2,
};

// ===================================================================
// CALENDAR & DATES
// ===================================================================
const CALENDAR = {
  DAYS_IN_WEEK: 7,
  MONTHS_IN_YEAR: 12,
  DAYS_TO_SHOW: 90, // Default calendar view range
  REFRESH_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes
  CONFLICT_CHECK_BUFFER_HOURS: 24,
  WEEKEND_DAYS: [0, 6], // Sunday = 0, Saturday = 6
};

const DATE_FORMATS = {
  DISPLAY: 'MMM dd, yyyy',
  INPUT: 'yyyy-MM-dd',
  DATETIME: 'yyyy-MM-dd HH:mm:ss',
  API: 'yyyy-MM-ddTHH:mm:ss.fffZ',
  SHORT: 'MMM dd',
  TIME: 'HH:mm',
};

// ===================================================================
// EMAIL SYSTEM
// ===================================================================
const EMAIL = {
  TYPES: {
    MANUAL: 'manual',
    AUTOMATIC: 'automatic',
  },
  TEMPLATE_TYPES: {
    REQUEST_SUBMITTED: 'request_submitted',
    REQUEST_APPROVED: 'request_approved',
    REQUEST_DENIED: 'request_denied',
    REMINDER: 'reminder',
    CONFLICT_ALERT: 'conflict_alert',
  },
  MAX_SUBJECT_LENGTH: 100,
  MAX_BODY_LENGTH: 2000,
  RETRY_ATTEMPTS: 3,
  SEND_TIMEOUT_MS: 30 * 1000,
};

// ===================================================================
// USER INTERFACE
// ===================================================================
const UI = {
  TOAST_DURATION_MS: 5000,
  ERROR_TOAST_DURATION_MS: 8000,
  MODAL_ANIMATION_MS: 300,
  DEBOUNCE_DELAY_MS: 500,
  LOADING_SPINNER_DELAY_MS: 200,
  AUTO_SAVE_INTERVAL_MS: 30 * 1000,
  PAGINATION_DEFAULT_SIZE: 20,
  PAGINATION_MAX_SIZE: 100,
};

const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  PRIMARY: 'primary',
};

const MODAL_TYPES = {
  INFO: 'info',
  WARNING: 'warning',
  DANGER: 'danger',
  SUCCESS: 'success',
};

// ===================================================================
// VALIDATION PATTERNS
// ===================================================================
const VALIDATION = {
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PILOT_CODE_PATTERN: /^[A-Z]{3}$/,
  PHONE_PATTERN: /^[+]?[1-9][\d]{0,15}$/,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  TIME_PATTERN: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
};

const VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  EMAIL_INVALID: 'Please enter a valid email address',
  PILOT_CODE_INVALID: 'Pilot code must be exactly 3 uppercase letters',
  DATE_INVALID: 'Please enter a valid date',
  DATE_TOO_EARLY: 'Date must be at least {days} days in advance',
  DATE_TOO_LATE: 'Date cannot be more than {days} days in advance',
  MAX_DAYS_EXCEEDED: 'Cannot request more than {days} consecutive days',
  NAME_TOO_LONG: 'Name cannot exceed {length} characters',
  SIGNATURE_TOO_SHORT: 'Signature must be at least {length} characters',
  SIGNATURE_TOO_LONG: 'Signature cannot exceed {length} characters',
};

// ===================================================================
// STORAGE KEYS
// ===================================================================
const STORAGE_KEYS = {
  USER_PREFERENCES: 'tuifly_user_preferences',
  ONBOARDING_DATA: 'tuifly_onboarding_data',
  CALENDAR_FILTER: 'tuifly_calendar_filter',
  DRAFT_REQUEST: 'tuifly_draft_request',
  EMAIL_PREFERENCE: 'tuifly_email_preference',
  LAST_LOGIN: 'tuifly_last_login',
};

// ===================================================================
// APPLICATION SETTINGS
// ===================================================================
const APP = {
  NAME: 'TUIfly Time-Off Tool',
  VERSION: '2.0.0',
  SUPPORT_EMAIL: 'scheduling@tuifly.be',
  MAX_FILE_UPLOAD_MB: 5,
  ALLOWED_FILE_TYPES: ['.pdf', '.doc', '.docx', '.jpg', '.png'],
  SESSION_WARNING_MS: 5 * 60 * 1000, // Warn 5 minutes before session expires
  MAINTENANCE_CHECK_INTERVAL_MS: 60 * 1000, // Check every minute
};

// Theme constants removed - theme switching not implemented

// Language constants removed - internationalization not implemented

// ===================================================================
// ERROR CODES
// ===================================================================
const ERROR_CODES = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  PARSE_ERROR: 'PARSE_ERROR',

  // Authentication errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',

  // Business logic errors
  REQUEST_CONFLICT: 'REQUEST_CONFLICT',
  INSUFFICIENT_DAYS: 'INSUFFICIENT_DAYS',
  BLACKOUT_PERIOD: 'BLACKOUT_PERIOD',
  MAX_REQUESTS_EXCEEDED: 'MAX_REQUESTS_EXCEEDED',

  // System errors
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  MAINTENANCE_MODE: 'MAINTENANCE_MODE',
};

// ===================================================================
// FEATURE FLAGS
// ===================================================================
const FEATURES = {
  GMAIL_INTEGRATION: true,
  CALENDAR_SYNC: true,
  MOBILE_NOTIFICATIONS: false,
  ADVANCED_REPORTING: false,
  TEAM_CALENDAR: true,
  BULK_OPERATIONS: false,
  API_V2: false,
};

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

// Make constants available globally for backwards compatibility
if (typeof window !== 'undefined') {
  window.APP_CONSTANTS = {
    AUTH,
    HTTP,
    HTTP_STATUS,
    REQUEST_TYPES,
    REQUEST_STATUS,
    REQUEST_PRIORITY,
    BUSINESS_RULES,
    CALENDAR,
    DATE_FORMATS,
    EMAIL,
    UI,
    TOAST_TYPES,
    MODAL_TYPES,
    VALIDATION,
    VALIDATION_MESSAGES,
    STORAGE_KEYS,
    APP,
    // THEMES and LANGUAGES removed - features not implemented
    ERROR_CODES,
    FEATURES,
  };
}
