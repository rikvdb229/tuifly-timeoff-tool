/**
 * TUIfly Time-Off Tool - Request Detail Modal Component
 * Handles request detail modal functionality
 */

// Modal management functions
window.showRequestDetailModal = async function (request, dateStr) {
  // Ensure existingRequests is available globally (for any remaining client-side functions)
  if (typeof window.existingRequests === 'undefined') {
    if (typeof existingRequests !== 'undefined') {
      window.existingRequests = existingRequests;
    } else {
      // Load from server if not available
      try {
        const response = await fetch('/api/requests');
        const data = await response.json();
        if (data.success) {
          window.existingRequests = data.data;
          // Also update the global existingRequests variable
          if (typeof existingRequests !== 'undefined') {
            existingRequests = data.data;
          }
        }
      } catch (error) {
        console.warn(
          'Could not load existing requests for modal:',
          error
        );
        window.existingRequests = [request]; // Fallback to just this request
      }
    }
  }

  // Populate modal with request data
  await populateRequestModal(request, dateStr);

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById('requestDetailModal')
  );
  modal.show();
};

async function populateRequestModal(request, dateStr) {
  const requestEmailMode = request.emailMode || 'automatic';

  // Set title
  const titleEl = document.getElementById('modalTitle');
  if (titleEl) {
    titleEl.textContent = `Request Details - ${dateStr}`;
  }

  // Email status (always shown)
  const emailStatus = getEmailStatusInfo(request);
  const statusIcon = document.getElementById('emailStatusIcon');
  const statusText = document.getElementById('emailStatusText');
  const statusDetails = document.getElementById('emailStatusDetails');
  
  if (statusIcon) statusIcon.textContent = emailStatus.icon;
  if (statusText) statusText.textContent = emailStatus.title;
  if (statusDetails) statusDetails.textContent = emailStatus.details;

  // Custom message (only show if exists)
  const messageSection = document.getElementById('messageSection');
  const messageEl = document.getElementById('requestMessage');
  
  if (request.customMessage && request.customMessage.trim()) {
    if (messageEl) messageEl.textContent = request.customMessage;
    if (messageSection) messageSection.style.display = 'block';
  } else {
    if (messageSection) messageSection.style.display = 'none';
  }

  // Populate dates with inline status buttons
  await populateRequestDates(request);

  // Email content section (only for manual mode requests)
  const emailContentSection = document.getElementById('emailContentSection');
  if (requestEmailMode === 'manual' && !request.manualEmailConfirmed) {
    console.log('🔍 Showing email content section for manual mode');
    if (emailContentSection) emailContentSection.style.display = 'block';

    setTimeout(() => {
      populateEmailContent(request);
    }, 50);
  } else {
    if (emailContentSection) emailContentSection.style.display = 'none';
  }

  // Modal actions
  populateModalActions(request);
}

