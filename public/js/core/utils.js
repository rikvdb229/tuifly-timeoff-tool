/**
 * Core Utilities Module
 * Contains base JavaScript functions, utilities, and settings management
 */

// Base JavaScript functions for all pages

/**
 * Handles user logout with confirmation dialog
 * @returns {Promise<void>}
 */
async function logout() {
  const confirmed = window.showConfirmDialog ? 
    await window.showConfirmDialog(
      'Are you sure you want to logout? You will be redirected to the login page.',
      'Logout Confirmation',
      'logout'
    ) : confirm('Are you sure you want to logout? You will be redirected to the login page.');

  if (confirmed) {
    showToast('Logging out...', 'info');
    window.location.href = '/auth/logout';
  }
}

// Settings modal functions
/**
 * Opens the settings modal and loads current settings
 * @returns {Promise<void>}
 */
async function openSettingsModal() {
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  modal.show();

  // Load settings when modal opens
  await loadSettings();
}

/**
 * Loads user settings, preferences, and Gmail status from the server
 * Updates the settings modal UI with current values
 * @returns {Promise<void>}
 * @throws {Error} When settings cannot be loaded from the server
 */
async function loadSettings() {
  const settingsLoading = document.getElementById('settingsLoading');
  const settingsContent = document.getElementById('settingsContent');

  if (settingsLoading) {settingsLoading.style.display = 'block';}
  if (settingsContent) {settingsContent.style.display = 'none';}

  try {
    const response = await fetch('/settings/api');
    const data = await response.json();

    if (data.success) {
      // Load email preferences
      if (typeof loadEmailPreferences === 'function') {
        loadEmailPreferences(data.data);
      }

      // Load Gmail status
      if (typeof loadGmailStatus === 'function') {
        await loadGmailStatus();
      }

      // Populate profile form (existing code)
      const userName = document.getElementById('userName');
      const userCode = document.getElementById('userCode');
      const userSignature = document.getElementById('userSignature');

      if (userName) {userName.value = data.data.user.name || '';}
      if (userCode) {userCode.value = data.data.user.code || '';}
      if (userSignature) {userSignature.value = data.data.user.signature || '';}

      // Make name and code fields read-only if user has completed onboarding
      const isOnboarded = data.data.user.onboardedAt || data.data.user.isOnboarded;
      
      if (isOnboarded && userName) {
        userName.readOnly = true;
        userName.style.backgroundColor = '#f8f9fa';
        userName.style.color = '#6c757d';
        userName.style.userSelect = 'none';
        userName.style.cursor = 'not-allowed';
        userName.style.outline = 'none';
        userName.style.boxShadow = 'none';
        userName.title = 'Name cannot be changed after onboarding';
        userName.setAttribute('data-bs-toggle', 'tooltip');
        userName.setAttribute('data-bs-placement', 'top');
        userName.setAttribute('data-bs-trigger', 'hover');
        
        // Disable focus and prevent clicks
        userName.tabIndex = -1;
        userName.addEventListener('click', (e) => e.preventDefault());
        userName.addEventListener('focus', (e) => e.target.blur());
        
        // Initialize tooltip if Bootstrap is available
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
          new bootstrap.Tooltip(userName);
        }
      }

      if (isOnboarded && userCode) {
        userCode.readOnly = true;
        userCode.style.backgroundColor = '#f8f9fa';
        userCode.style.color = '#6c757d';
        userCode.style.userSelect = 'none';
        userCode.style.cursor = 'not-allowed';
        userCode.style.outline = 'none';
        userCode.style.boxShadow = 'none';
        userCode.title = '3-letter code cannot be changed after onboarding';
        userCode.setAttribute('data-bs-toggle', 'tooltip');
        userCode.setAttribute('data-bs-placement', 'top');
        userCode.setAttribute('data-bs-trigger', 'hover');
        
        // Disable focus and prevent clicks
        userCode.tabIndex = -1;
        userCode.addEventListener('click', (e) => e.preventDefault());
        userCode.addEventListener('focus', (e) => e.target.blur());
        
        // Hide the validation text since field is read-only
        const codeFormText = userCode.parentNode.querySelector('.form-text');
        if (codeFormText) {
          codeFormText.style.display = 'none';
        }
        
        // Initialize tooltip if Bootstrap is available
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
          new bootstrap.Tooltip(userCode);
        }
      }

      // Note: Application settings (theme, language, notifications, autoSave) removed

      // Populate global settings (read-only)
      const minAdvanceDays = document.getElementById('minAdvanceDays');
      const maxAdvanceDays = document.getElementById('maxAdvanceDays');
      const maxDaysPerRequest = document.getElementById('maxDaysPerRequest');
      const approverEmail = document.getElementById('approverEmail');

      if (minAdvanceDays)
        {minAdvanceDays.textContent =
          data.data.globalSettings?.MIN_ADVANCE_DAYS || 60;}
      if (maxAdvanceDays)
        {maxAdvanceDays.textContent =
          data.data.globalSettings?.MAX_ADVANCE_DAYS || 120;}
      if (maxDaysPerRequest)
        {maxDaysPerRequest.textContent =
          data.data.globalSettings?.MAX_DAYS_PER_REQUEST || 4;}
      if (approverEmail)
        {approverEmail.textContent =
          data.data.globalSettings?.TUIFLY_APPROVER_EMAIL ||
          'scheduling@tuifly.be';}
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'loadSettings',
      userId: window.currentUserData?.id 
    });
    showToast('Failed to load settings', 'error');
  } finally {
    if (settingsLoading) {settingsLoading.style.display = 'none';}
    if (settingsContent) {settingsContent.style.display = 'block';}
  }
}

