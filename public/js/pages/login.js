/**
 * TUIfly Time-Off Tool - Login Page JavaScript
 * Handles Google login button interactions and page functionality
 */

document.addEventListener('DOMContentLoaded', function () {
  // Handle Google login button click
  const button = document.getElementById('googleLoginBtn');

  if (button) {
    button.addEventListener('click', function (e) {
      e.preventDefault();

      // Show loading state
      button.classList.add('btn-loading');
      button.textContent = 'Signing in...';

      // Redirect after short delay for visual feedback
      setTimeout(() => {
        window.location.href = '/auth/google';
      }, 300);
    });
  }

  // Auto-dismiss alerts after 5 seconds
  setTimeout(function () {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(function (alert) {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    });
  }, 5000);
});

// Handle browser back button
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    // Reset button state if page is loaded from cache
    const button = document.getElementById('googleLoginBtn');
    if (button) {
      button.classList.remove('btn-loading');
      button.innerHTML =
        '<i class="bi bi-google me-2"></i>Continue with Google';
    }
  }
});
