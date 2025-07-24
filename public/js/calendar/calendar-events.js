/**
 * Calendar Events Module
 * Contains event handlers, user interactions, and date selection logic
 */

// Global variables (accessed from calendar-core.js)
window.isSubmitting = window.isSubmitting || false;
window.userEmailPreference = window.userEmailPreference || 'automatic';

// User data loading function
async function loadUserDataAndSettings() {
  try {
    const response = await fetch('/settings/api');
    const data = await response.json();
    if (data.success) {
      // Load user data
      window.currentUserData = data.data.user;

      // Load email preference
      window.userEmailPreference =
        data.data.user.emailPreference || 'automatic';

      logger.info('User data and preferences loaded', {
        userId: window.currentUserData?.id,
        emailPreference: window.userEmailPreference
      });
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'loadUserDataAndSettings' 
    });
    // Default to automatic if we can't load settings
    window.userEmailPreference = 'automatic';
  }
}

// Copy functionality with event delegation
function initializeCopyHandlers() {
  logger.debug('Setting up copy button handlers');

  // Single event listener for all copy buttons using event delegation
  document.addEventListener('click', function (event) {
    // Check if clicked element is a copy button or child of copy button
    const copyBtn = event.target.closest('[data-copy-target]');

    if (copyBtn) {
      event.preventDefault();
      event.stopPropagation();

      const targetId = copyBtn.getAttribute('data-copy-target');
      logger.logUserAction('copyButtonClick', { targetId: targetId });

      if (!targetId) {
        logger.error('No target ID found for copy operation');
        window.showToast('Copy failed - no target specified', 'error');
        return;
      }

      const element = document.getElementById(targetId);
      if (!element) {
        logger.error('Copy target element not found', { targetId: targetId });
        window.showToast('Copy failed - element not found', 'error');
        return;
      }

      // Get text to copy
      let textToCopy = '';
      if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        textToCopy = element.value;
      } else {
        textToCopy = element.textContent || element.innerText;
      }

      if (!textToCopy || !textToCopy.trim()) {
        logger.warn('No text to copy');
        window.showToast('Nothing to copy', 'error');
        return;
      }

      logger.debug('Copying text to clipboard', { 
        textLength: textToCopy.length,
        preview: textToCopy.substring(0, 50) + '...' 
      });

      // Copy to clipboard
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
          .writeText(textToCopy)
          .then(() => {
            logger.info('Clipboard copy successful');
            window.showToast('Copied to clipboard!', 'success');
            highlightCopyButton(copyBtn);
          })
          .catch(err => {
            logger.warn('Clipboard API failed, using fallback', { error: err.message });
            fallbackCopy(textToCopy, copyBtn);
          });
      } else {
        logger.debug('Using fallback copy method');
        fallbackCopy(textToCopy, copyBtn);
      }
    }
  });

  function fallbackCopy(text, button) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, 99999); // For mobile

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        logger.info('Fallback copy successful');
        window.showToast('Copied to clipboard!', 'success');
        highlightCopyButton(button);
      } else {
        logger.error('Fallback copy failed');
        window.showToast('Copy failed', 'error');
      }
    } catch (err) {
      logger.logError(err, { operation: 'fallbackCopy' });
      window.showToast('Copy failed', 'error');
    }
  }

  function highlightCopyButton(button) {
    const originalHTML = button.innerHTML;
    const originalClass = button.className;

    button.innerHTML = '<i class="bi bi-check"></i> Copied!';
    button.classList.remove('btn-outline-secondary');
    button.classList.add('btn-success');

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.className = originalClass;
    }, 2000);
  }
}

// Date type and flight number update functions
window.updateDateType = function (index, newType) {
  // Update the selectedDates array
  window.selectedDates[index].type = newType;

  // Show/hide flight number input based on selection
  const flightInput = document.querySelector(`input[data-index="${index}"]`);
  if (flightInput) {
    if (newType === 'FLIGHT') {
      flightInput.style.display = 'block';
      flightInput.required = true;
      flightInput.focus();
    } else {
      flightInput.style.display = 'none';
      flightInput.required = false;
      flightInput.value = '';
      window.selectedDates[index].flightNumber = '';
    }
  }

  // Update preview immediately
  window.updateRequestPreview();
};