async function populateRequestDates(request) {
  const datesContainer = document.getElementById('requestDatesList');
  const bulkActions = document.getElementById('bulkActions');

  if (!datesContainer) return;

  // Show loading state
  datesContainer.innerHTML =
    '<div class="text-center py-3"><div class="spinner-border spinner-border-sm" role="status"></div> Loading dates...</div>';

  let requestsToShow = [request];

  // If it's a group request, get all requests in the group
  if (request.groupId) {
    try {
      const response = await fetch(
        `/api/requests/${request.id}/group-details`
      );
      const result = await response.json();
      if (result.success) {
        requestsToShow = result.data.requests;
        requestsToShow.sort(
          (a, b) => new Date(a.startDate) - new Date(b.startDate)
        );
      }
    } catch (error) {
      console.error('Error loading group details:', error);
      datesContainer.innerHTML =
        '<div class="text-danger">Error loading request details</div>';
      return;
    }
  }

  // Check if email is sent and can update status
  const requestEmailMode = request.emailMode || 'automatic';
  const emailSent =
    (requestEmailMode === 'automatic' && request.emailSent) ||
    (requestEmailMode === 'manual' && request.manualEmailConfirmed);

  // Show bulk actions if multiple dates and email sent
  if (bulkActions) {
    if (requestsToShow.length > 1 && emailSent) {
      bulkActions.style.display = 'flex';
    } else {
      bulkActions.style.display = 'none';
    }
  }

  // Generate dates HTML
  const datesHTML = requestsToShow
    .map(
      (req) => `
<div class="d-flex justify-content-between align-items-center date-row">
  <div class="flex-grow-1">
    <strong>${req.startDate}</strong>
    <span class="text-muted ms-2">${getDisplayType(req.type)}</span>
    ${req.flightNumber ? `<span class="text-muted ms-1">(${req.flightNumber})</span>` : ''}
  </div>
  
  <div class="d-flex align-items-center">
    <!-- Current Status Badge -->
    <span class="badge bg-${getStatusColor(req.status)} me-3" id="status-badge-${req.id}">${req.status}</span>
    
    <!-- Inline Status Buttons (only if email sent) -->
    ${
      emailSent
        ? `
      <div class="btn-group btn-group-sm" role="group">
        <button type="button" 
                class="btn btn-outline-danger ${req.status === 'DENIED' ? 'active' : ''}" 
                data-action="updateStatus" data-request-id="${req.id}" data-status="DENIED"
                title="Deny"
                id="deny-btn-${req.id}">
          <i class="bi bi-x"></i>
        </button>
        <button type="button" 
                class="btn btn-outline-warning ${req.status === 'PENDING' ? 'active' : ''}" 
                data-action="updateStatus" data-request-id="${req.id}" data-status="PENDING"
                title="Pending"
                id="pending-btn-${req.id}">
          <i class="bi bi-hourglass"></i>
        </button>
        <button type="button" 
                class="btn btn-outline-success ${req.status === 'APPROVED' ? 'active' : ''}" 
                data-action="updateStatus" data-request-id="${req.id}" data-status="APPROVED"
                title="Approve"
                id="approve-btn-${req.id}">
          <i class="bi bi-check"></i>
        </button>
      </div>
    `
        : `
      <small class="text-muted">Send email first to update status</small>
    `
    }
  </div>
</div>
`
    )
    .join('');

  datesContainer.innerHTML =
    datesHTML || '<div class="text-muted">No dates found</div>';

  // Add event listeners for status update buttons
  datesContainer.addEventListener('click', function(e) {
    const button = e.target.closest('[data-action="updateStatus"]');
    if (button) {
      const requestId = button.dataset.requestId;
      const status = button.dataset.status;
      if (window.updateIndividualStatus) {
        window.updateIndividualStatus(requestId, status);
      }
    }
  });
}

function populateEmailContent(request) {
  const approverEmail =
    window.TUIFLY_CONFIG?.APPROVER_EMAIL || 'scheduling@tuifly.be';

  if (request.manualEmailContent) {
    const emailContent = request.manualEmailContent;

    // Get the DOM elements with correct IDs
    const toField = document.getElementById('emailTo');
    const subjectField = document.getElementById('emailSubjectDetail'); // Changed ID
    const bodyField = document.getElementById('emailBody');

    // Set TO field
    if (toField) {
      toField.value = emailContent.to || approverEmail;
    }

    // Set SUBJECT field
    if (subjectField) {
      subjectField.value = emailContent.subject || '';
      console.log('✅ Set SUBJECT field:', subjectField.value);
    } else {
      console.error('❌ emailSubjectDetail field not found!');
    }

    // Set BODY field
    if (bodyField) {
      bodyField.value = emailContent.body || emailContent.text || '';
    }

    return;
  }

  console.warn('⚠️ No stored email content found');
}

function populateModalActions(request) {
  const requestEmailMode = request.emailMode || 'automatic';
  const actionsContainer = document.getElementById('modalActions');
  
  if (!actionsContainer) return;
  
  let actions = '';

  // Open in Mail Client (manual mode only, when email content is ready)
  if (requestEmailMode === 'manual' && !request.manualEmailConfirmed) {
    actions += `
  <button type="button" class="btn btn-primary me-2" data-action="openInMailClient" data-request-id="${request.id}">
    <i class="bi bi-envelope-open me-1"></i>Open in Mail Client
  </button>
`;
  }

  // Mark as sent (manual mode only, not yet sent)
  if (requestEmailMode === 'manual' && !request.manualEmailConfirmed) {
    actions += `
  <button type="button" class="btn btn-success me-2" data-action="markEmailAsSent" data-request-id="${request.id}">
    <i class="bi bi-check-lg me-1"></i>Mark as Sent
  </button>
`;
  }

  // Resend (automatic mode only, if failed)
  if (requestEmailMode === 'automatic' && request.emailFailed) {
    actions += `
  <button type="button" class="btn btn-warning me-2" data-action="resendEmail" data-request-id="${request.id}">
    <i class="bi bi-arrow-repeat me-1"></i>Resend Email
  </button>
`;
  }

  // Delete (if pending and not sent)
  const canDelete =
    request.status === 'PENDING' &&
    ((requestEmailMode === 'automatic' && !request.emailSent) ||
      (requestEmailMode === 'manual' && !request.manualEmailConfirmed));

  if (canDelete) {
    const isGroup = request.groupId ? true : false;
    const deleteText = isGroup ? 'Delete Group' : 'Delete Request';

    actions += `
  <button type="button" class="btn btn-outline-danger" data-action="deleteRequest" data-request-id="${request.id}" data-is-group="${isGroup}">
    <i class="bi bi-trash me-1"></i>${deleteText}
  </button>
`;
  }

  actionsContainer.innerHTML = actions;

  // Add event listeners for action buttons
  actionsContainer.addEventListener('click', function(e) {
    const button = e.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;

    switch (action) {
      case 'openInMailClient':
        openInMailClient(requestId);
        break;
      case 'markEmailAsSent':
        if (window.markEmailAsSent) window.markEmailAsSent(requestId);
        break;
      case 'resendEmail':
        if (window.resendEmail) window.resendEmail(requestId);
        break;
      case 'deleteRequest':
        const isGroup = button.dataset.isGroup === 'true';
        if (window.deleteRequest) window.deleteRequest(requestId, isGroup);
        break;
    }
  });
}

