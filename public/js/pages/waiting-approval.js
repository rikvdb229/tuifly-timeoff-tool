// Check approval status function
async function checkApprovalStatus() {
  try {
    const response = await fetch('/auth/status');
    const result = await response.json();

    // FIXED: Add null check for result.user
    if (result.authenticated && result.user && result.user.canUseApp) {
      // User is now approved! Redirect to main app
      window.location.href = '/';
    } else {
      // Still pending
      const btn = document.querySelector(
        'button[onclick="checkApprovalStatus()"]'
      );
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="bi bi-clock"></i> Still Pending...';
      btn.disabled = true;

      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }, 2000);
    }
  } catch (error) {
    console.error('Error checking approval status:', error);
    alert('Error checking status. Please try again.');
  }
}