// Email preference management functions
let currentEmailPreference = 'manual';
let gmailConnected = false;

/**
 * Loads Gmail connection status and email preference from the server
 * @returns {Promise<void>}
 * @throws {Error} When Gmail status cannot be retrieved
 */
async function loadGmailStatus() {
  try {
    const response = await fetch('/settings/gmail-status');
    const result = await response.json();

    if (result.success) {
      gmailConnected = result.gmailConnected;
      currentEmailPreference = result.emailPreference || 'manual';
      updateEmailPreferenceUI();
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'loadGmailStatus',
      userId: window.currentUserData?.id 
    });
  }
}

/**
 * Updates the email preference UI based on current Gmail connection status
 * and email preference setting. Updates status badges, card highlights, and
 * visibility of Gmail authorization section
 * @returns {void}
 */
function updateEmailPreferenceUI() {
  // Update email mode status (only thing we show now)
  const emailModeStatus = document.getElementById('emailModeStatus');
  if (emailModeStatus) {
    if (currentEmailPreference === 'automatic') {
      if (gmailConnected) {
        emailModeStatus.innerHTML = `
          <i class="bi bi-robot text-primary me-1"></i>
          <span class="text-primary">Automatic (Connected)</span>
        `;
      } else {
        emailModeStatus.innerHTML = `
          <i class="bi bi-robot text-warning me-1"></i>
          <span class="text-warning">Automatic (Authorization Required)</span>
        `;
      }
    } else {
      emailModeStatus.innerHTML = `
        <i class="bi bi-envelope text-success me-1"></i>
        <span class="text-success">Manual</span>
      `;
    }
  }

  updateEmailMethodCardHighlights(currentEmailPreference);

  // Show Gmail auth section if automatic mode is selected but Gmail is not connected
  const gmailAuthSection = document.getElementById('gmailAuthSection');
  if (gmailAuthSection) {
    if (currentEmailPreference === 'automatic' && !gmailConnected) {
      gmailAuthSection.style.display = 'block';
    } else {
      gmailAuthSection.style.display = 'none';
    }
  }

  // Update header badge
  const headerEmailModeBadge = document.getElementById('headerEmailModeBadge');
  if (headerEmailModeBadge) {
    headerEmailModeBadge.textContent =
      currentEmailPreference === 'automatic' ? '🤖 Automatic' : '📧 Manual';
    headerEmailModeBadge.className = `badge ms-1 ${currentEmailPreference === 'automatic' ? 'bg-primary' : 'bg-success'}`;
  }
}