// Add the openInMailClient function
function openInMailClient(requestId) {
  const toField = document.getElementById('emailTo');
  const subjectField = document.getElementById('emailSubjectDetail');
  const bodyField = document.getElementById('emailBody');

  if (!toField || !subjectField || !bodyField) {
    console.error('Email fields not found');
    if (window.showToast) {
      window.showToast('Could not find email content', 'error');
    }
    return;
  }

  const to = encodeURIComponent(toField.value || '');
  const subject = encodeURIComponent(subjectField.value || '');
  const body = encodeURIComponent(bodyField.value || '');

  // Create mailto link
  const mailtoLink = `mailto:${to}?subject=${subject}&body=${body}`;

  console.log(
    'Opening mailto link:',
    mailtoLink.substring(0, 100) + '...'
  );

  // Try to open the mailto link
  try {
    window.location.href = mailtoLink;

    // Show success message
    if (window.showToast) {
      window.showToast('Opening in your default mail client...', 'success');
    }
  } catch (error) {
    console.error('Error opening mail client:', error);
    if (window.showToast) {
      window.showToast(
        'Could not open mail client. Please copy the content manually.',
        'error'
      );
    }
  }
}

// Helper functions
function getDisplayType(type) {
  const types = {
    REQ_DO: 'DO',
    PM_OFF: 'PM',
    AM_OFF: 'AM',
    FLIGHT: 'FL',
  };
  return types[type] || type;
}

function getStatusColor(status) {
  const colors = {
    APPROVED: 'success',
    DENIED: 'danger',
    PENDING: 'warning',
  };
  return colors[status] || 'secondary';
}

function getEmailStatusInfo(request) {
  const requestEmailMode = request.emailMode || 'automatic';

  if (requestEmailMode === 'automatic') {
    if (request.emailSent) {
      return {
        icon: '✅',
        title: 'Email Sent',
        details: `Sent automatically on ${new Date(request.emailSent).toLocaleString()}`,
      };
    } else if (request.emailFailed) {
      return {
        icon: '❌',
        title: 'Email Failed',
        details: 'Email failed to send automatically',
      };
    } else {
      return {
        icon: '⏳',
        title: 'Email Pending',
        details: 'Email will be sent automatically',
      };
    }
  } else {
    if (request.manualEmailConfirmed) {
      return {
        icon: '✅',
        title: 'Email Sent',
        details: 'You confirmed the email was sent manually',
      };
    } else {
      return {
        icon: '📧',
        title: 'Email Ready',
        details: 'Copy the email content below and send manually',
      };
    }
  }
}

// Add bulk actions functions
window.bulkUpdateStatus = function(status) {
  // Implementation will be in calendar.js where the actual bulk update logic exists
  console.log('Bulk update status to:', status);
};

// Event delegation for modal interactions
document.addEventListener('DOMContentLoaded', function() {
  // Handle bulk action button clicks
  document.addEventListener('click', function(e) {
    const bulkButton = e.target.closest('[data-action="bulkUpdateStatus"]');
    if (bulkButton) {
      e.preventDefault();
      const status = bulkButton.dataset.status;
      if (window.bulkUpdateStatus) {
        window.bulkUpdateStatus(status);
      }
    }
  });
});

// Make functions globally available
window.openInMailClient = openInMailClient;