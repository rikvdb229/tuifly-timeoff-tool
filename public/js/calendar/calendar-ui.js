/**
 * Calendar UI Module
 * Contains DOM updates, animations, modal management, and toast notifications
 */

// Toast notification function
function showToast(message, type = 'info') {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
    toastContainer.style.zIndex = '1055';
    document.body.appendChild(toastContainer);
  }

  const toastId = 'toast_' + Date.now();
  const bgClass =
    type === 'success'
      ? 'bg-success'
      : type === 'error'
        ? 'bg-danger'
        : type === 'warning'
          ? 'bg-warning'
          : 'bg-info';

  const toastHTML = `
    <div id="${toastId}" class="toast ${bgClass} text-white" role="alert">
      <div class="d-flex">
        <div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  `;

  toastContainer.insertAdjacentHTML('beforeend', toastHTML);

  const toastElement = document.getElementById(toastId);
  const toast = new bootstrap.Toast(toastElement, {
    autohide: true,
    delay: type === 'error' ? 5000 : 3000,
  });
  toast.show();

  toastElement.addEventListener('hidden.bs.toast', () => {
    toastElement.remove();
  });
}

// Confirmation dialog function
function showConfirmDialog(
  message,
  title = 'Confirm Action',
  type = 'warning'
) {
  return new Promise(resolve => {
    // Remove existing confirmation modal if any
    const existing = document.getElementById('confirmationModal');
    if (existing) {
      existing.remove();
    }

    // Determine modal styling based on type
    let headerClass = 'modal-header';
    let buttonClass = 'btn-primary';
    let buttonText = 'Confirm';

    switch (type) {
      case 'danger':
        headerClass = 'modal-header bg-danger text-white';
        buttonClass = 'btn-danger';
        buttonText = 'Delete';
        break;
      case 'success':
        headerClass = 'modal-header bg-success text-white';
        buttonClass = 'btn-success';
        buttonText = 'Approve';
        break;
      case 'denied':
        headerClass = 'modal-header bg-danger text-white';
        buttonClass = 'btn-danger';
        buttonText = 'Deny';
        break;
      case 'warning':
        headerClass = 'modal-header bg-warning text-dark';
        buttonClass = 'btn-warning';
        buttonText = 'Proceed';
        break;
    }

    const modalHTML = `
      <div class="modal fade" id="confirmationModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="${headerClass}">
              <h5 class="modal-title">${title}</h5>
              <button type="button" class="btn-close ${type === 'warning' ? '' : 'btn-close-white'}" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <p class="mb-0">${message}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn ${buttonClass}" id="confirmButton">${buttonText}</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('confirmationModal');
    const confirmBtn = document.getElementById('confirmButton');

    const bootstrapModal = new bootstrap.Modal(modal, {
      backdrop: 'static',
      keyboard: false,
    });

    // Handle confirm button click
    confirmBtn.addEventListener('click', () => {
      bootstrapModal.hide();
      resolve(true);
    });

    // Handle modal dismiss (cancel)
    modal.addEventListener('hidden.bs.modal', () => {
      modal.remove();
      resolve(false);
    });

    bootstrapModal.show();
  });
}

// Request detail modal function
function showRequestDetailModal(request, _dateStr) {
  // Check if the request is part of a group
  const isGroupRequest =
    request.groupId &&
    window.existingRequests.filter(r => r.groupId === request.groupId).length >
      1;
  const groupRequests = isGroupRequest
    ? window.existingRequests
        .filter(r => r.groupId === request.groupId)
        .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    : [request];

  // Get modal elements
  const modal = document.getElementById('requestDetailModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = modal.querySelector('.modal-body');

  // Set modal title (no icon needed, it's already in the HTML)
  modalTitle.textContent = isGroupRequest
    ? 'Group Request Details'
    : 'Request Details';

  // Generate modal content
  let modalContent = '';

  if (isGroupRequest) {
    // Group request header
    modalContent += `
      <div class="alert alert-info mb-3">
        <i class="bi bi-calendar-week me-2"></i>
        <strong>Group Request:</strong> ${groupRequests.length} consecutive days
      </div>
    `;

    // Email information section
    const emailMode = request.emailMode || 'automatic';
    const emailSent = request.emailSent || request.manualEmailConfirmed;
    const emailFailed =
      emailMode === 'automatic' && !emailSent && request.emailFailed;

    modalContent += `
      <div class="row mb-3">
        <div class="col-md-6">
          <strong>Date sent:</strong> 
          ${
            emailSent
              ? formatDisplayDate(request.emailSentAt || request.createdAt)
              : emailFailed
                ? '<span class="text-danger">Failed to send</span>'
                : '<span class="text-muted">Not sent yet</span>'
          }
        </div>
        <div class="col-md-6">
          <strong>Sending method:</strong> 
          <span class="badge ${emailMode === 'automatic' ? 'bg-primary' : 'bg-success'}">${emailMode === 'automatic' ? '🤖 Automatic' : '📧 Manual'}</span>
        </div>
      </div>
    `;

    // Custom message section (if exists)
    if (request.customMessage) {
      modalContent += `
        <div class="row mb-3">
          <div class="col-12">
            <strong>Additional Message:</strong>
            <div class="mt-2 p-2 bg-light rounded">
              ${request.customMessage}
            </div>
          </div>
        </div>
      `;
    }

    // Group details container
    modalContent += '<div class="mb-4">';

    // Bulk action row - matching the exact padding of card-body
    modalContent += `
      <div class="mb-2">
        <div class="py-2" style="padding-left: 1rem; padding-right: 1rem;">
          <div class="row align-items-center">
            <div class="col-md-3">
              <!-- Empty - aligns with date column -->
            </div>
            <div class="col-md-3">
              <!-- Empty - aligns with type column -->
            </div>
            <div class="col-md-3">
              <small class="text-muted">Bulk actions:</small>
            </div>
            <div class="col-md-3">
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" 
                  class="btn btn-outline-danger"
                  onclick="bulkUpdateStatus('DENIED')">
                  <i class="bi bi-x"></i>
                </button>
                <button type="button"
                  class="btn btn-outline-warning" 
                  onclick="bulkUpdateStatus('PENDING')">
                  <i class="bi bi-clock"></i>
                </button>
                <button type="button"
                  class="btn btn-outline-success"
                  onclick="bulkUpdateStatus('APPROVED')">
                  <i class="bi bi-check"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    groupRequests.forEach((req, _index) => {
      const statusColor = getStatusColor(req.status);
      // const emailStatus = getSimpleEmailStatus(req); // TODO: Use this status

      modalContent += `
        <div class="card mb-2">
          <div class="card-body py-2">
            <div class="row align-items-center">
              <div class="col-md-3">
                <strong>${formatDisplayDate(req.startDate)}</strong>
              </div>
              <div class="col-md-3">
                <span class="badge bg-secondary">${window.CONFIG.REQUEST_TYPES[req.type] || req.type}</span>
                ${req.flightNumber ? `<br><small class="text-muted">${req.flightNumber}</small>` : ''}
              </div>
              <div class="col-md-3">
                <span id="status-badge-${req.id}" class="badge bg-${statusColor}">${req.status}</span>
              </div>
              <div class="col-md-3">
                <div class="btn-group btn-group-sm" role="group">
                  <button type="button" id="deny-btn-${req.id}" 
                    class="btn btn-outline-danger ${req.status === 'DENIED' ? 'active' : ''}"
                    onclick="updateIndividualStatus(${req.id}, 'DENIED')">
                    <i class="bi bi-x"></i>
                  </button>
                  <button type="button" id="pending-btn-${req.id}"
                    class="btn btn-outline-warning ${req.status === 'PENDING' ? 'active' : ''}" 
                    onclick="updateIndividualStatus(${req.id}, 'PENDING')">
                    <i class="bi bi-clock"></i>
                  </button>
                  <button type="button" id="approve-btn-${req.id}"
                    class="btn btn-outline-success ${req.status === 'APPROVED' ? 'active' : ''}"
                    onclick="updateIndividualStatus(${req.id}, 'APPROVED')">
                    <i class="bi bi-check"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    modalContent += '</div>';
  } else {
    // Single request details - use same layout as group request for consistency
    const statusColor = getStatusColor(request.status);
    // const emailStatus = getSimpleEmailStatus(request); // TODO: Use this status

    // Single request header
    modalContent += `
      <div class="alert alert-info mb-3">
        <i class="bi bi-calendar-day me-2"></i>
        <strong>Single Request</strong>
      </div>
    `;

    // Email information section (same as group)
    const emailMode = request.emailMode || 'automatic';
    const emailSent = request.emailSent || request.manualEmailConfirmed;
    const emailFailed =
      emailMode === 'automatic' && !emailSent && request.emailFailed;

    modalContent += `
      <div class="row mb-3">
        <div class="col-md-6">
          <strong>Date sent:</strong> 
          ${
            emailSent
              ? formatDisplayDate(request.emailSentAt || request.createdAt)
              : emailFailed
                ? '<span class="text-danger">Failed to send</span>'
                : '<span class="text-muted">Not sent yet</span>'
          }
        </div>
        <div class="col-md-6">
          <strong>Sending method:</strong> 
          <span class="badge ${emailMode === 'automatic' ? 'bg-primary' : 'bg-success'}">${emailMode === 'automatic' ? '🤖 Automatic' : '📧 Manual'}</span>
        </div>
      </div>
    `;

    // Custom message section (if exists)
    if (request.customMessage) {
      modalContent += `
        <div class="row mb-3">
          <div class="col-12">
            <strong>Additional Message:</strong>
            <div class="mt-2 p-2 bg-light rounded">
              ${request.customMessage}
            </div>
          </div>
        </div>
      `;
    }

    // Single request details container (same format as group)
    modalContent += '<div class="mb-4">';
    modalContent += `
      <div class="card mb-2">
        <div class="card-body py-2">
          <div class="row align-items-center">
            <div class="col-md-3">
              <strong>${formatDisplayDate(request.startDate)}</strong>
            </div>
            <div class="col-md-3">
              <span class="badge bg-secondary">${window.CONFIG.REQUEST_TYPES[request.type] || request.type}</span>
              ${request.flightNumber ? `<br><small class="text-muted">${request.flightNumber}</small>` : ''}
            </div>
            <div class="col-md-3">
              <span id="status-badge-${request.id}" class="badge bg-${statusColor}">${request.status}</span>
            </div>
            <div class="col-md-3">
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" id="deny-btn-${request.id}" 
                  class="btn btn-outline-danger ${request.status === 'DENIED' ? 'active' : ''}"
                  onclick="updateIndividualStatus(${request.id}, 'DENIED')">
                  <i class="bi bi-x"></i>
                </button>
                <button type="button" id="pending-btn-${request.id}"
                  class="btn btn-outline-warning ${request.status === 'PENDING' ? 'active' : ''}" 
                  onclick="updateIndividualStatus(${request.id}, 'PENDING')">
                  <i class="bi bi-clock"></i>
                </button>
                <button type="button" id="approve-btn-${request.id}"
                  class="btn btn-outline-success ${request.status === 'APPROVED' ? 'active' : ''}"
                  onclick="updateIndividualStatus(${request.id}, 'APPROVED')">
                  <i class="bi bi-check"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    modalContent += '</div>';
  }

  // Email section (only show if email not sent yet)
  const shouldShowEmailSection =
    !request.emailSent && !request.manualEmailConfirmed;

  if (shouldShowEmailSection) {
    // Generate email content for copying (unified function handles both single and group)
    const emailContent = window.generateEmailContent(request);

    modalContent += `
      <div class="row mb-3">
        <div class="col-12">
          <strong>Email Actions:</strong>
          <div class="mt-2">
            <div class="email-copy-section">
              <label>To:</label>
              <div class="input-group mb-2">
                <input type="text" class="form-control" id="emailToCopy" value="${emailContent.to || 'scheduling@tuifly.be'}" readonly>
                <button class="btn btn-outline-secondary" type="button" data-copy-target="emailToCopy">
                  <i class="bi bi-clipboard"></i>
                </button>
              </div>
              
              <label>Email Subject:</label>
              <div class="input-group mb-2">
                <input type="text" class="form-control" id="emailSubjectCopy" value="${emailContent.subject}" readonly>
                <button class="btn btn-outline-secondary" type="button" data-copy-target="emailSubjectCopy">
                  <i class="bi bi-clipboard"></i>
                </button>
              </div>
              
              <label>Email Body:</label>
              <div class="input-group">
                <textarea class="form-control" id="emailBodyCopy" rows="8" readonly>${emailContent.body}</textarea>
                <button class="btn btn-outline-secondary" type="button" data-copy-target="emailBodyCopy">
                  <i class="bi bi-clipboard"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Action buttons section
  modalContent += `
    <div class="d-flex justify-content-between mt-4">
      <div>
  `;

  // Email action buttons based on request creation mode
  const requestEmailMode = request.emailMode || 'automatic';

  // Resend Email button - only for automatic mode requests that failed
  if (requestEmailMode === 'automatic' && request.emailFailed) {
    modalContent += `
        <button type="button" class="btn btn-outline-warning btn-sm me-2" onclick="resendEmail(${request.id})">
          <i class="bi bi-arrow-repeat me-1"></i>Resend Email
        </button>
    `;
  }

  // Send to Email Program button - only for requests without automatic email, not yet sent
  if (!request.emailSent && !request.manualEmailConfirmed) {
    modalContent += `
        <button type="button" class="btn btn-outline-primary btn-sm me-2" onclick="openInMailClient(${request.id})">
          <i class="bi bi-envelope-open me-1"></i>Open in Mail Client
        </button>
    `;
  }

  // Mark as Sent button - only for requests without automatic email, not yet confirmed
  if (!request.emailSent && !request.manualEmailConfirmed) {
    modalContent += `
        <button type="button" class="btn btn-outline-success btn-sm" onclick="markEmailAsSent(${request.id})">
          <i class="bi bi-check2 me-1"></i>Mark as Sent
        </button>
    `;
  }

  modalContent += `
      </div>
      
      <div>
        <!-- Right side actions if needed -->
      </div>
    </div>
  `;

  // Set modal content
  modalBody.innerHTML = modalContent;

  // Show modal
  const bootstrapModal = new bootstrap.Modal(modal);
  bootstrapModal.show();
}

// Utility functions for modal
function formatDisplayDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-GB');
}

function getStatusColor(status) {
  const colors = {
    PENDING: 'warning',
    APPROVED: 'success',
    DENIED: 'danger',
  };
  return colors[status] || 'secondary';
}

function getSimpleEmailStatus(request) {
  const requestEmailMode = request.emailMode || 'automatic';

  if (requestEmailMode === 'automatic') {
    if (request.emailSent) {
      return { icon: '✅', title: 'Email sent' };
    } else if (request.emailFailed) {
      return { icon: '❌', title: 'Email failed' };
    } else {
      return { icon: '⏳', title: 'Email pending' };
    }
  } else {
    if (request.manualEmailConfirmed) {
      return { icon: '✅', title: 'Email sent' };
    } else {
      return { icon: '📧', title: 'Email ready to send' };
    }
  }
}

// Email status tooltip function
function getEmailStatusTooltip(request) {
  const status = getEmailStatusIcon(request);
  const tooltipMap = {
    '✅':
      request.emailMode === 'automatic'
        ? 'Email sent successfully'
        : 'Email confirmed sent',
    '❌': 'Email failed to send',
    '🔄': 'Email sending in progress',
    '📧': 'Email ready to copy',
    '⚠️': 'Email not sent yet',
    '❓': 'Unknown email status',
  };
  return tooltipMap[status] || 'Unknown email status';
}

// Advanced email status icon function (for compatibility)
function getEmailStatusIcon(request) {
  const requestEmailMode = request.emailMode || 'automatic';

  if (requestEmailMode === 'automatic') {
    if (request.emailSent) {
      return '✅';
    } else if (request.emailFailed) {
      return '❌';
    } else if (request.emailPending) {
      return '🔄';
    } else {
      return '⚠️';
    }
  } else {
    // Manual mode: Check manual confirmation status
    if (request.manualEmailConfirmed) {
      return '✅';
    } else if (request.manualEmailContent && !request.manualEmailConfirmed) {
      return '📧';
    } else {
      return '⚠️';
    }
  }
}

// Loading animation utility
function showLoadingSpinner(element, text = 'Loading...') {
  if (element) {
    element.innerHTML = `
      <div class="d-flex align-items-center justify-content-center">
        <div class="spinner-border spinner-border-sm me-2" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        ${text}
      </div>
    `;
    element.disabled = true;
  }
}

function hideLoadingSpinner(element, originalContent) {
  if (element) {
    element.innerHTML = originalContent;
    element.disabled = false;
  }
}

// Animation utilities
function fadeIn(element, duration = 300) {
  element.style.opacity = '0';
  element.style.display = 'block';

  let start = null;
  function animate(timestamp) {
    if (!start) {start = timestamp;}
    const progress = timestamp - start;
    const opacity = Math.min(progress / duration, 1);

    element.style.opacity = opacity.toString();

    if (progress < duration) {
      requestAnimationFrame(animate);
    }
  }

  requestAnimationFrame(animate);
}

function fadeOut(element, duration = 300) {
  let start = null;
  const initialOpacity = parseFloat(element.style.opacity) || 1;

  function animate(timestamp) {
    if (!start) {start = timestamp;}
    const progress = timestamp - start;
    const opacity = Math.max(initialOpacity - progress / duration, 0);

    element.style.opacity = opacity.toString();

    if (progress < duration) {
      requestAnimationFrame(animate);
    } else {
      element.style.display = 'none';
    }
  }

  requestAnimationFrame(animate);
}

// Highlight utility for successful actions
function highlightElement(element, color = '#28a745', duration = 2000) {
  const originalBackground = element.style.backgroundColor;
  const originalTransition = element.style.transition;

  element.style.transition = 'background-color 0.3s ease';
  element.style.backgroundColor = color;

  setTimeout(() => {
    element.style.backgroundColor = originalBackground;
    setTimeout(() => {
      element.style.transition = originalTransition;
    }, 300);
  }, duration);
}

// Email client utility function
function openInMailClient(requestId) {
  // Find the request
  const request = window.existingRequests?.find(r => r.id === requestId);
  if (!request) {
    window.showToast('Request not found', 'error');
    return;
  }

  // Generate email content (unified function handles both single and group)
  const emailContent = window.generateEmailContent(request);

  if (!emailContent) {
    window.showToast('Could not generate email content', 'error');
    return;
  }

  // Get approver email
  const approverEmail =
    window.TUIFLY_CONFIG?.APPROVER_EMAIL || 'scheduling@tuifly.be';

  // Create mailto link
  const to = encodeURIComponent(approverEmail);
  const subject = encodeURIComponent(emailContent.subject);
  const body = encodeURIComponent(emailContent.body);
  const mailtoLink = `mailto:${to}?subject=${subject}&body=${body}`;

  logger.logUserAction('openMailtoLink', { 
    requestId: requestId,
    approverEmail: approverEmail 
  });

  // Try to open the mailto link
  try {
    window.location.href = mailtoLink;
    window.showToast('Opening in your default mail client...', 'success');
  } catch (error) {
    logger.logError(error, { 
      operation: 'openInMailClient',
      requestId: requestId 
    });
    window.showToast(
      'Could not open mail client. Please copy the content manually.',
      'error'
    );
  }
}

// Make functions available globally
window.showToast = showToast;
window.showConfirmDialog = showConfirmDialog;
window.showRequestDetailModal = showRequestDetailModal;
window.openInMailClient = openInMailClient;
window.formatDisplayDate = formatDisplayDate;
window.getEmailStatusTooltip = getEmailStatusTooltip;
window.getEmailStatusIcon = getEmailStatusIcon;
window.getSimpleEmailStatus = getSimpleEmailStatus;
window.showLoadingSpinner = showLoadingSpinner;
window.hideLoadingSpinner = hideLoadingSpinner;
window.fadeIn = fadeIn;
window.fadeOut = fadeOut;
window.highlightElement = highlightElement;