/**
 * Handles selection of email preference from the card-based UI
 * Shows Gmail authorization if automatic mode is selected but Gmail not connected
 * @param {string} preference - Either 'manual' or 'automatic'
 * @returns {void}
 */
function selectEmailPreference(preference) {
  logger.logUserAction('selectEmailPreference', { 
    preference: preference,
    gmailConnected: gmailConnected 
  });

  // If selecting automatic but Gmail not connected, show auth section
  if (preference === 'automatic' && !gmailConnected) {
    const gmailAuthSection = document.getElementById('gmailAuthSection');
    if (gmailAuthSection) {
      gmailAuthSection.style.display = 'block';
    }

    // Highlight the automatic card but don't update preference yet
    updateEmailMethodCardHighlights('automatic');
    showToast(
      'Gmail authorization required for automatic email mode',
      'warning'
    );
    return;
  }

  // Update preference via API
  updateEmailPreference(preference);
}

/**
 * Updates the email preference setting via API call
 * Handles success/failure states and UI updates
 * @param {string} preference - Either 'manual' or 'automatic'
 * @returns {Promise<void>}
 * @throws {Error} When API call fails or preference cannot be updated
 */
async function updateEmailPreference(preference) {
  // const oldMode = currentEmailPreference; // TODO: Use for rollback if needed

  try {
    const response = await fetch('/settings/email-preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emailPreference: preference }),
    });

    const result = await response.json();

    if (result.success) {
      currentEmailPreference = preference;
      // Update global email preference for calendar
      window.userEmailPreference = preference;
      
      updateEmailPreferenceUI();
      showToast(result.message, 'success');

      // Hide Gmail auth section if switching to manual
      if (preference === 'manual') {
        const gmailAuthSection = document.getElementById('gmailAuthSection');
        if (gmailAuthSection) {
          gmailAuthSection.style.display = 'none';
        }
      }

      // Refresh user data and calendar to reflect new email preference
      window.logger?.info('Refreshing user data and calendar after email preference change', {
        oldPreference: currentEmailPreference,
        newPreference: preference
      });

      // First refresh user data from server to ensure consistency
      if (typeof window.loadUserDataAndSettings === 'function') {
        await window.loadUserDataAndSettings();
      } else {
        // Fallback: manually update the global variables
        window.userEmailPreference = preference;
        if (window.currentUserData) {
          window.currentUserData.emailPreference = preference;
        }
      }

      // Then refresh calendar with updated data
      if (typeof window.loadExistingRequests === 'function') {
        await window.loadExistingRequests();
      } else {
        window.logger?.warn('loadExistingRequests function not available for calendar refresh');
      }

      // Close any open modals that might have stale email preference data
      const openModals = document.querySelectorAll('.modal.show');
      openModals.forEach(modal => {
        const modalElement = bootstrap.Modal.getInstance(modal);
        if (modalElement && modal.id !== 'settingsModal') {
          // Don't close the settings modal itself, but close others like request detail modals
          modalElement.hide();
          window.logger?.info('Closed modal due to email preference change', { modalId: modal.id });
        }
      });
    } else {
      // Reset card selection to previous state
      updateEmailMethodCardHighlights(currentEmailPreference);

      if (result.requiresGmailAuth) {
        const gmailAuthSection = document.getElementById('gmailAuthSection');
        if (gmailAuthSection) {
          gmailAuthSection.style.display = 'block';
        }
        showToast('Gmail authorization required for automatic mode', 'warning');
      } else {
        showToast(result.error, 'error');
      }
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'updateEmailPreference',
      preference: preference,
      userId: window.currentUserData?.id 
    });
    showToast('Failed to update email preference', 'error');

    // Reset card selection to previous state
    updateEmailMethodCardHighlights(currentEmailPreference);
  }
}

/**
 * Updates visual highlights for email method cards based on current preference
 * Clears all existing highlights and applies styling to the selected card
 * @param {string} preference - Either 'manual' or 'automatic'
 * @returns {void}
 */
