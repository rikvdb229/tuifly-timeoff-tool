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
window.updateTUIFlyConfig = function (config) {
  window.TUIFLY_CONFIG = {
    ...window.TUIFLY_CONFIG,
    ...config,
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
 * Updates the modal UI based on user's email preference
 * @param {string} emailMode - User's email preference ('automatic' or 'manual')
 * @returns {void}
 */
function updateModalForEmailMode(emailMode) {
  const autoPreview = document.getElementById('autoModePreview');
  const manualCopy = document.getElementById('manualModeEmailCopy');
  const autoButton = document.getElementById('submitGroupRequest');
  const manualButton = document.getElementById('markAsSentAndCreate');

  if (emailMode === 'manual') {
    // Show manual mode UI
    if (autoPreview) {autoPreview.style.display = 'none';}
    if (manualCopy) {manualCopy.style.display = 'block';}
    if (autoButton) {autoButton.style.display = 'none';}
    if (manualButton) {manualButton.style.display = 'inline-block';}

    // Generate email content for manual mode
    generateManualEmailContent();
  } else {
    // Show auto mode UI (default)
    if (autoPreview) {autoPreview.style.display = 'block';}
    if (manualCopy) {manualCopy.style.display = 'none';}
    if (autoButton) {autoButton.style.display = 'inline-block';}
    if (manualButton) {manualButton.style.display = 'none';}
  }
}

/**
 * Generates email content for manual mode display from selected dates
 * @returns {void}
 */
function generateManualEmailContent() {
  if (!window.selectedDates || window.selectedDates.length === 0) {return;}

  // Generate email content directly from selected dates
  const firstDate = new Date(window.selectedDates[0].date);
  const month = firstDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Generate subject
  const userCode = window.currentUserData?.code || 'RVB';
  const subject = `${userCode} - CREW REQUEST - ${month}`;

  // Generate body
  const bodyLines = ['Dear,', ''];

  window.selectedDates.forEach(dateObj => {
    let line = `${dateObj.date} - `;

    // Format request type
    switch (dateObj.type) {
      case 'REQ_DO':
        line += 'REQ DO';
        break;
      case 'PM_OFF':
        line += 'PM OFF';
        break;
      case 'AM_OFF':
        line += 'AM OFF';
        break;
      case 'FLIGHT':
        line += 'FLIGHT';
        break;
      default:
        line += dateObj.type;
    }

    // Add flight number if exists
    if (dateObj.flightNumber) {
      line += ` ${dateObj.flightNumber}`;
    }

    bodyLines.push(line);
  });

  // Add custom message if exists
  const customMessage = document.getElementById('customMessage')?.value.trim();
  if (customMessage) {
    bodyLines.push('');
    bodyLines.push(customMessage);
  }

  // Add signature
  bodyLines.push('');
  bodyLines.push(window.currentUserData?.signature || 'Brgds,\nYour Name');

  const body = bodyLines.join('\n');

  // Populate manual email fields
  const subjectField = document.getElementById('manualEmailSubject');
  const bodyField = document.getElementById('manualEmailBody');

  if (subjectField) {subjectField.value = subject;}
  if (bodyField) {bodyField.value = body;}
}

/**
 * Handles marking email as sent and creating the request
 * @returns {Promise<void>}
 */
async function markAsSentAndCreate() {
  if (window.isSubmitting) {return;}

  // Implementation will be in calendar-requests.js
  if (window.submitGroupRequestManual) {
    await window.submitGroupRequestManual();
  } else {
    window.logger?.error('Manual submission function not available');
  }
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
    window.logger?.error('Error submitting group request:', error);
  }
}

// Event delegation for modal interactions
document.addEventListener('DOMContentLoaded', function () {
  // Handle textarea input for message counter and preview
  document.addEventListener('input', function (e) {
    if (e.target.matches('#customMessage')) {
      updateMessageCounter(e.target.value.length);
      updateRequestPreview();

      // Update manual email content if in manual mode
      if (
        document.getElementById('manualModeEmailCopy')?.style.display !== 'none'
      ) {
        generateManualEmailContent();
      }
    }
  });

  // Handle button clicks
  document.addEventListener('click', function (e) {
    // Auto mode submit button
    if (
      e.target.matches('[data-action="submitGroupRequest"]') ||
      e.target.closest('[data-action="submitGroupRequest"]')
    ) {
      e.preventDefault();
      submitGroupRequest();
    }

    // Manual mode submit button
    if (
      e.target.matches('[data-action="markAsSentAndCreate"]') ||
      e.target.closest('[data-action="markAsSentAndCreate"]')
    ) {
      e.preventDefault();
      markAsSentAndCreate();
    }

    // Copy to clipboard buttons
    if (
      e.target.matches('[data-copy-target]') ||
      e.target.closest('[data-copy-target]')
    ) {
      e.preventDefault();
      const button = e.target.closest('[data-copy-target]') || e.target;
      const targetId = button.getAttribute('data-copy-target');
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        copyToClipboard(targetElement.value || targetElement.textContent);
      }
    }

    // Open mail client button
    if (
      e.target.matches('#openMailClientBtn') ||
      e.target.closest('#openMailClientBtn')
    ) {
      e.preventDefault();
      openMailClientFromModal();
    }
  });

  // Handle modal show event to set up UI based on email preference
  document.addEventListener('shown.bs.modal', function (e) {
    if (e.target.id === 'groupRequestModal') {
      const emailMode = window.currentUserData?.emailPreference || 'automatic';
      updateModalForEmailMode(emailMode);
    }
  });
});

