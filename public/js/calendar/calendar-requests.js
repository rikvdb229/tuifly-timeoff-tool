/**
 * Calendar Requests Module
 * Contains API calls, request CRUD operations, and email generation
 */

// Global email preference variable - only use window.userEmailPreference
window.userEmailPreference = window.userEmailPreference || 'automatic';

// API Functions
async function loadExistingRequests() {
  try {
    const response = await fetch('/api/requests');
    const data = await response.json();

    if (data.success) {
      window.existingRequests = data.data;
      updateStatistics(data.data);
      if (window.calendar) {
        window.calendar.generateCalendar();
      }
      initializeTooltips();
    }
  } catch (error) {
    console.error('Error loading requests:', error);
    window.showToast('Failed to load existing requests', 'error');
  }
}

function updateStatistics(requests) {
  const pending = requests.filter((r) => r.status === 'PENDING').length;
  const approved = requests.filter((r) => r.status === 'APPROVED').length;
  const denied = requests.filter((r) => r.status === 'DENIED').length;

  document.getElementById('pendingCount').textContent = pending;
  document.getElementById('approvedCount').textContent = approved;
  document.getElementById('deniedCount').textContent = denied;
  document.getElementById('totalCount').textContent = requests.length;
}

function initializeTooltips() {
  const tooltipTriggerList = [].slice.call(
    document.querySelectorAll('[data-bs-toggle="tooltip"]')
  );
  tooltipTriggerList.map(
    (tooltipTriggerEl) => new bootstrap.Tooltip(tooltipTriggerEl)
  );
}

// Request status update functions
window.updateRequestStatus = async function (
  requestId,
  newStatus,
  updateGroup = false
) {
  console.log(
    'updateRequestStatus called:',
    requestId,
    newStatus,
    updateGroup
  );

  const statusText = newStatus === 'APPROVED' ? 'approve' : 'deny';
  const groupText = updateGroup ? ' entire group' : '';
  const message = `Are you sure you want to ${statusText} this${groupText} request? This action can be changed later if needed.`;

  // Use correct dialog type for deny
  const dialogType = newStatus === 'APPROVED' ? 'success' : 'denied';

  const confirmed = await window.showConfirmDialog(
    message,
    `${newStatus === 'APPROVED' ? 'Approve' : 'Deny'} Request${updateGroup ? ' Group' : ''}`,
    dialogType
  );

  if (confirmed) {
    try {
      const response = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          method: 'manual_user_update',
          updateGroup: updateGroup,
        }),
      });

      const result = await response.json();
      if (result.success) {
        const successMessage = updateGroup
          ? `${result.data.updatedCount} requests marked as ${newStatus.toLowerCase()}!`
          : `Request marked as ${newStatus.toLowerCase()}!`;

        window.showToast(successMessage, 'success');

        // Close modal and refresh calendar
        const modal = bootstrap.Modal.getInstance(
          document.getElementById('requestDetailModal')
        );
        modal.hide();
        await loadExistingRequests();
      } else {
        window.showToast(result.error || `Failed to ${statusText} request`, 'error');
      }
    } catch (error) {
      console.error(`Error ${statusText}ing request:`, error);
      window.showToast(`Failed to ${statusText} request`, 'error');
    }
  }
};

