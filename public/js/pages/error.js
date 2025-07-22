/**
 * TUIfly Time-Off Tool - Error Page JavaScript
 * Handles error page interactions
 */

document.addEventListener('DOMContentLoaded', function() {
  // Handle go back button
  const backBtn = document.getElementById('goBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', function(e) {
      e.preventDefault();
      history.back();
    });
  }
});