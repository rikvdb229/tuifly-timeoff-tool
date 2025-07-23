/**
 * TUIfly Time-Off Tool - Onboarding Page JavaScript
 * Handles step navigation, form validation, Gmail authorization, and data persistence
 */

// ===================================================================
// GLOBAL STATE MANAGEMENT
// ===================================================================
let currentStep = 1;
let onboardingData = {
  name: '',
  code: '',
  signature: '',
  emailPreference: 'manual',
};
let gmailAuthorized = false;

// ===================================================================
// DATA PERSISTENCE (survives page redirects)
// ===================================================================
function saveOnboardingData() {
  sessionStorage.setItem('onboardingData', JSON.stringify(onboardingData));
}

function loadOnboardingData() {
  const saved = sessionStorage.getItem('onboardingData');
  if (saved) {
    onboardingData = JSON.parse(saved);

    // Restore form fields if they exist
    const nameField = document.getElementById('name');
    const codeField = document.getElementById('code');
    const signatureField = document.getElementById('signature');

    if (nameField && onboardingData.name) {nameField.value = onboardingData.name;}
    if (codeField && onboardingData.code) {codeField.value = onboardingData.code;}
    if (signatureField && onboardingData.signature)
      {signatureField.value = onboardingData.signature;}
  }
}

function clearOnboardingData() {
  sessionStorage.removeItem('onboardingData');
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================
function showToast(message, type = 'info') {
  // Simple toast notification
  const toast = document.createElement('div');
  toast.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
  toast.style.cssText =
    'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
  toast.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function showError(message) {
  showToast(message, 'error');
}

function showSuccess(message) {
  showToast(message, 'success');
}

function updateProgressBar(step) {
  const progress = (step / 4) * 100;
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
}

function showValidationError(field, message) {
  if (field) {
    field.classList.add('is-invalid');
    const feedback = field.nextElementSibling;
    if (feedback && feedback.classList.contains('invalid-feedback')) {
      feedback.textContent = message;
    }
  }
  showError(message);
}

function clearValidationErrors() {
  document.querySelectorAll('.is-invalid').forEach(el => {
    el.classList.remove('is-invalid');
  });
}

// ===================================================================
// STEP NAVIGATION
// ===================================================================
function showStep(stepNumber) {
  // Hide all steps
  document.querySelectorAll('.step').forEach(step => {
    step.classList.remove('active');
    step.style.display = 'none';
  });

  // Show target step
  const targetStep = document.getElementById(`step${stepNumber}`);
  if (targetStep) {
    targetStep.classList.add('active');
    targetStep.style.display = 'block';
  }

  currentStep = stepNumber;
  updateProgressBar(stepNumber);

  // Handle step-specific logic
  if (stepNumber === 4) {
    populateReview();
  }
}

function nextStep(targetStep) {
  if (currentStep === 2 && !validateProfileStep()) {
    return;
  }
  if (currentStep === 3 && !validateEmailStep()) {
    return;
  }

  // Additional check for code availability before moving from step 2
  if (currentStep === 2 && targetStep === 3) {
    checkCodeAndProceed(targetStep);
    return;
  }

  showStep(targetStep);
}

// Check code availability before proceeding to next step
async function checkCodeAndProceed(targetStep) {
  const codeField = document.getElementById('code');
  const code = codeField.value.trim().toUpperCase();

  if (code.length === 3) {
    // Show loading state
    const continueBtn = document.querySelector(
      'button[data-action="nextStep"][data-target="3"]'
    );
    const originalText = continueBtn.innerHTML;
    continueBtn.disabled = true;
    continueBtn.innerHTML =
      '<i class="bi bi-hourglass-split me-2"></i>Checking code...';

    const result = await checkCodeAvailability(code);

    // Restore button
    continueBtn.disabled = false;
    continueBtn.innerHTML = originalText;

    if (result.available) {
      showStep(targetStep);
    } else {
      showValidationError(codeField, result.message || 'Code is not available');
    }
  } else {
    showStep(targetStep);
  }
}

function prevStep(targetStep) {
  showStep(targetStep);
}

// ===================================================================
// VALIDATION FUNCTIONS
// ===================================================================
function validateProfileStep() {
  clearValidationErrors();

  const nameField = document.getElementById('name');
  const codeField = document.getElementById('code');
  const signatureField = document.getElementById('signature');

  let isValid = true;

  // Validate name
  if (!nameField.value.trim()) {
    showValidationError(nameField, 'Name is required');
    isValid = false;
  } else {
    onboardingData.name = nameField.value.trim();
  }

  // Validate code
  const codeValue = codeField.value.trim().toUpperCase();
  if (!codeValue) {
    showValidationError(codeField, 'Code is required');
    isValid = false;
  } else if (codeValue.length !== 3 || !/^[A-Z]{3}$/.test(codeValue)) {
    showValidationError(codeField, 'Code must be exactly 3 uppercase letters');
    isValid = false;
  } else {
    onboardingData.code = codeValue;
    codeField.value = codeValue; // Ensure it's uppercase in the field
  }

  // Validate signature - auto-fill with placeholder if empty
  let signatureValue = signatureField.value.trim();
  if (!signatureValue) {
    // Auto-fill with placeholder if empty (like original behavior)
    const placeholder = signatureField.getAttribute('placeholder');
    if (placeholder) {
      signatureValue = placeholder.trim();
      signatureField.value = placeholder;
    }
  }

  if (signatureValue && signatureValue.length >= 2) {
    onboardingData.signature = signatureValue;
  } else {
    showValidationError(
      signatureField,
      'Signature is required and must be at least 2 characters'
    );
    isValid = false;
  }

  // Save data to sessionStorage after validation
  if (isValid) {
    saveOnboardingData();
  }

  return isValid;
}

function validateEmailStep() {
  if (!onboardingData.emailPreference) {
    showError('Please select an email method');
    return false;
  }

  if (onboardingData.emailPreference === 'automatic' && !gmailAuthorized) {
    showError('Gmail authorization is required for automatic email sending');
    return false;
  }

  return true;
}

// Check code availability in database (matches backend route)
async function checkCodeAvailability(code) {
  try {
    const response = await fetch('/onboarding/check-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: code.toUpperCase() }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Code check error:', error);
    return {
      available: false,
      message: 'Error checking code availability',
    };
  }
}

// ===================================================================
// EMAIL PREFERENCE HANDLING
// ===================================================================
function selectEmailPreference(preference) {
  onboardingData.emailPreference = preference;
  saveOnboardingData(); // Save when email preference changes

  // Update card selection visually
  document.querySelectorAll('.email-method-card').forEach(card => {
    card.classList.remove('border-primary', 'bg-light', 'selected');
  });

  const selectedCard = document.getElementById(
    preference === 'manual' ? 'manualCard' : 'automaticCard'
  );
  if (selectedCard) {
    selectedCard.classList.add('border-primary', 'bg-light', 'selected');
  }

  // Handle automatic email selection
  if (preference === 'automatic' && !gmailAuthorized) {
    document.getElementById('gmailAuthSection').style.display = 'block';
    document.getElementById('emailNextBtn').disabled = true;
  } else {
    document.getElementById('gmailAuthSection').style.display = 'none';
    document.getElementById('emailNextBtn').disabled = false;
  }
}

async function authorizeGmail() {
  try {
    const btn = document.getElementById('authorizeGmailBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Redirecting...';

    // Set redirect target
    await fetch('/auth/set-gmail-redirect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        redirectTo: '/onboarding?gmail_success=1&step=4',
      }),
    });

    // Redirect to Gmail OAuth
    window.location.href = '/auth/google/gmail';
  } catch (error) {
    showError('Failed to start Gmail authorization');
    const btn = document.getElementById('authorizeGmailBtn');
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-google me-2"></i>Authorize Gmail Access';
  }
}