window.updateFlightNumber = function (index, flightNumber) {
  // Update the selectedDates array
  window.selectedDates[index].flightNumber = flightNumber;

  // Update preview immediately
  window.updateRequestPreview();
};

// Request preview update function
window.updateRequestPreview = function () {
  const requestLinesContainer = document.getElementById('requestLines');
  const emailSubjectElement = document.getElementById('emailSubject');
  const customMessagePreview = document.getElementById('customMessagePreview');
  const userSignatureElement = document.getElementById('userSignature');

  if (!requestLinesContainer || !emailSubjectElement) {return;}

  // Generate proper request lines from selected dates
  if (window.selectedDates && window.selectedDates.length > 0) {
    const requestLines = window.selectedDates
      .map(dateInfo => {
        const formattedDate = formatDateForEmail(new Date(dateInfo.date));

        switch (dateInfo.type) {
          case 'REQ_DO':
            return `REQ DO - ${formattedDate}`;
          case 'PM_OFF':
            return `REQ PM OFF - ${formattedDate}`;
          case 'AM_OFF':
            return `REQ AM OFF - ${formattedDate}`;
          case 'FLIGHT':
            return `REQ FLIGHT ${dateInfo.flightNumber || '[NUMBER]'} - ${formattedDate}`;
          default:
            return `${dateInfo.type} - ${formattedDate}`;
        }
      })
      .join('<br>');

    requestLinesContainer.innerHTML = requestLines;
  } else {
    requestLinesContainer.innerHTML =
      '<em class="text-muted">Please fill in the required fields</em>';
  }

  // Generate proper subject with correct format
  if (window.selectedDates && window.selectedDates.length > 0) {
    const firstDate = new Date(window.selectedDates[0].date);
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const monthName = monthNames[firstDate.getMonth()];
    const year = firstDate.getFullYear();
    const userCode =
      window.currentUserData?.code ||
      window.TUIFLY_CONFIG?.EMPLOYEE_CODE ||
      'XXX';

    emailSubjectElement.textContent = `${userCode} - CREW REQUEST - ${monthName} ${year}`;
  }

  // Update custom message preview
  const customMessage = document.getElementById('customMessage');
  const customMessageSpacer = document.getElementById('customMessageSpacer');

  if (customMessage && customMessagePreview) {
    if (customMessage.value.trim()) {
      customMessagePreview.textContent = customMessage.value;
      customMessagePreview.style.display = 'block';

      // Show spacer to create line break after custom message
      if (customMessageSpacer) {
        customMessageSpacer.style.display = 'block';
      }
    } else {
      customMessagePreview.style.display = 'none';

      // Hide spacer when no custom message
      if (customMessageSpacer) {
        customMessageSpacer.style.display = 'none';
      }
    }
  }

  // Update signature properly
  if (userSignatureElement) {
    const signature =
      window.currentUserData?.signature ||
      window.TUIFLY_CONFIG?.EMPLOYEE_SIGNATURE ||
      `Brgds,\n${window.currentUserData?.name || window.TUIFLY_CONFIG?.EMPLOYEE_NAME || 'Unknown'}`;

    // Create elements safely to prevent XSS
    userSignatureElement.innerHTML = ''; // Clear first
    userSignatureElement.appendChild(document.createElement('br'));
    userSignatureElement.appendChild(document.createElement('br'));

    // Create text node for safe content
    const signatureDiv = document.createElement('div');
    signatureDiv.style.whiteSpace = 'pre-line'; // Preserve line breaks
    signatureDiv.textContent = signature; // Use textContent for safety
    userSignatureElement.appendChild(signatureDiv);
  }
};

