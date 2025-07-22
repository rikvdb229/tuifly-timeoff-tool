/**
 * TUIfly Time-Off Tool - Settings Modal Component
 * Handles settings modal functionality
 */

// Email preference selection
function selectEmailPreference(preference) {
  console.log('Selecting email preference:', preference);
  
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

// Gmail authorization functions
function authorizeGmail() {
  console.log('Authorizing Gmail...');
  if (window.handleGmailAuth) {
    window.handleGmailAuth();
  } else {
    // Fallback redirect
    window.location.href = '/auth/gmail';
  }
}

function checkGmailAuth() {
  console.log('Checking Gmail authorization...');
  if (window.checkGmailAuthStatus) {
    window.checkGmailAuthStatus();
  }
}

function showGmailAuth() {
  console.log('Showing Gmail authorization...');
  if (window.showGmailAuthModal) {
    window.showGmailAuthModal();
  }
}

// Settings form handlers
function resetSettings() {
  console.log('Resetting settings to defaults...');
  if (window.handleResetSettings) {
    window.handleResetSettings();
  }
}

// Account deletion
function confirmDeleteAccount() {
  console.log('Confirming account deletion...');
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