window.updateIndividualStatus = async function (requestId, newStatus) {
  console.log('updateIndividualStatus called:', requestId, newStatus);

  try {
    const response = await fetch(`/api/requests/${requestId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        method: 'manual_individual_update',
        updateGroup: false,
      }),
    });

    const result = await response.json();
    if (result.success) {
      // Update the button states for this specific request
      const allButtons = document.querySelectorAll(
        `[id^="${['deny', 'pending', 'approve'].join(`-btn-${requestId}"], [id^="`)}-btn-${requestId}"]`
      );
      allButtons.forEach((btn) => btn.classList.remove('active'));

      // Activate the correct button
      const buttonMap = {
        DENIED: `deny-btn-${requestId}`,
        PENDING: `pending-btn-${requestId}`,
        APPROVED: `approve-btn-${requestId}`,
      };

      const activeButton = document.getElementById(buttonMap[newStatus]);
      if (activeButton) {
        activeButton.classList.add('active');
      }

      // Update the status badge
      const statusBadge = document.getElementById(`status-badge-${requestId}`);
      if (statusBadge) {
        statusBadge.textContent = newStatus;
        statusBadge.className = `badge bg-${getStatusColor(newStatus)} me-3`;
      }

      window.showToast(`Date marked as ${newStatus.toLowerCase()}`, 'success');

      // Refresh calendar to show updated status
      setTimeout(() => loadExistingRequests(), 1000);
    } else {
      window.showToast(result.error || 'Failed to update status', 'error');
    }
  } catch (error) {
    console.error('Error updating individual status:', error);
    window.showToast('Failed to update status', 'error');
  }
};

// Bulk status update
window.bulkUpdateStatus = async function (newStatus) {
  console.log('bulkUpdateStatus called:', newStatus);

  const statusText = newStatus.toLowerCase();
  const confirmMessage = `Are you sure you want to mark ALL dates as ${statusText}?`;

  // Use appropriate dialog type
  let dialogType = 'warning';
  if (newStatus === 'APPROVED') dialogType = 'success';
  if (newStatus === 'DENIED') dialogType = 'denied';

  const confirmed = await window.showConfirmDialog(
    confirmMessage,
    `${newStatus === 'APPROVED' ? 'Approve' : newStatus === 'DENIED' ? 'Deny' : 'Reset'} All Dates`,
    dialogType
  );

  if (confirmed) {
    try {
      // Get all request IDs from the current modal
      const statusBadges = document.querySelectorAll('[id^="status-badge-"]');
      const requestIds = [];

      statusBadges.forEach((badge) => {
        const idMatch = badge.id.match(/status-badge-(\d+)/);
        if (idMatch) {
          requestIds.push(parseInt(idMatch[1]));
        }
      });

      if (requestIds.length === 0) {
        window.showToast('No requests found to update', 'error');
        return;
      }

      console.log('Updating request IDs:', requestIds);

      // Update all requests
      const updatePromises = requestIds.map((id) =>
        fetch(`/api/requests/${id}/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: newStatus,
            method: 'manual_bulk_update',
            updateGroup: false,
          }),
        })
      );

      const responses = await Promise.all(updatePromises);
      const results = await Promise.all(responses.map((r) => r.json()));

      // Check if all updates were successful
      const failedUpdates = results.filter((r) => !r.success);
      if (failedUpdates.length > 0) {
        console.error('Some updates failed:', failedUpdates);
        window.showToast(
          `Failed to update ${failedUpdates.length} requests`,
          'error'
        );
        return;
      }

      // Update all button states in the modal
      requestIds.forEach((requestId) => {
        // Remove active class from all buttons for this request
        const allButtons = document.querySelectorAll(
          `[id^="${['deny', 'pending', 'approve'].join(`-btn-${requestId}"], [id^="`)}-btn-${requestId}"]`
        );
        allButtons.forEach((btn) => btn.classList.remove('active'));

        // Activate the correct button
        const buttonMap = {
          DENIED: `deny-btn-${requestId}`,
          PENDING: `pending-btn-${requestId}`,
          APPROVED: `approve-btn-${requestId}`,
        };

        const activeButton = document.getElementById(buttonMap[newStatus]);
        if (activeButton) {
          activeButton.classList.add('active');
        }

        // Update the status badge
        const statusBadge = document.getElementById(`status-badge-${requestId}`);
        if (statusBadge) {
          statusBadge.textContent = newStatus;
          statusBadge.className = `badge bg-${getStatusColor(newStatus)} me-3`;
        }
      });

      window.showToast(
        `All ${requestIds.length} dates marked as ${statusText}`,
        'success'
      );

      // Refresh calendar to show updated status
      setTimeout(() => loadExistingRequests(), 1000);
    } catch (error) {
      console.error('Error in bulk update:', error);
      window.showToast('Failed to update all dates', 'error');
    }
  }
};