function updateEmailMethodCardHighlights(preference) {
  // Clear all selections
  document.querySelectorAll('.email-method-card').forEach(card => {
    card.classList.remove(
      'border-primary',
      'border-success',
      'bg-light',
      'selected'
    );
  });

  // Highlight selected card
  const selectedCard = document.getElementById(`${preference}Card`);
  if (selectedCard) {
    selectedCard.classList.add('bg-light', 'selected');
    if (preference === 'automatic') {
      selectedCard.classList.add('border-primary');
    } else {
      selectedCard.classList.add('border-success');
    }
  }
}

/**
 * Loads email preferences from server data and updates UI
 * Called from loadSettings to initialize email preference state
 * @param {Object} data - Server response data containing email preferences
 * @param {string} data.emailPreference - Current email preference ('manual' or 'automatic')
 * @param {boolean} data.gmailConnected - Whether Gmail is connected
 * @returns {void}
 */
function loadEmailPreferences(data) {
  currentEmailPreference = data.emailPreference || 'manual';
  gmailConnected = data.gmailConnected || false;
  updateEmailPreferenceUI();
}

// Check authorization status manually
window.checkGmailAuth = async function () {
  logger.info('Checking Gmail authorization status');
  await loadGmailStatus();

  const status = gmailConnected ? 'Connected' : 'Not Connected';
  const message = `Gmail Status: ${status}\nEmail Mode: ${currentEmailPreference}`;

  if (!gmailConnected && currentEmailPreference === 'automatic') {
    const shouldAuthorize = confirm(
      message + '\n\nWould you like to authorize Gmail now?'
    );
    if (shouldAuthorize) {
      await connectGmail();
    }
  } else {
    alert(message);
  }
};

// Force show Gmail authorization section
window.showGmailAuth = function () {
  const gmailAuthSection = document.getElementById('gmailAuthSection');
  if (gmailAuthSection) {
    gmailAuthSection.style.display = 'block';
  }
};

// Gmail authorization function (alias for connectGmail)
window.authorizeGmail = async function () {
  await connectGmail();
};

/**
 * Initiates Gmail OAuth connection process
 * Sets redirect target and redirects user to Gmail authorization
 * @returns {Promise<void>}
 * @throws {Error} When Gmail connection setup fails
 */
async function connectGmail() {
  try {
    const authorizeBtn = document.getElementById('authorizeGmailBtn');
    if (authorizeBtn) {
      authorizeBtn.disabled = true;
      authorizeBtn.innerHTML =
        '<i class="bi bi-hourglass-split me-2"></i>Connecting...';
    }

    // Set redirect target to come back to settings modal
    await fetch('/auth/set-gmail-redirect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectTo: '/?gmail_success=1&open_settings=1' }),
    });

    // Redirect to Gmail OAuth
    window.location.href = '/auth/google/gmail';
  } catch (error) {
    logger.logError(error, { 
      operation: 'connectGmail',
      userId: window.currentUserData?.id 
    });
    showToast('Failed to connect Gmail. Please try again.', 'error');

    const authorizeBtn = document.getElementById('authorizeGmailBtn');
    if (authorizeBtn) {
      authorizeBtn.disabled = false;
      authorizeBtn.innerHTML =
        '<i class="bi bi-google me-2"></i>Authorize Gmail Access';
    }
  }
}

/**
 * Disconnects Gmail integration and switches to manual email mode
 * Shows confirmation dialog before proceeding
 * @returns {Promise<void>}
 * @throws {Error} When Gmail disconnection fails
 */
async function disconnectGmail() {
  if (
    !confirm(
      'Are you sure you want to disconnect Gmail? This will switch your email preference to manual mode.'
    )
  ) {
    return;
  }

  try {
    const response = await fetch('/settings/disconnect-gmail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.success) {
      showToast(result.message, 'success');
      // Update local state
      gmailConnected = false;
      currentEmailPreference = 'manual';
      updateEmailPreferenceUI();
    } else {
      showToast(result.error || 'Failed to disconnect Gmail', 'error');
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'disconnectGmail',
      userId: window.currentUserData?.id 
    });
    showToast('Failed to disconnect Gmail. Please try again.', 'error');
  }
}

