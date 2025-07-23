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

// Removed - use global authorizeGmail function from utils.js

/**
 * Checks the current Gmail authorization status
 * @returns {void}
 */
// Removed - use global function directly

/**
 * Shows Gmail authorization information modal
 * @returns {void}
 */
// Removed - use global function directly

/**
 * Resets all settings to their default values
 * @returns {void}
 */
// Removed - use global function directly

/**
 * Initiates account deletion confirmation process
 * @returns {void}
 */
// Removed - use global function directly

// Event listeners for settings modal
document.addEventListener('DOMContentLoaded', function () {
  // Add event listeners for email preference cards
  const manualCard = document.getElementById('manualCard');
  const automaticCard = document.getElementById('automaticCard');

  if (manualCard) {
    manualCard.addEventListener('click', () => selectEmailPreference('manual'));
  }

  if (automaticCard) {
    automaticCard.addEventListener('click', () =>
      selectEmailPreference('automatic')
    );
  }

  // Add event listener for Gmail authorization button
  const gmailBtn = document.getElementById('authorizeGmailBtn');
  if (gmailBtn) {
    gmailBtn.addEventListener('click', authorizeGmail);
  }

  // Form submissions
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (window.handleProfileUpdate) {
        window.handleProfileUpdate(new FormData(this));
      }
    });
  }

  // Event delegation for data-action buttons
  document.addEventListener('click', function (e) {
    const button = e.target.closest('[data-action]');
    if (!button) {return;}

    const action = button.getAttribute('data-action');

    switch (action) {
      case 'checkGmailAuth':
        if (window.checkGmailAuth) {window.checkGmailAuth();}
        break;
      case 'showGmailAuth':
        if (window.showGmailAuth) {window.showGmailAuth();}
        break;
      case 'confirmDeleteAccount':
        if (window.confirmDeleteAccount) {window.confirmDeleteAccount();}
        break;
      case 'authorizeGmail':
        if (window.authorizeGmail) {window.authorizeGmail();}
        break;
    }
  });
});

// Make functions globally available
window.selectEmailPreference = selectEmailPreference;
// Other functions (authorizeGmail, checkGmailAuth, showGmailAuth, confirmDeleteAccount) are available from utils.js