// Email generation functions
/**
 * Unified email content generation for both single and group requests
 * @param {Object} request - The request object (can be single or part of a group)
 * @returns {Object} Email content with to, subject, and body
 */
window.generateEmailContent = function (request) {
  // Determine if this is a group request and get all requests to process
  let requestsToProcess;
  if (request.groupId && window.existingRequests) {
    // Group request - get all requests in the group
    requestsToProcess = window.existingRequests
      .filter(r => r.groupId === request.groupId)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  } else {
    // Single request
    requestsToProcess = [request];
  }

  // Get month from the first request for the subject
  const firstDate = new Date(requestsToProcess[0].startDate);
  const month = firstDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  let bodyLines = ['Dear,', ''];

  // Process each request (1 for single, multiple for group)
  requestsToProcess.forEach((req) => {
    let line = `${req.startDate} - `;
    
    // Format request type
    switch (req.type) {
      case 'REQ_DO':
        line += 'REQ DO';
        break;
      case 'PM_OFF':
        line += 'PM OFF';
        break;
      case 'AM_OFF':
        line += 'AM OFF';
        break;
      case 'FLIGHT':
        line += 'FLIGHT';
        break;
      default:
        line += req.type;
    }

    // Add flight number if exists
    if (req.flightNumber) {
      line += ` ${req.flightNumber}`;
    }
    
    bodyLines.push(line);
  });

  // Add custom message if exists (from the main request)
  if (request.customMessage) {
    bodyLines.push('');
    bodyLines.push(request.customMessage);
  }

  // Add signature
  bodyLines.push('');
  bodyLines.push(window.currentUserData?.signature || 'Brgds,\nYour Name');

  return {
    to: window.TUIFLY_CONFIG?.APPROVER_EMAIL || 'scheduling@tuifly.be',
    subject: `${window.currentUserData?.code || 'RVB'} - CREW REQUEST - ${month}`,
    body: bodyLines.join('\n'),
  };
};

// Backward compatibility - keep old function names as aliases
window.generateSingleEmailContent = window.generateEmailContent;
window.generateGroupEmailContent = window.generateEmailContent;

