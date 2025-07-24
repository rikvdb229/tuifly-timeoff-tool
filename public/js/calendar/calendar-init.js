/**
 * Calendar Initialization
 * Single entry point for calendar initialization to prevent double loading
 */

// Initialize calendar when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  logger.info('Calendar initialization started');
  
  try {
    // Initialize all calendar modules in the correct order
    await initializeCalendar();
    
    logger.info('Calendar initialization completed successfully');
  } catch (error) {
    logger.error('Calendar initialization failed:', error);
    window.showToast('Failed to initialize calendar', 'error');
  }
});

async function initializeCalendar() {
  // 1. Load user data and settings first
  if (typeof window.loadUserDataAndSettings === 'function') {
    await window.loadUserDataAndSettings();
  }
  
  // 2. Load email preferences
  await loadCalendarEmailPreferences();
  
  // 3. Load existing requests and generate statistics (but don't generate calendar yet)
  if (typeof window.loadExistingRequests === 'function') {
    await window.loadExistingRequests();
  }
  
  // 4. Initialize the calendar display (this will call generateCalendar once)
  if (window.calendar && typeof window.calendar.initialize === 'function') {
    await window.calendar.initialize();
  }
  
  // 5. Initialize copy button handlers
  if (typeof window.initializeCopyHandlers === 'function') {
    window.initializeCopyHandlers();
  }
  
  // 6. Set up all event listeners
  setupEventListeners();
  
  logger.debug('All calendar modules initialized');
}

async function loadCalendarEmailPreferences() {
  try {
    const response = await fetch('/settings/email-preference');
    const data = await response.json();
    if (data.success && typeof window.loadEmailPreferences === 'function') {
      window.loadEmailPreferences(data.data);
    }
  } catch (error) {
    logger.debug('Could not load email preferences for header badge');
  }
}

function setupEventListeners() {
  // Set up event listeners for request form fields
  const formFields = ['requestType', 'customMessage', 'startDate', 'endDate'];
  
  formFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && typeof window.updateRequestPreview === 'function') {
      field.addEventListener('change', window.updateRequestPreview);
      field.addEventListener('input', window.updateRequestPreview);
    }
  });

  // Navigation buttons
  setupNavigationButtons();
  
  // Modal and form buttons
  setupModalButtons();
  
  // Dynamic preview update listeners
  setupDynamicPreviewListeners();
}

function setupNavigationButtons() {
  // Create request button
  const createBtn = document.getElementById('createRequestBtn');
  if (createBtn && !createBtn.hasAttribute('data-listener-added')) {
    createBtn.addEventListener('click', window.openGroupRequestModal);
    createBtn.setAttribute('data-listener-added', 'true');
  }

  // Navigation buttons
  const prevBtn = document.getElementById('prevMonthBtn');
  const nextBtn = document.getElementById('nextMonthBtn');

  if (prevBtn && !prevBtn.hasAttribute('data-listener-added')) {
    prevBtn.addEventListener('click', async () => {
      if (window.calendar) {
        await window.calendar.navigatePrevious();
      }
    });
    prevBtn.setAttribute('data-listener-added', 'true');
  }

  if (nextBtn && !nextBtn.hasAttribute('data-listener-added')) {
    nextBtn.addEventListener('click', async () => {
      if (window.calendar) {
        await window.calendar.navigateNext();
      }
    });
    nextBtn.setAttribute('data-listener-added', 'true');
  }

  // Settings button
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn && !settingsBtn.hasAttribute('data-listener-added')) {
    settingsBtn.addEventListener('click', () => {
      if (window.openSettingsModal) {
        window.openSettingsModal();
      }
    });
    settingsBtn.setAttribute('data-listener-added', 'true');
  }
}

function setupModalButtons() {  
  // Submit group request listener
  document.addEventListener('click', e => {
    if (e.target.id === 'submitGroupRequest') {
      e.preventDefault();
      if (window.submitGroupRequest) {
        window.submitGroupRequest();
      }
    }
  });

  // Modal cleanup listener
  document.addEventListener('hidden.bs.modal', e => {
    if (e.target.id === 'groupRequestModal') {
      document.getElementById('groupRequestForm')?.reset();
      const customMessage = document.getElementById('customMessage');
      if (customMessage) {customMessage.value = '';}
      window.isSubmitting = false;
    }
  });
}

function setupDynamicPreviewListeners() {
  // Dynamic preview update listeners
  const fieldsToWatch = [
    'startDate',
    'endDate',
    'type',
    'flightNumber',
    'customMessage',
  ];
  fieldsToWatch.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && typeof window.updateRequestPreview === 'function') {
      field.addEventListener('change', window.updateRequestPreview);
      field.addEventListener('input', window.updateRequestPreview);
    }
  });
}

// Make initialization function available globally
window.initializeCalendar = initializeCalendar;