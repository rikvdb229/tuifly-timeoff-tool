/**
 * TUIfly Time-Off Tool - Group Request Modal Component
 * Handles group request modal functionality
 */

// Update global JavaScript variables with environment values
if (typeof window.TUIFLY_CONFIG === 'undefined') {
  window.TUIFLY_CONFIG = {};
}

// This will be populated by the server-rendered data in the template
window.updateTUIFlyConfig = function(config) {
  window.TUIFLY_CONFIG = {
    ...window.TUIFLY_CONFIG,
    ...config
  };
};

// Update message counter
function updateMessageCounter(length) {
  const counter = document.getElementById('messageCounter');
  if (counter) {
    counter.textContent = length;
  }
}

// Update request preview based on current form data
function updateRequestPreview() {
  // This function will be expanded in the calendar JavaScript to show real preview
  console.log('Request preview updated');
}

// Submit group request
async function submitGroupRequest() {
  try {
    // Implementation will be in calendar.js
    console.log('Submitting group request...');
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