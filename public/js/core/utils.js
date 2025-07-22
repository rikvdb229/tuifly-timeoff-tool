/**
 * Core Utilities Module
 * Contains base JavaScript functions, utilities, and settings management
 */

// Base JavaScript functions for all pages

// Modern logout function using modernConfirm
async function logout() {
  const confirmed = await modernConfirm(
    'Are you sure you want to logout? You will be redirected to the login page.',
    'Logout Confirmation',
    'logout'
  );

  if (confirmed) {
    showToast('Logging out...', 'info');
    window.location.href = '/auth/logout';
  }
}

// Settings modal functions
async function openSettingsModal() {
  const modal = new bootstrap.Modal(document.getElementById('settingsModal'));
  modal.show();

  // Load settings when modal opens
  await loadSettings();
}

async function loadSettings() {
  const settingsLoading = document.getElementById('settingsLoading');
  const settingsContent = document.getElementById('settingsContent');

  if (settingsLoading) settingsLoading.style.display = 'block';
  if (settingsContent) settingsContent.style.display = 'none';

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

      if (userName) userName.value = data.data.user.name || '';
      if (userCode) userCode.value = data.data.user.code || '';
      if (userSignature) userSignature.value = data.data.user.signature || '';

      // Populate settings form
      const theme = document.getElementById('theme');
      const language = document.getElementById('language');
      const notifications = document.getElementById('notifications');
      const autoSave = document.getElementById('autoSave');

      if (theme) theme.value = data.data.settings.theme || 'light';
      if (language) language.value = data.data.settings.language || 'en';
      if (notifications)
        notifications.checked = data.data.settings.notifications !== false;
      if (autoSave) autoSave.checked = data.data.settings.autoSave !== false;

      // Populate global settings (read-only)
      const minAdvanceDays = document.getElementById('minAdvanceDays');
      const maxAdvanceDays = document.getElementById('maxAdvanceDays');
      const maxDaysPerRequest = document.getElementById('maxDaysPerRequest');
      const approverEmail = document.getElementById('approverEmail');

      if (minAdvanceDays) minAdvanceDays.textContent = data.data.globalSettings?.MIN_ADVANCE_DAYS || 60;
      if (maxAdvanceDays) maxAdvanceDays.textContent = data.data.globalSettings?.MAX_ADVANCE_DAYS || 120;
      if (maxDaysPerRequest) maxDaysPerRequest.textContent = data.data.globalSettings?.MAX_DAYS_PER_REQUEST || 4;
      if (approverEmail) approverEmail.textContent = data.data.globalSettings?.TUIFLY_APPROVER_EMAIL || 'scheduling@tuifly.be';
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showToast('Failed to load settings', 'error');
  } finally {
    if (settingsLoading) settingsLoading.style.display = 'none';
    if (settingsContent) settingsContent.style.display = 'block';
  }
}

// Email preference management functions
let currentEmailPreference = 'manual';
let gmailConnected = false;

// Load Gmail status (called when settings modal opens)
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
    console.error('Error loading Gmail status:', error);
  }
}

// Update email preference UI
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
    headerEmailModeBadge.className = 
      `badge ms-1 ${currentEmailPreference === 'automatic' ? 'bg-primary' : 'bg-success'}`;
  }
}

// ✅ NEW: Email preference functions for card-based UI
function selectEmailPreference(preference) {
  console.log(`Selecting email preference: ${preference}`);
  
  // If selecting automatic but Gmail not connected, show auth section
  if (preference === 'automatic' && !gmailConnected) {
    const gmailAuthSection = document.getElementById('gmailAuthSection');
    if (gmailAuthSection) {
      gmailAuthSection.style.display = 'block';
    }
    
    // Highlight the automatic card but don't update preference yet
    updateEmailMethodCardHighlights('automatic');
    showToast('Gmail authorization required for automatic email mode', 'warning');
    return;
  }

  // Update preference via API
  updateEmailPreference(preference);
}

// ✅ NEW: Update email preference via API
async function updateEmailPreference(preference) {
  const oldMode = currentEmailPreference;

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
      updateEmailPreferenceUI();
      showToast(result.message, 'success');
      
      // Hide Gmail auth section if switching to manual
      if (preference === 'manual') {
        const gmailAuthSection = document.getElementById('gmailAuthSection');
        if (gmailAuthSection) {
          gmailAuthSection.style.display = 'none';
        }
      }

      // Refresh calendar if function exists
      if (typeof loadExistingRequests === 'function') {
        console.log('Refreshing calendar after email preference change...');
        await loadExistingRequests();
      }
      
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
    console.error('Email preference update error:', error);
    showToast('Failed to update email preference', 'error');
    
    // Reset card selection to previous state
    updateEmailMethodCardHighlights(currentEmailPreference);
  }
}