/**
 * Copies text to clipboard and shows feedback
 * @param {string} text - Text to copy
 * @returns {void}
 */
function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (window.showToast) {
          window.showToast('Copied to clipboard!', 'success');
        }
      })
      .catch(() => {
        fallbackCopyToClipboard(text);
      });
  } else {
    fallbackCopyToClipboard(text);
  }
}

/**
 * Fallback copy method for older browsers
 * @param {string} text - Text to copy
 * @returns {void}
 */
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    if (window.showToast) {
      window.showToast('Copied to clipboard!', 'success');
    }
  } catch (err) {
    window.logger?.error('Failed to copy text: ', err);
    if (window.showToast) {
      window.showToast('Failed to copy to clipboard', 'error');
    }
  } finally {
    document.body.removeChild(textArea);
  }
}

/**
 * Opens mail client with pre-filled content
 * @returns {void}
 */
function openMailClientFromModal() {
  const toField = document.getElementById('manualEmailTo');
  const subjectField = document.getElementById('manualEmailSubject');
  const bodyField = document.getElementById('manualEmailBody');

  if (!toField || !subjectField || !bodyField) {
    if (window.showToast) {
      window.showToast('Email content not ready', 'error');
    }
    return;
  }

  const to = encodeURIComponent(toField.value || '');
  const subject = encodeURIComponent(subjectField.value || '');
  const body = encodeURIComponent(bodyField.value || '');

  const mailtoLink = `mailto:${to}?subject=${subject}&body=${body}`;

  try {
    window.location.href = mailtoLink;
    if (window.showToast) {
      window.showToast('Opening in your default mail client...', 'success');
    }
  } catch (error) {
    window.logger?.error('Error opening mail client:', error);
    if (window.showToast) {
      window.showToast(
        'Could not open mail client. Please copy the content manually.',
        'error'
      );
    }
  }
}

// Make functions globally available
window.updateMessageCounter = updateMessageCounter;
window.updateRequestPreview = updateRequestPreview;
window.submitGroupRequest = submitGroupRequest;
window.updateModalForEmailMode = updateModalForEmailMode;
window.generateManualEmailContent = generateManualEmailContent;
window.markAsSentAndCreate = markAsSentAndCreate;