// Handle Gmail success from URL (when redirected back)
document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('gmail_success') === '1') {
    showToast(
      'Gmail connected successfully! Email preference set to automatic.',
      'success'
    );

    // Open settings modal if requested
    if (urlParams.get('open_settings') === '1') {
      setTimeout(() => {
        openSettingsModal();
      }, 1000);
    }

    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('gmail_success');
    url.searchParams.delete('open_settings');
    window.history.replaceState({}, '', url);
  }

  // Profile form submission
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const userName = document.getElementById('userName');
      const userCode = document.getElementById('userCode');
      const userSignature = document.getElementById('userSignature');

      const formData = {
        signature: userSignature.value,
      };

      // Only include name and code if they're not read-only (i.e., user hasn't completed onboarding)
      if (!userName.readOnly) {
        formData.name = userName.value;
      }
      if (!userCode.readOnly) {
        formData.code = userCode.value;
      }

      try {
        const response = await fetch('/settings/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });

        const data = await response.json();

        if (data.success) {
          showToast('Profile updated successfully', 'success');
          setTimeout(() => {
            location.reload();
          }, 1500);
        } else {
          throw new Error(data.error || 'Failed to update profile');
        }
      } catch (error) {
        logger.logError(error, { 
          operation: 'updateProfile',
          userId: window.currentUserData?.id 
        });
        showToast('Failed to update profile', 'error');
      }
    });
  }

  // Application settings form removed - only profile and email preferences remain
});

/**
 * Displays a toast notification with Bootstrap styling
 * Creates toast container if it doesn't exist, shows toast with appropriate styling
 * @param {string} message - The message to display in the toast
 * @param {string} [type='info'] - Toast type: 'info', 'success', 'error', or 'warning'
 * @returns {void}
 * @example
 * showToast('Profile updated successfully', 'success');
 * showToast('Failed to load data', 'error');
 */
function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
  }

  // Check for duplicate messages to prevent double toasts
  const existingToasts = toastContainer.querySelectorAll('.toast');
  for (const existingToast of existingToasts) {
    const existingBody = existingToast.querySelector('.toast-body');
    if (existingBody && existingBody.textContent.trim() === message.trim()) {
      return; // Don't show duplicate toast
    }
  }

  // Create toast element
  const toastId = 'toast-' + Date.now();
  const iconClass =
    type === 'error'
      ? 'exclamation-triangle'
      : type === 'success'
        ? 'check-circle'
        : 'info-circle';
  const bgClass =
    type === 'error' ? 'danger' : type === 'success' ? 'success' : 'primary';
  const titleText =
    type === 'error' ? 'Error' : type === 'success' ? 'Success' : 'Info';

  const toastHTML = `
    <div id="${toastId}" class="toast mb-2" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="toast-header bg-${bgClass} text-white">
        <i class="bi bi-${iconClass} me-2"></i>
        <strong class="me-auto">${titleText}</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    </div>
  `;

  toastContainer.insertAdjacentHTML('beforeend', toastHTML);

  // Initialize and show toast
  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    autohide: true,
    delay: type === 'error' ? 8000 : 5000,
  });

  toast.show();

  // Remove toast element after it's hidden
  toastElement.addEventListener('hidden.bs.toast', function () {
    toastElement.remove();
  });
}

/**
 * Deletes the user account with double confirmation
 * Shows confirmation dialog and requires typing 'DELETE' to confirm
 * @returns {Promise<void>}
 * @throws {Error} When account deletion fails
 */