// ✅ NEW: Update card highlights based on current preference
function updateEmailMethodCardHighlights(preference) {
  // Clear all selections
  document.querySelectorAll('.email-method-card').forEach((card) => {
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

// Load email preferences (called from loadSettings)
function loadEmailPreferences(data) {
  currentEmailPreference = data.emailPreference || 'manual';
  gmailConnected = data.gmailConnected || false;
  updateEmailPreferenceUI();
}

// Check authorization status manually
window.checkGmailAuth = async function() {
  console.log('Checking Gmail authorization status...');
  await loadGmailStatus();
  
  const status = gmailConnected ? 'Connected' : 'Not Connected';
  const message = `Gmail Status: ${status}\nEmail Mode: ${currentEmailPreference}`;
  
  if (!gmailConnected && currentEmailPreference === 'automatic') {
    const shouldAuthorize = confirm(message + '\n\nWould you like to authorize Gmail now?');
    if (shouldAuthorize) {
      await connectGmail();
    }
  } else {
    alert(message);
  }
};

// Force show Gmail authorization section
window.showGmailAuth = function() {
  const gmailAuthSection = document.getElementById('gmailAuthSection');
  if (gmailAuthSection) {
    gmailAuthSection.style.display = 'block';
  }
};

// Gmail authorization function (alias for connectGmail)
window.authorizeGmail = async function() {
  await connectGmail();
};

// ✅ NEW: Connect Gmail function
async function connectGmail() {
  try {
    const authorizeBtn = document.getElementById('authorizeGmailBtn');
    if (authorizeBtn) {
      authorizeBtn.disabled = true;
      authorizeBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Connecting...';
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
    console.error('Gmail connection error:', error);
    showToast('Failed to connect Gmail. Please try again.', 'error');
    
    const authorizeBtn = document.getElementById('authorizeGmailBtn');
    if (authorizeBtn) {
      authorizeBtn.disabled = false;
      authorizeBtn.innerHTML = '<i class="bi bi-google me-2"></i>Authorize Gmail Access';
    }
  }
}

// ✅ NEW: Disconnect Gmail function
async function disconnectGmail() {
  if (!confirm('Are you sure you want to disconnect Gmail? This will switch your email preference to manual mode.')) {
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
    console.error('Gmail disconnection error:', error);
    showToast('Failed to disconnect Gmail. Please try again.', 'error');
  }
}

// Handle Gmail success from URL (when redirected back)
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.get('gmail_success') === '1') {
    showToast('Gmail connected successfully! Email preference set to automatic.', 'success');
    
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

      const formData = {
        name: document.getElementById('userName').value,
        code: document.getElementById('userCode').value,
        signature: document.getElementById('userSignature').value,
      };

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
        console.error('Profile update error:', error);
        showToast('Failed to update profile', 'error');
      }
    });
  }

  // Settings form submission
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const formData = {
        theme: document.getElementById('theme').value,
        language: document.getElementById('language').value,
        notifications: document.getElementById('notifications').checked,
        autoSave: document.getElementById('autoSave').checked,
      };

      try {
        const response = await fetch('/settings/preferences', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(formData),
        });

        const data = await response.json();

        if (data.success) {
          showToast('Settings saved successfully', 'success');
        } else {
          throw new Error(data.error || 'Failed to save settings');
        }
      } catch (error) {
        console.error('Settings save error:', error);
        showToast('Failed to save settings', 'error');
      }
    });
  }
});

// Toast notification system
function showToast(message, type = 'info') {
  // Create toast container if it doesn't exist
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className =
      'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '9999';
    document.body.appendChild(toastContainer);
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
    <div id="${toastId}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
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

// Delete user account
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
        console.error('Account deletion error:', error);
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

// Utility functions
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Reset settings to defaults
function resetSettings() {
  if (confirm('Are you sure you want to reset all settings to defaults?')) {
    // Reset form values to defaults
    const theme = document.getElementById('theme');
    const language = document.getElementById('language');
    const notifications = document.getElementById('notifications');
    const autoSave = document.getElementById('autoSave');

    if (theme) theme.value = 'light';
    if (language) language.value = 'en';
    if (notifications) notifications.checked = true;
    if (autoSave) autoSave.checked = true;

    showToast('Settings reset to defaults. Click "Save Settings" to apply.', 'info');
  }
}

// Confirm delete account (called from danger zone)
function confirmDeleteAccount() {
  deleteAccount();
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

// Export for module usage if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    logout,
    openSettingsModal,
    loadSettings,
    showToast,
    formatDate,
    formatDateTime
  };
}