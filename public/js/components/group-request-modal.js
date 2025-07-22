/**
 * TUIfly Time-Off Tool - Group Request Modal Component
 * Handles group request modal functionality
 */

// Update global JavaScript variables with environment values
if (typeof window.TUIFLY_CONFIG === 'undefined') {
  window.TUIFLY_CONFIG = {};
}

/**
 * Updates the global TUIfly configuration with server-rendered data
 * @param {Object} config - Configuration object from server
 * @param {string} config.APPROVER_EMAIL - Email address of the approver
 * @param {string} config.EMPLOYEE_CODE - Employee code
 * @param {string} config.EMPLOYEE_NAME - Employee name
 * @param {number} config.MIN_ADVANCE_DAYS - Minimum advance notice days
 * @param {number} config.MAX_ADVANCE_DAYS - Maximum advance notice days
 * @param {number} config.MAX_DAYS_PER_REQUEST - Maximum days per request
 * @returns {void}
 */
window.updateTUIFlyConfig = function(config) {
  window.TUIFLY_CONFIG = {
    ...window.TUIFLY_CONFIG,
    ...config
  };
};

/**
 * Updates the character counter display for the custom message textarea
 * @param {number} length - Current character count
 * @returns {void}
 */
function updateMessageCounter(length) {
  const counter = document.getElementById('messageCounter');
  if (counter) {
    counter.textContent = length;
  }
}

/**
 * Updates the email preview section based on current form data
 * This function is expanded by calendar JavaScript for real preview functionality
 * @returns {void}
 */
function updateRequestPreview() {
  // This function will be expanded in the calendar JavaScript to show real preview
}

/**
 * Submits a group time-off request
 * Implementation is handled by calendar.js for actual form processing
 * @returns {Promise<void>}
 * @throws {Error} When submission fails
 */
async function submitGroupRequest() {
  try {
    // Implementation will be in calendar.js
  } catch (error) {
    console.error('Error submitting group request:', error);
  }
}

// Event delegation for modal interactions
document.addEventListener('DOMContentLoaded', function() {
  // Handle textarea input for message counter and preview
  document.addEventListener('input', function(e) {
    if (e.target.matches('#customMessage')) {
      updateMessageCounter(e.target.value.length);
      updateRequestPreview();
    }
  });
  
  // Handle submit button click
  document.addEventListener('click', function(e) {
    if (e.target.matches('[data-action="submitGroupRequest"]') || 
        e.target.closest('[data-action="submitGroupRequest"]')) {
      e.preventDefault();
      submitGroupRequest();
    }
  });
});

// Make functions globally available
window.updateMessageCounter = updateMessageCounter;
window.updateRequestPreview = updateRequestPreview;
window.submitGroupRequest = submitGroupRequest;