async function deleteAccount() {
  const confirmed = confirm(
    'Are you absolutely sure you want to delete your account?\n\n' +
      'This action cannot be undone.\n\nAll your time-off requests will be lost forever.'
  );

  if (confirmed) {
    const finalConfirmation = prompt(
      'Type "DELETE" to confirm account deletion:'
    );

    if (finalConfirmation === 'DELETE') {
      try {
        const response = await fetch('/auth/account', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();

        if (data.success) {
          showToast('Account deleted successfully', 'success');
          setTimeout(() => {
            window.location.href = '/auth/login?message=account_deleted';
          }, 2000);
        } else {
          throw new Error(data.error || 'Failed to delete account');
        }
      } catch (error) {
        logger.logError(error, { 
          operation: 'deleteAccount',
          userId: window.currentUserData?.id 
        });
        showToast('Failed to delete account', 'error');
      }
    } else {
      showToast(
        'Account deletion cancelled. You must type "DELETE" exactly.',
        'info'
      );
    }
  }
}

/**
 * Formats a date to a readable string format
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date string in 'MMM dd, yyyy' format
 * @example
 * formatDate(new Date()) // Returns 'Jul 22, 2025'
 * formatDate('2025-07-22') // Returns 'Jul 22, 2025'
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date to include both date and time
 * @param {Date|string|number} date - Date to format
 * @returns {string} Formatted date-time string in 'MMM dd, yyyy, hh:mm AM/PM' format
 * @example
 * formatDateTime(new Date()) // Returns 'Jul 22, 2025, 02:30 PM'
 */
function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Resets all settings to their default values
 * Shows confirmation dialog before resetting form values
 * @returns {void}
 */
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    // Reset form values to defaults
    // Application settings removed - reset function simplified

    showToast(
      'Settings reset to defaults. Click "Save Settings" to apply.',
      'info'
    );
  }
}

/**
 * Wrapper function to confirm and delete user account
 * Called from the danger zone section in settings
 * @returns {void}
 */
function confirmDeleteAccount() {
  deleteAccount();
}

/**
 * Check for replies functionality
 * Manually triggers reply checking for the current user
 */
