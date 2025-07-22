/**
 * TUIfly Time-Off Tool - Settings Modal Component
 * Handles settings modal functionality
 */

/**
 * Handles email preference selection in the settings modal
 * @param {string} preference - Email preference type ('manual' or 'automatic')
 * @returns {void}
 */
function selectEmailPreference(preference) {
  
  // Update visual selection
  const cards = document.querySelectorAll('.email-method-card');
  cards.forEach(card => {
    card.classList.remove('border-primary', 'bg-light');
  });
  
  const selectedCard = document.getElementById(preference + 'Card');
  if (selectedCard) {
    selectedCard.classList.add('border-primary', 'bg-light');
  }
  
  // Show/hide Gmail authorization section
  const gmailAuthSection = document.getElementById('gmailAuthSection');
  if (gmailAuthSection) {
    if (preference === 'automatic') {
      gmailAuthSection.style.display = 'block';
    } else {
      gmailAuthSection.style.display = 'none';
    }
  }
  
  // Store preference (this will be handled by main settings logic)
  if (window.updateEmailPreference) {
    window.updateEmailPreference(preference);
  }
}

/**
 * Initiates Gmail authorization process for automatic email sending
 * @returns {void}
 */
function authorizeGmail() {
  if (window.handleGmailAuth) {
    window.handleGmailAuth();
  } else {
    // Fallback redirect
    window.location.href = '/auth/gmail';
  }
}

/**
 * Checks the current Gmail authorization status
 * @returns {void}
 */
function checkGmailAuth() {
  if (window.checkGmailAuthStatus) {
    window.checkGmailAuthStatus();
  }
}

/**
 * Shows Gmail authorization information modal
 * @returns {void}
 */
function showGmailAuth() {
  if (window.showGmailAuthModal) {
    window.showGmailAuthModal();
  }
}

/**
 * Resets all settings to their default values
 * @returns {void}
 */
function resetSettings() {
  if (window.handleResetSettings) {
    window.handleResetSettings();
  }
}

/**
 * Initiates account deletion confirmation process
 * @returns {void}
 */
function confirmDeleteAccount() {
  if (window.handleDeleteAccount) {
    window.handleDeleteAccount();
  }
}

// Event listeners for settings modal
document.addEventListener('DOMContentLoaded', function() {
  // Add event listeners for email preference cards
  const manualCard = document.getElementById('manualCard');
  const automaticCard = document.getElementById('automaticCard');
  
  if (manualCard) {
    manualCard.addEventListener('click', () => selectEmailPreference('manual'));
  }
  
  if (automaticCard) {
    automaticCard.addEventListener('click', () => selectEmailPreference('automatic'));
  }
  
  // Add event listener for Gmail authorization button
  const gmailBtn = document.getElementById('authorizeGmailBtn');
  if (gmailBtn) {
    gmailBtn.addEventListener('click', authorizeGmail);
  }
  
  // Form submissions
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (window.handleProfileUpdate) {
        window.handleProfileUpdate(new FormData(this));
      }
    });
  }
  
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    settingsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      if (window.handleSettingsUpdate) {
        window.handleSettingsUpdate(new FormData(this));
      }
    });
  }
});

// Make functions globally available
window.selectEmailPreference = selectEmailPreference;
window.authorizeGmail = authorizeGmail;
window.checkGmailAuth = checkGmailAuth;
window.showGmailAuth = showGmailAuth;
window.resetSettings = resetSettings;
window.confirmDeleteAccount = confirmDeleteAccount;