// ===================================================================
// REVIEW AND COMPLETION
// ===================================================================
function populateReview() {
  document.getElementById('reviewName').textContent =
    onboardingData.name || 'Not set';
  document.getElementById('reviewCode').textContent =
    onboardingData.code || 'Not set';

  // For signature, show the actual value or indicate it will use placeholder
  let signatureDisplay = onboardingData.signature;
  if (!signatureDisplay) {
    const signatureField = document.getElementById('signature');
    const placeholder = signatureField?.getAttribute('placeholder');
    signatureDisplay = placeholder || 'Not set';
  }
  document.getElementById('reviewSignature').textContent = signatureDisplay;

  const emailMethod =
    onboardingData.emailPreference === 'automatic'
      ? 'Automatic (Gmail)'
      : 'Manual (Copy & Paste)';
  document.getElementById('reviewEmailMethod').textContent = emailMethod;
}

async function completeOnboarding() {
  try {
    const btn = document.getElementById('completeBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Completing...';

    // Ensure signature is populated if empty (final check before sending)
    if (!onboardingData.signature) {
      const signatureField = document.getElementById('signature');
      const placeholder = signatureField?.getAttribute('placeholder');
      if (placeholder) {
        onboardingData.signature = placeholder.trim();
      }
    }

    console.log('Completing onboarding with data:', onboardingData);

    const response = await fetch('/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(onboardingData),
    });

    const result = await response.json();
    console.log('Server response:', result);

    if (result.success) {
      showSuccess('Onboarding completed successfully!');
      clearOnboardingData(); // Clean up stored data after successful completion
      setTimeout(() => {
        // Handle both redirect and redirectUrl properties from backend
        window.location.href = result.redirectUrl || result.redirect || '/';
      }, 1500);
    } else {
      // Handle validation errors from backend
      if (result.requiresGmailAuth) {
        showError(
          'Gmail authorization is required for automatic email sending.'
        );
        showStep(3); // Go back to email preference step
      } else if (result.details) {
        // Show field-specific validation errors
        showValidationErrors(result.details);
      } else {
        throw new Error(result.error || 'Failed to complete onboarding');
      }
    }
  } catch (error) {
    console.error('Onboarding error:', error);
    showError(`Failed to complete onboarding: ${error.message}`);

    const btn = document.getElementById('completeBtn');
    btn.disabled = false;
    btn.innerHTML = 'Complete Setup <i class="bi bi-check-circle ms-2"></i>';
  }
}

