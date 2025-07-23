/**
 * TUIfly Time-Off Tool - Request Detail Modal Component
 * Handles request detail modal functionality
 */

/**
 * Shows the request detail modal with comprehensive request information
 * @param {Object} request - The request object containing details
 * @param {string} request.id - Unique request identifier
 * @param {string} request.emailMode - Email mode ('automatic' or 'manual')
 * @param {boolean} request.emailSent - Whether email has been sent
 * @param {boolean} request.manualEmailConfirmed - Whether manual email is confirmed
 * @param {string} request.customMessage - Optional custom message
 * @param {string} request.groupId - Group identifier if part of group request
 * @param {string} dateStr - Formatted date string for display
 * @returns {Promise<void>}
 */
window.showRequestDetailModal = async function (request, dateStr) {
  // Ensure existingRequests is available globally (for any remaining client-side functions)
  if (typeof window.existingRequests === 'undefined') {
      // Load from server if not available
      try {
        const response = await fetch('/api/requests');
        const data = await response.json();
        if (data.success) {
          window.existingRequests = data.data;
        }
      } catch (error) {
        logger.logError(error, { 
          operation: 'loadExistingRequestsForModal',
          requestId: request.id 
        });
        window.existingRequests = [request]; // Fallback to just this request
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

/**
 * Populates the request detail modal with request data and UI elements
 * @param {Object} request - The request object to display
 * @param {string} dateStr - Formatted date string
 * @returns {Promise<void>}
 * @private
 */
async function populateRequestModal(request, dateStr) {
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

  if (statusIcon) {statusIcon.textContent = emailStatus.icon;}
  if (statusText) {statusText.textContent = emailStatus.title;}
  if (statusDetails) {statusDetails.textContent = emailStatus.details;}

  // Custom message (only show if exists)
  const messageSection = document.getElementById('messageSection');
  const messageEl = document.getElementById('requestMessage');

  if (request.customMessage && request.customMessage.trim()) {
    if (messageEl) {messageEl.textContent = request.customMessage;}
    if (messageSection) {messageSection.style.display = 'block';}
  } else {
    if (messageSection) {messageSection.style.display = 'none';}
  }

  // Populate dates with inline status buttons
  await populateRequestDates(request);

  // Email content section (for requests that need manual email handling)
  const emailContentSection = document.getElementById('emailContentSection');
  const shouldShowEmailSection =
    !request.emailSent && !request.manualEmailConfirmed;

  if (shouldShowEmailSection) {
    if (emailContentSection) {emailContentSection.style.display = 'block';}

    setTimeout(() => {
      if (request.manualEmailContent) {
        populateEmailContent(request);
      } else {
        // Generate email content if missing (for existing requests)
        generateEmailContentForModal(request);
      }
    }, 50);
  } else {
    if (emailContentSection) {emailContentSection.style.display = 'none';}
  }

  // Modal actions
  populateModalActions(request);
}

/**
 * Populates the request dates section with status buttons and bulk actions
 * @param {Object} request - The request object containing date information
 * @param {string} request.id - Request ID
 * @param {string} request.groupId - Group ID if part of group request
 * @param {string} request.emailMode - Email sending mode
 * @param {boolean} request.emailSent - Whether email has been sent
 * @param {boolean} request.manualEmailConfirmed - Manual email confirmation status
 * @returns {Promise<void>}
 * @private
 */
async function populateRequestDates(request) {
  const datesContainer = document.getElementById('requestDatesList');
  const bulkActions = document.getElementById('bulkActions');

  if (!datesContainer) {return;}

  // Show loading state
  datesContainer.innerHTML =
    '<div class="text-center py-3"><div class="spinner-border spinner-border-sm" role="status"></div> Loading dates...</div>';

  let requestsToShow = [request];

  // If it's a group request, get all requests in the group
  if (request.groupId) {
    try {
      const response = await fetch(`/api/requests/${request.id}/group-details`);
      const result = await response.json();
      if (result.success) {
        requestsToShow = result.data.requests;
        requestsToShow.sort(
          (a, b) => new Date(a.startDate) - new Date(b.startDate)
        );
      }
    } catch (error) {
      logger.logError(error, { 
        operation: 'loadGroupDetails',
        requestId: request.id 
      });
      datesContainer.innerHTML =
        '<div class="text-danger">Error loading request details</div>';
      return;
    }
  }

  // Check if email is sent and can update status
  const emailSent = request.emailSent || request.manualEmailConfirmed;

  // Show bulk actions if multiple dates and email sent
  if (bulkActions) {
    if (requestsToShow.length > 1 && emailSent) {
      bulkActions.style.display = 'block';
    } else {
      bulkActions.style.display = 'none';
    }
  }

  // Generate dates HTML
  const datesHTML = requestsToShow
    .map(
      req => `
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

  // Find the dates list container (not the parent container)
  const datesList =
    datesContainer.querySelector('#datesList') || datesContainer;

  datesList.innerHTML =
    datesHTML || '<div class="text-muted">No dates found</div>';

  // Add event listeners for status update buttons
  datesContainer.addEventListener('click', function (e) {
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

/**
 * Populates email content fields for manual email mode
 * @param {Object} request - The request object with email content
 * @param {Object} request.manualEmailContent - Email content object
 * @param {string} request.manualEmailContent.to - Recipient email
 * @param {string} request.manualEmailContent.subject - Email subject
 * @param {string} request.manualEmailContent.body - Email body content
 * @returns {void}
 * @private
 */
function populateEmailContent(request) {
  const approverEmail =
    window.TUIFLY_CONFIG?.APPROVER_EMAIL || 'scheduling@tuifly.be';

  logger.debug('Populating email content for request', { 
    requestId: request.id,
    hasEmailContent: !!request.manualEmailContent 
  });

  if (request.manualEmailContent) {
    const emailContent = request.manualEmailContent;

    // Get the DOM elements with correct IDs
    const toField = document.getElementById('emailTo');
    const subjectField = document.getElementById('emailSubjectDetail');
    const bodyField = document.getElementById('emailBody');

    logger.debug('Email form elements found', {
      toField: !!toField,
      subjectField: !!subjectField,
      bodyField: !!bodyField,
      requestId: request.id
    });

    // Set TO field
    if (toField) {
      toField.value = emailContent.to || approverEmail;
      logger.debug('Set TO field', { to: toField.value, requestId: request.id });
    } else {
      logger.error('emailTo field not found', { requestId: request.id });
    }

    // Set SUBJECT field
    if (subjectField) {
      subjectField.value = emailContent.subject || '';
      logger.debug('Set SUBJECT field', { subject: subjectField.value, requestId: request.id });
    } else {
      logger.error('emailSubjectDetail field not found', { requestId: request.id });
    }

    // Set BODY field
    if (bodyField) {
      bodyField.value = emailContent.body || emailContent.text || '';
      logger.debug('Set BODY field', { bodyLength: bodyField.value.length, requestId: request.id });
    } else {
      logger.error('emailBody field not found', { requestId: request.id });
    }

    return;
  }

  logger.warn('No stored email content found', { requestId: request.id });
}

/**
 * Generates email content for modal when not stored in request
 * @param {Object} request - The request object
 * @returns {void}
 * @private
 */
async function generateEmailContentForModal(request) {
  try {
    logger.debug('Generating email content for request', { requestId: request.id });

    const response = await fetch(`/api/requests/${request.id}/email-content`);

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data.emailContent) {
        // Update the request object with the email content
        request.manualEmailContent = data.data.emailContent;
        // Populate the form fields
        populateEmailContent(request);
      }
    } else {
      logger.error('Failed to fetch email content', { 
        status: response.status,
        requestId: request.id 
      });

      // Fallback: populate with default values
      const approverEmail =
        window.TUIFLY_CONFIG?.APPROVER_EMAIL || 'scheduling@tuifly.be';
      const toField = document.getElementById('emailTo');
      if (toField) {
        toField.value = approverEmail;
      }

      logger.warn('Using fallback email address', { requestId: request.id });
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'generateEmailContentForModal',
      requestId: request.id 
    });
  }
}

/**
 * Populates the modal footer with appropriate action buttons based on request state
 * @param {Object} request - The request object
 * @param {string} request.emailMode - Email mode ('automatic' or 'manual')
 * @param {boolean} request.manualEmailConfirmed - Manual email confirmation status
 * @param {boolean} request.emailFailed - Whether automatic email failed
 * @param {string} request.status - Request status ('PENDING', 'APPROVED', 'DENIED')
 * @param {boolean} request.emailSent - Whether email has been sent
 * @param {string} request.groupId - Group ID if part of group request
 * @returns {void}
 * @private
 */
function populateModalActions(request) {
  const requestEmailMode = request.emailMode || 'automatic';
  const actionsContainer = document.getElementById('modalActions');

  if (!actionsContainer) {return;}

  let actions = '';

  // Open in Mail Client (only for requests without automatic email)
  if (!request.emailSent && !request.manualEmailConfirmed) {
    actions += `
  <button type="button" class="btn btn-primary me-2" data-action="openInMailClient" data-request-id="${request.id}">
    <i class="bi bi-envelope-open me-1"></i>Open in Mail Client
  </button>
`;
  }

  // Mark as sent (only for requests without automatic email, not yet manually confirmed)
  if (!request.emailSent && !request.manualEmailConfirmed) {
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

  // Delete (only if no email sent yet)
  const canDelete = !request.emailSent && !request.manualEmailConfirmed;

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
  actionsContainer.addEventListener('click', function (e) {
    const button = e.target.closest('[data-action]');
    if (!button) {return;}

    const action = button.dataset.action;
    const requestId = button.dataset.requestId;

    switch (action) {
      case 'openInMailClient':
        openInMailClient(requestId);
        break;
      case 'markEmailAsSent':
        if (window.markEmailAsSent) {window.markEmailAsSent(requestId);}
        break;
      case 'resendEmail':
        if (window.resendEmail) {window.resendEmail(requestId);}
        break;
      case 'deleteRequest': {
        const isGroup = button.dataset.isGroup === 'true';
        if (window.deleteRequest) {window.deleteRequest(requestId, isGroup);}
        break;
      }
    }
  });
}

// Add the openInMailClient function
/**
 * Opens the user's default mail client with pre-filled email content
 * @param {number|string} requestId - The ID of the request (used for context)
 * @returns {void}
 */
function openInMailClient(requestId) {
  const toField = document.getElementById('emailTo');
  const subjectField = document.getElementById('emailSubjectDetail');
  const bodyField = document.getElementById('emailBody');

  if (!toField || !subjectField || !bodyField) {
    logger.error('Email fields not found', { requestId: requestId });
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

  // Try to open the mailto link
  try {
    window.location.href = mailtoLink;

    // Show success message
    if (window.showToast) {
      window.showToast('Opening in your default mail client...', 'success');
    }
  } catch (error) {
    logger.logError(error, { 
      operation: 'openInMailClient',
      requestId: requestId 
    });
    if (window.showToast) {
      window.showToast(
        'Could not open mail client. Please copy the content manually.',
        'error'
      );
    }
  }
}

// Helper functions
/**
 * Converts internal request type to display-friendly format
 * @param {string} type - Internal request type ('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT')
 * @returns {string} Display format ('DO', 'PM', 'AM', 'FL')
 */
function getDisplayType(type) {
  const types = {
    REQ_DO: 'DO',
    PM_OFF: 'PM',
    AM_OFF: 'AM',
    FLIGHT: 'FL',
  };
  return types[type] || type;
}

/**
 * Gets Bootstrap color class for request status
 * @param {string} status - Request status ('APPROVED', 'DENIED', 'PENDING')
 * @returns {string} Bootstrap color class ('success', 'danger', 'warning', 'secondary')
 */
function getStatusColor(status) {
  const colors = {
    APPROVED: 'success',
    DENIED: 'danger',
    PENDING: 'warning',
  };
  return colors[status] || 'secondary';
}

/**
 * Gets email status information for display in the modal
 * @param {Object} request - The request object
 * @param {string} request.emailMode - Email mode ('automatic' or 'manual')
 * @param {boolean} request.emailSent - Whether automatic email was sent
 * @param {boolean} request.emailFailed - Whether automatic email failed
 * @param {boolean} request.manualEmailConfirmed - Whether manual email was confirmed
 * @returns {Object} Status information object
 * @returns {string} returns.icon - Emoji icon for status
 * @returns {string} returns.title - Status title
 * @returns {string} returns.details - Status details description
 */
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

/**
 * Updates status for all requests in a group (bulk action)
 * @param {string} status - New status to apply ('APPROVED', 'DENIED', 'PENDING')
 * @returns {void}
 */
window.bulkUpdateStatus = function (_status) {
  // Implementation will be in calendar.js where the actual bulk update logic exists
};

// Event delegation for modal interactions
document.addEventListener('DOMContentLoaded', function () {
  // Handle bulk action button clicks
  document.addEventListener('click', function (e) {
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