// Helper function to format dates properly
function formatDateForEmail(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Modal functions
function openGroupRequestModal() {
  if (window.selectedDates.length === 0) {
    window.showToast('Please select dates first', 'warning');
    return;
  }

  // Create modal if it doesn't exist
  let modal = document.getElementById('groupRequestModal');
  if (!modal) {
    createGroupRequestModal();
    modal = document.getElementById('groupRequestModal');
  }

  // Populate dates in modal
  populateModalDates();

  // Show modal
  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();

  // Initialize email preview and add dynamic listeners after modal is visible
  setTimeout(() => {
    window.updateRequestPreview(); // Initial preview
    addDynamicPreviewListeners(); // Add change listeners
  }, 200);
}

function addDynamicPreviewListeners() {
  // Find all the date type dropdowns and flight number inputs
  const dateInputs = document.querySelectorAll(
    'select[id^="dateType_"], input[id^="flightNumber_"]'
  );

  dateInputs.forEach(input => {
    input.addEventListener('change', function () {
      // Update the selectedDates array with the new values
      updateSelectedDatesFromInputs();
      // Trigger preview update
      window.updateRequestPreview();
    });
  });

  // Also listen to custom message changes
  const customMessageInput = document.getElementById('customMessage');
  if (customMessageInput) {
    customMessageInput.addEventListener('input', function () {
      window.updateRequestPreview();
    });
  }
}

// Function to update selectedDates array from current input values
function updateSelectedDatesFromInputs() {
  window.selectedDates.forEach((dateInfo, index) => {
    const typeSelect = document.getElementById(`dateType_${index}`);
    const flightInput = document.getElementById(`flightNumber_${index}`);

    if (typeSelect) {
      dateInfo.type = typeSelect.value;
    }

    if (flightInput && dateInfo.type === 'FLIGHT') {
      dateInfo.flightNumber = flightInput.value;
    }
  });
}

function createGroupRequestModal() {
  const modalHTML = `
    <div class="modal fade" id="groupRequestModal" tabindex="-1">
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="bi bi-calendar-plus"></i> Create Time-Off Request
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <form id="groupRequestForm">
              <div class="mb-3">
                <label class="form-label">Selected Dates</label>
                <div id="selectedDatesList" class="border rounded p-3 bg-light">
                  <!-- Dates will be populated here -->
                </div>
              </div>

              <div class="mb-3">
                <label for="customMessage" class="form-label">Custom Message (Optional)</label>
                <textarea
                  class="form-control"
                  id="customMessage"
                  rows="3"
                  placeholder="Additional information or reason for time-off...">
                </textarea>
              </div>

              <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                <small>
                  Request will be sent to scheduling@tuifly.be for approval.
                </small>
              </div>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="submitGroupRequest">
              <i class="bi bi-send me-1"></i>Submit Request
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function populateModalDates() {
  const container = document.getElementById('selectedDatesList');
  container.innerHTML = '';

  window.selectedDates.forEach((dateObj, index) => {
    const date = new Date(dateObj.date);
    const dateStr = date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const dateRow = document.createElement('div');
    dateRow.className = 'row mb-2 align-items-center';
    const isFlightType = dateObj.type === 'FLIGHT';

    dateRow.innerHTML = `
      <div class="col-md-6">
        <span class="fw-bold">${dateStr}</span>
      </div>
      <div class="col-md-4">
        <select class="form-select form-select-sm" onchange="updateDateType(${index}, this.value)">
          <option value="REQ_DO" ${dateObj.type === 'REQ_DO' ? 'selected' : ''}>Full Day Off</option>
          <option value="PM_OFF" ${dateObj.type === 'PM_OFF' ? 'selected' : ''}>PM Off</option>
          <option value="AM_OFF" ${dateObj.type === 'AM_OFF' ? 'selected' : ''}>AM Off</option>
          <option value="FLIGHT" ${dateObj.type === 'FLIGHT' ? 'selected' : ''}>Flight</option>
        </select>
      </div>
      <div class="col-md-2">
        <input 
          type="text" 
          class="form-control form-control-sm" 
          placeholder="Flight#"
          data-index="${index}"
          value="${dateObj.flightNumber || ''}"
          onchange="updateFlightNumber(${index}, this.value)"
          oninput="updateFlightNumber(${index}, this.value)"
          style="display: ${isFlightType ? 'block' : 'none'}"
          ${isFlightType ? 'required' : ''}
        />
      </div>
    `;

    container.appendChild(dateRow);
  });
}

// Calendar events module - no longer auto-initializes
// Initialization is handled by calendar-init.js

// Event listeners now handled by calendar-init.js

// Make functions available globally
window.openGroupRequestModal = openGroupRequestModal;
window.loadUserDataAndSettings = loadUserDataAndSettings;
window.initializeCopyHandlers = initializeCopyHandlers;