// Handle validation errors from server
function showValidationErrors(errors) {
  clearValidationErrors();

  errors.forEach(error => {
    const field = document.getElementById(error.field);
    if (field) {
      showValidationError(field, error.message);
    } else {
      // If field not found, show as general error
      showError(`${error.field}: ${error.message}`);
    }
  });
}

// ===================================================================
// INITIALIZATION
// ===================================================================
document.addEventListener('DOMContentLoaded', function () {
  const urlParams = new URLSearchParams(window.location.search);
  const gmailSuccess = urlParams.get('gmail_success') === '1';
  const startStep = parseInt(urlParams.get('step') || '1');

  // Load any saved onboarding data first
  loadOnboardingData();

  // Handle Gmail authorization success
  if (gmailSuccess) {
    gmailAuthorized = true;
    onboardingData.emailPreference = 'automatic';
    saveOnboardingData(); // Save the email preference
    showSuccess('Gmail authorization successful!');
  }

  // Start on the correct step
  showStep(startStep);

  // ===================================================================
  // EVENT LISTENERS FOR BUTTONS (replaced inline onclick handlers)
  // ===================================================================

  // Navigation buttons (nextStep/prevStep)
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-action]')) {
      const button = e.target.closest('[data-action]');
      const action = button.dataset.action;
      const target = parseInt(button.dataset.target);

      if (action === 'nextStep') {
        nextStep(target);
      } else if (action === 'prevStep') {
        prevStep(target);
      }
    }
  });

  // Email preference cards
  document.addEventListener('click', function (e) {
    const card = e.target.closest('[data-preference]');
    if (card) {
      const preference = card.dataset.preference;
      selectEmailPreference(preference);
    }
  });

  // Gmail authorization button
  const authorizeGmailBtn = document.getElementById('authorizeGmailBtn');
  if (authorizeGmailBtn) {
    authorizeGmailBtn.addEventListener('click', authorizeGmail);
  }

  // Complete onboarding button
  const completeBtn = document.getElementById('completeBtn');
  if (completeBtn) {
    completeBtn.addEventListener('click', completeOnboarding);
  }

  // Auto-uppercase code field and add real-time validation
  const codeField = document.getElementById('code');
  if (codeField) {
    codeField.addEventListener('input', function (e) {
      e.target.value = e.target.value.toUpperCase();

      // Clear validation errors when user types
      if (e.target.classList.contains('is-invalid')) {
        e.target.classList.remove('is-invalid');
        const feedback = e.target.nextElementSibling;
        if (feedback && feedback.classList.contains('invalid-feedback')) {
          feedback.textContent = '';
        }
      }
    });

    // Check code availability on blur (when user leaves the field)
    codeField.addEventListener('blur', async function (e) {
      const code = e.target.value.trim();
      if (code.length === 3 && /^[A-Z]{3}$/.test(code)) {
        const result = await checkCodeAvailability(code);
        if (!result.available) {
          showValidationError(
            e.target,
            result.message || 'Code is not available'
          );
        }
      }
    });
  }

  // Pre-fill name if available from server
  const nameField = document.getElementById('name');
  if (nameField && nameField.value && !onboardingData.name) {
    onboardingData.name = nameField.value;
    saveOnboardingData();
  }

  // If we're on step 3 and have automatic preference, update UI
  if (startStep === 3 && onboardingData.emailPreference === 'automatic') {
    selectEmailPreference('automatic');
  }
});