// Email management functions
window.markEmailAsSent = async function (requestId) {
  console.log('markEmailAsSent called with requestId:', requestId);

  try {
    const response = await fetch(
      `/api/requests/${requestId}/mark-email-sent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    const result = await response.json();
    if (result.success) {
      const message = result.data?.groupId
        ? `Email marked as sent for group of ${result.data.updatedRequests} requests`
        : 'Email marked as sent successfully';

      window.showToast(message, 'success');

      // Close modal and refresh calendar
      const modal = bootstrap.Modal.getInstance(
        document.getElementById('requestDetailModal')
      );
      modal.hide();
      await loadExistingRequests();
    } else {
      window.showToast(result.error || 'Failed to mark email as sent', 'error');
    }
  } catch (error) {
    console.error('Error marking email as sent:', error);
    window.showToast('Failed to mark email as sent', 'error');
  }
};

window.resendEmail = async function (requestId) {
  console.log('resendEmail called with requestId:', requestId);

  try {
    const response = await fetch(`/api/requests/${requestId}/resend-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();
    if (result.success) {
      const message = result.data?.isGroup
        ? `Email resent successfully for group of ${result.data.updatedCount} requests`
        : 'Email resent successfully';

      window.showToast(message, 'success');

      // Close modal and refresh calendar
      const modal = bootstrap.Modal.getInstance(
        document.getElementById('requestDetailModal')
      );
      modal.hide();
      await loadExistingRequests();
    } else {
      window.showToast(result.error || 'Failed to resend email', 'error');
    }
  } catch (error) {
    console.error('Error resending email:', error);
    window.showToast('Failed to resend email', 'error');
  }
};

window.loadGroupEmailContent = async function (requestId) {
  try {
    const response = await fetch(
      `/api/requests/${requestId}/group-email-content`
    );
    const result = await response.json();

    if (result.success) {
      const emailContent = result.data.emailContent;

      // Populate the form fields
      document.getElementById('emailSubject').value = emailContent.subject;
      document.getElementById('emailBody').value = emailContent.body;

      // Show the content
      document.getElementById('emailContentDisplay').style.display = 'block';

      window.showToast(
        result.data.isGroup
          ? 'Group email content generated'
          : 'Email content generated',
        'success'
      );
    } else {
      window.showToast(result.error || 'Failed to generate email content', 'error');
    }
  } catch (error) {
    console.error('Error loading email content:', error);
    window.showToast('Failed to generate email content', 'error');
  }
};

// Request deletion
window.deleteRequest = async function (requestId, isGroup = false) {
  console.log(
    'deleteRequest called with requestId:',
    requestId,
    'isGroup:',
    isGroup
  );

  const message = isGroup
    ? 'Are you sure you want to delete this entire group request? This will delete all dates in the group. This action cannot be undone.'
    : 'Are you sure you want to delete this request? This action cannot be undone.';

  const title = isGroup ? 'Delete Group Request' : 'Delete Request';

  const confirmed = await window.showConfirmDialog(message, title, 'danger');

  if (confirmed) {
    try {
      const url = isGroup
        ? `/api/requests/${requestId}/delete-group`
        : `/api/requests/${requestId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();
      if (result.success) {
        const deleteMessage = isGroup
          ? `Group request deleted successfully (${result.data?.deletedCount || 'multiple'} requests)`
          : 'Request deleted successfully';

        window.showToast(deleteMessage, 'success');

        // Close modal and refresh calendar
        const modal = bootstrap.Modal.getInstance(
          document.getElementById('requestDetailModal')
        );
        modal.hide();
        await loadExistingRequests();
      } else {
        window.showToast(result.error || 'Failed to delete request', 'error');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      window.showToast('Failed to delete request', 'error');
    }
  }
};

// Submit group request
window.submitGroupRequest = async function () {
  if (window.isSubmitting) return;

  const customMessage = document.getElementById('customMessage').value.trim();
  const submitButton = document.getElementById('submitGroupRequest');

  // Validate flight numbers
  const flightDates = window.selectedDates.filter((d) => d.type === 'FLIGHT');
  for (const date of flightDates) {
    if (!date.flightNumber || !date.flightNumber.startsWith('TB')) {
      window.showToast('Flight numbers must start with "TB"', 'error');
      return;
    }
  }

  if (window.validateConsecutiveDates && !window.validateConsecutiveDates(window.selectedDates.map((d) => d.date))) {
    window.showToast('Selected dates must be consecutive', 'error');
    return;
  }

  if (window.selectedDates.length === 0) return;

  window.isSubmitting = true;
  submitButton.disabled = true;
  submitButton.innerHTML =
    '<i class="bi bi-hourglass-split me-1"></i>Submitting...';

  try {
    console.log('Submitting group request with dates:', window.selectedDates);
    const response = await fetch('/api/requests/group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dates: window.selectedDates,
        customMessage: customMessage || null,
      }),
    });

    const result = await response.json();
    console.log('Group request result:', result);

    if (result.success) {
      const modal = bootstrap.Modal.getInstance(
        document.getElementById('groupRequestModal')
      );
      modal.hide();

      window.selectedDates = [];
      if (window.calendar) {
        window.calendar.updateDateSelection();
        window.calendar.updateFloatingButton();
      }

      await loadExistingRequests();
      window.showToast(result.message, 'success');
    } else {
      window.showToast(result.error, 'error');
    }
  } catch (error) {
    console.error('Error creating group request:', error);
    window.showToast('Failed to create request', 'error');
  } finally {
    window.isSubmitting = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="bi bi-send me-1"></i>Submit Request';
    }
  }
};

// Submit group request in manual mode (mark as sent and create)
window.submitGroupRequestManual = async function () {
  if (window.isSubmitting) return;

  const customMessage = document.getElementById('customMessage').value.trim();
  const submitButton = document.getElementById('markAsSentAndCreate');

  // Validate flight numbers
  const flightDates = window.selectedDates.filter((d) => d.type === 'FLIGHT');
  for (const date of flightDates) {
    if (!date.flightNumber || !date.flightNumber.startsWith('TB')) {
      window.showToast('Flight numbers must start with "TB"', 'error');
      return;
    }
  }

  if (window.validateConsecutiveDates && !window.validateConsecutiveDates(window.selectedDates.map((d) => d.date))) {
    window.showToast('Selected dates must be consecutive', 'error');
    return;
  }

  if (window.selectedDates.length === 0) return;

  window.isSubmitting = true;
  submitButton.disabled = true;
  submitButton.innerHTML =
    '<i class="bi bi-hourglass-split me-1"></i>Creating Request...';

  try {
    console.log('Submitting manual group request with dates:', window.selectedDates);
    const response = await fetch('/api/requests/group-manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dates: window.selectedDates,
        customMessage: customMessage || null,
      }),
    });

    const result = await response.json();
    console.log('Manual group request result:', result);

    if (result.success) {
      const modal = bootstrap.Modal.getInstance(
        document.getElementById('groupRequestModal')
      );
      modal.hide();

      window.selectedDates = [];
      if (window.calendar) {
        window.calendar.updateDateSelection();
        window.calendar.updateFloatingButton();
      }

      await loadExistingRequests();
      window.showToast(result.message, 'success');
    } else {
      window.showToast(result.error, 'error');
    }
  } catch (error) {
    console.error('Error creating manual group request:', error);
    window.showToast('Failed to create request', 'error');
  } finally {
    window.isSubmitting = false;
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = '<i class="bi bi-check2 me-1"></i>Mark as Sent & Create Request';
    }
  }
};

// Centralized email generation (matches gmailService.js)
function generateEmailContentLikeGmailService(user, requests) {
  const firstRequest = requests[0];
  const startDate = new Date(firstRequest.startDate);

  // Generate subject (matches gmailService)
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthName = monthNames[startDate.getMonth()];
  const year = startDate.getFullYear();
  const subject = `${user.code} - CREW REQUEST - ${monthName} ${year}`;

  // Generate request lines (matches gmailService format)
  const requestLines = requests
    .map((request) => {
      const start = new Date(request.startDate);
      const end = new Date(request.endDate);
      const dates = [];

      // Generate all dates in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
      }

      return dates
        .map((date) => {
          const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;

          switch (request.type) {
            case 'REQ_DO':
              return `REQ DO - ${formattedDate}`;
            case 'PM_OFF':
              return `REQ PM OFF - ${formattedDate}`;
            case 'AM_OFF':
              return `REQ AM OFF - ${formattedDate}`;
            case 'FLIGHT':
              return `FLIGHT ${request.flightNumber || ''} - ${formattedDate}`;
            default:
              return `${request.type} - ${formattedDate}`;
          }
        })
        .join('\n');
    })
    .join('\n');

  return {
    subject: subject,
    requestLines: requestLines,
    body: `Dear,\n\n${requestLines}${firstRequest.customMessage ? '\n\n' + firstRequest.customMessage : ''}\n\n${user.signature}`,
  };
}

// Utility function
function getStatusColor(status) {
  const colors = {
    PENDING: 'warning',
    APPROVED: 'success',
    DENIED: 'danger',
  };
  return colors[status] || 'secondary';
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Calendar requests module: DOM loaded');
  await loadExistingRequests();
});

// Make functions available globally
window.loadExistingRequests = loadExistingRequests;
window.updateStatistics = updateStatistics;
window.initializeTooltips = initializeTooltips;
window.generateEmailContentLikeGmailService = generateEmailContentLikeGmailService;
window.getStatusColor = getStatusColor;