window.checkForReplies = async function () {
  const checkRepliesBtn = document.getElementById('checkRepliesBtn');
  const checkRepliesText = document.getElementById('checkRepliesText');
  const checkRepliesError = document.getElementById('checkRepliesError');

  try {
    // Show loading state
    if (checkRepliesBtn) {
      checkRepliesBtn.disabled = true;
      checkRepliesBtn.querySelector('i').setAttribute('class', 'spinner-border spinner-border-sm me-1');
    }
    if (checkRepliesText) {
      checkRepliesText.textContent = 'Checking...';
    }

    // Hide previous errors
    if (checkRepliesError) {
      checkRepliesError.style.display = 'none';
    }

    const response = await fetch('/api/check-replies', { method: 'POST' });
    const result = await response.json();

    if (result.success) {
      // Show success modal
      showRepliesFoundModal(result.data);

      // Update symbols immediately for affected requests
      if (result.data.updatedRequests.length > 0) {
        updateRequestSymbols(result.data.updatedRequests);
      }

      // Update badge counter
      if (typeof updateBadgeCounter === 'function') {
        await updateBadgeCounter();
      }

      // Refresh calendar after 1 second (following existing pattern)
      setTimeout(() => {
        if (typeof loadExistingRequests === 'function') {
          loadExistingRequests();
        }
      }, 1000);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    // Show persistent error icon with tooltip
    if (checkRepliesError) {
      checkRepliesError.style.display = 'inline';
      checkRepliesError.title = `Error checking replies: ${error.message}`;

      // Initialize tooltip if not already done
      if (window.bootstrap && bootstrap.Tooltip) {
        new bootstrap.Tooltip(checkRepliesError);
      }
    }

    console.error('Reply check failed:', error);

    // Only show toast for non-network errors to avoid spam
    if (!error.message.includes('fetch')) {
      showToast('Failed to check for replies', 'error');
    }
  } finally {
    // Reset button
    if (checkRepliesBtn) {
      checkRepliesBtn.disabled = false;
      checkRepliesBtn.querySelector('i').setAttribute('class', 'bi bi-envelope-check me-1');
    }
    if (checkRepliesText) {
      checkRepliesText.textContent = 'Check Replies';
    }
  }
};

/**
 * Show modal with reply check results
 */
function showRepliesFoundModal(data) {
  const { newRepliesCount, totalChecked } = data;

  let message;
  if (newRepliesCount === 0) {
    message = `Checked ${totalChecked} requests. No new replies found.`;
  } else {
    message = `Found ${newRepliesCount} new repl${newRepliesCount === 1 ? 'y' : 'ies'}! Check the Replies page to review.`;
  }

  // Create and show modal
  const modalHtml = `
    <div class="modal fade" id="repliesCheckModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title">
              <i class="bi bi-envelope-check me-2"></i>
              Reply Check Complete
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body text-center">
            <div class="mb-3">
              ${
                newRepliesCount > 0
                  ? `<i class="bi bi-check-circle-fill text-success display-4"></i>`
                  : `<i class="bi bi-info-circle-fill text-info display-4"></i>`
              }
            </div>
            <p class="mb-0">${message}</p>
          </div>
          <div class="modal-footer">
            ${
              newRepliesCount > 0
                ? `<a href="/replies" class="btn btn-primary">
                <i class="bi bi-reply-all me-1"></i>
                View Replies
              </a>`
                : ''
            }
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Remove existing modal if present
  const existingModal = document.getElementById('repliesCheckModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Add modal to page
  document.body.insertAdjacentHTML('beforeend', modalHtml);

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById('repliesCheckModal')
  );
  modal.show();

  // Remove modal from DOM when hidden
  document
    .getElementById('repliesCheckModal')
    .addEventListener('hidden.bs.modal', function () {
      this.remove();
    });
}

/**
 * Update request symbols in calendar (✅ → 📧 → removed)
 */
function updateRequestSymbols(updatedRequests) {
  if (!updatedRequests || updatedRequests.length === 0) return;

  updatedRequests.forEach(request => {
    // Find request elements in calendar
    const requestElements = document.querySelectorAll(
      `[data-request-id="${request.id}"]`
    );

    requestElements.forEach(element => {
      const symbolElement = element.querySelector('.email-status-symbol');
      if (symbolElement) {
        if (request.needsReview) {
          // Change to needs review symbol
          symbolElement.innerHTML = '📧';
          symbolElement.title = 'Reply received - needs review';
        } else {
          // Remove symbol (processed)
          symbolElement.innerHTML = '';
          symbolElement.title = '';
        }
      }
    });
  });
}

/**
 * Update the replies badge counter in navbar
 * Works on all pages to show number of replies needing review
 */
async function updateBadgeCounter() {
  try {
    const response = await fetch('/api/replies/count');
    const result = await response.json();

    if (result.success) {
      const badge = document.getElementById('repliesBadge');
      if (badge) {
        if (result.data.count > 0) {
          badge.textContent = result.data.count;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'updateBadgeCounter'
    });
  }
}

// Make functions globally available
window.logout = logout;
window.openSettingsModal = openSettingsModal;
window.loadSettings = loadSettings;
window.loadGmailStatus = loadGmailStatus;
window.updateEmailPreferenceUI = updateEmailPreferenceUI;
window.selectEmailPreference = selectEmailPreference;
window.updateEmailPreference = updateEmailPreference;
window.updateEmailMethodCardHighlights = updateEmailMethodCardHighlights;
window.loadEmailPreferences = loadEmailPreferences;
window.connectGmail = connectGmail;
window.disconnectGmail = disconnectGmail;
window.showToast = showToast;
window.deleteAccount = deleteAccount;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.resetSettings = resetSettings;
window.confirmDeleteAccount = confirmDeleteAccount;
window.updateBadgeCounter = updateBadgeCounter;

// ===================================================================
// ACCESSIBILITY FIXES
// ===================================================================

// Fix Bootstrap modal accessibility issue with aria-hidden and focused elements
document.addEventListener('DOMContentLoaded', function () {
  // Add global modal accessibility fix
  document.addEventListener('hide.bs.modal', function (event) {
    const modal = event.target;
    const focusedElement = modal.querySelector(':focus');
    if (focusedElement) {
      focusedElement.blur();
    }
  });
  
  // Update replies badge counter on every page load
  if (typeof updateBadgeCounter === 'function') {
    updateBadgeCounter();
  }
});

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    logout,
    openSettingsModal,
    loadSettings,
    showToast,
    formatDate,
    formatDateTime,
  };
}
