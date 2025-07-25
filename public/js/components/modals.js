/**
 * Modal Components Module
 * Contains modal management utilities, confirmation dialogs, alert modals, and z-index management
 */

// Update existing functions in src/views/partials/js/calendar.ejs
// Replace these existing functions with the updated versions

// ===== UPDATED: Existing updateRequestStatus function =====
// This function is now used for the old-style "Mark as Approved/Denied" buttons
// The new inline buttons use updateIndividualStatus instead

window.updateRequestStatus = async function (
  requestId,
  newStatus,
  updateGroup = false
) {
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
          updateGroup: updateGroup, // Use the updateGroup parameter
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
        await window.loadExistingRequests();
      } else {
        window.showToast(
          result.error || `Failed to ${statusText} request`,
          'error'
        );
      }
    } catch (error) {
      logger.logError(error, { 
        operation: `${statusText}Request`, 
        requestId: requestId,
        updateGroup: updateGroup 
      });
      window.showToast(`Failed to ${statusText} request`, 'error');
    }
  }
};

// ===== UPDATED: Enhanced confirmation dialog =====
// Update existing showConfirmDialog function to support new dialog types

window.showConfirmDialog = function (
  message,
  title = 'Confirm Action',
  type = 'warning'
) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmationModal');

    // If modal doesn't exist, create it
    if (!modal) {
      createConfirmationModal();
    }

    const modalContent = modal.querySelector('.modal-content');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    const iconElement = document.getElementById('confirmIcon');
    const confirmButton = document.getElementById('confirmAction');

    // Reset modal styling
    modalContent.className = 'modal-content';

    // Set content
    titleElement.textContent = title;
    messageElement.textContent = message;

    // Configure for different types
    if (type === 'danger') {
      modalContent.classList.add('danger');
      iconElement.className =
        'bi bi-exclamation-triangle text-danger me-2 fs-4';
      confirmButton.className = 'btn btn-danger';
      confirmButton.innerHTML = '<i class="bi bi-trash me-1"></i>Delete';
    } else if (type === 'success') {
      modalContent.classList.add('success');
      iconElement.className = 'bi bi-check-circle text-success me-2 fs-4';
      confirmButton.className = 'btn btn-success';
      confirmButton.innerHTML =
        '<i class="bi bi-check-circle me-1"></i>Approve';
    } else if (type === 'denied') {
      modalContent.classList.add('danger');
      iconElement.className = 'bi bi-x-circle text-danger me-2 fs-4';
      confirmButton.className = 'btn btn-danger';
      confirmButton.innerHTML = '<i class="bi bi-x-circle me-1"></i>Deny';
    } else if (type === 'logout') {
      modalContent.classList.add('warning');
      iconElement.className = 'bi bi-box-arrow-right text-warning me-2 fs-4';
      confirmButton.className = 'btn btn-warning';
      confirmButton.innerHTML =
        '<i class="bi bi-box-arrow-right me-1"></i>Logout';
    } else {
      iconElement.className = 'bi bi-question-circle text-warning me-2 fs-4';
      confirmButton.className = 'btn btn-primary';
      confirmButton.innerHTML = '<i class="bi bi-check-lg me-1"></i>Confirm';
    }

    const bootstrapModal = new bootstrap.Modal(modal, {
      backdrop: 'static',
      keyboard: true,
    });

    bootstrapModal.show();

    const handleConfirm = () => {
      bootstrapModal.hide();
      confirmButton.removeEventListener('click', handleConfirm);
      modal.removeEventListener('hidden.bs.modal', handleCancel);
      resolve(true);
    };

    const handleCancel = () => {
      confirmButton.removeEventListener('click', handleConfirm);
      modal.removeEventListener('hidden.bs.modal', handleCancel);
      resolve(false);
    };

    confirmButton.addEventListener('click', handleConfirm);
    modal.addEventListener('hidden.bs.modal', handleCancel);
  });
};

function createConfirmationModal() {
  const modalHTML = `
  <div class="modal fade" id="confirmationModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <span id="confirmIcon"></span>
            <span id="confirmTitle">Confirm Action</span>
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <p id="confirmMessage"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
            <i class="bi bi-x-lg me-1"></i>Cancel
          </button>
          <button type="button" class="btn btn-primary" id="confirmAction">
            <i class="bi bi-check-lg me-1"></i>Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Modern replacement for confirm() and alert()
window.modernConfirm = function (
  message,
  title = 'Confirm Action',
  type = 'warning'
) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirmationModal');

    // If modal doesn't exist, create it
    if (!modal) {
      createConfirmationModal();
    }

    const modalContent = modal.querySelector('.modal-content');
    const titleElement = document.getElementById('confirmTitle');
    const messageElement = document.getElementById('confirmMessage');
    const iconElement = document.getElementById('confirmIcon');
    const confirmButton = document.getElementById('confirmAction');

    // ✅ FIX: Calculate proper z-index based on existing modals
    const existingModals = document.querySelectorAll('.modal.show');
    const baseZIndex = 1050; // Bootstrap modal base z-index
    const newZIndex = baseZIndex + existingModals.length * 10 + 10;

    // Apply z-index to modal
    modal.style.zIndex = newZIndex;

    // Reset modal styling
    modalContent.className = 'modal-content';

    // Set content
    titleElement.textContent = title;
    messageElement.textContent = message;

    // Configure for different types
    if (type === 'danger') {
      modalContent.classList.add('danger');
      iconElement.className =
        'bi bi-exclamation-triangle text-danger me-2 fs-4';
      confirmButton.className = 'btn btn-danger';
      confirmButton.innerHTML = '<i class="bi bi-trash me-1"></i>Delete';
    } else if (type === 'logout') {
      modalContent.classList.add('warning');
      iconElement.className = 'bi bi-box-arrow-right text-warning me-2 fs-4';
      confirmButton.className = 'btn btn-warning';
      confirmButton.innerHTML =
        '<i class="bi bi-box-arrow-right me-1"></i>Logout';
    } else {
      iconElement.className = 'bi bi-question-circle text-warning me-2 fs-4';
      confirmButton.className = 'btn btn-primary';
      confirmButton.innerHTML = '<i class="bi bi-check-lg me-1"></i>Confirm';
    }

    // ✅ FIX: Use backdrop: false to prevent conflicts with existing modals
    const bootstrapModal = new bootstrap.Modal(modal, {
      backdrop: 'static',
      keyboard: true,
    });

    // Show modal
    bootstrapModal.show();

    // ✅ FIX: Clean up event listeners to prevent memory leaks
    const handleConfirm = () => {
      bootstrapModal.hide();
      confirmButton.removeEventListener('click', handleConfirm);
      modal.removeEventListener('hidden.bs.modal', handleCancel);
      resolve(true);
    };

    const handleCancel = () => {
      confirmButton.removeEventListener('click', handleConfirm);
      modal.removeEventListener('hidden.bs.modal', handleCancel);
      resolve(false);
    };

    confirmButton.addEventListener('click', handleConfirm);
    modal.addEventListener('hidden.bs.modal', handleCancel, { once: true });
  });
};

window.modernAlert = function (message, title = 'Information', type = 'info') {
  return new Promise(resolve => {
    let modal = document.getElementById('alertModal');

    // If modal doesn't exist, create it
    if (!modal) {
      createAlertModal();
      modal = document.getElementById('alertModal');
    }

    const titleElement = document.getElementById('alertTitle');
    const messageElement = document.getElementById('alertMessage');
    const iconElement = document.getElementById('alertIcon');

    // Set content
    titleElement.textContent = title;
    messageElement.textContent = message;

    // Configure icon for different types
    if (type === 'error') {
      iconElement.className =
        'bi bi-exclamation-triangle text-danger me-2 fs-4';
    } else if (type === 'success') {
      iconElement.className = 'bi bi-check-circle text-success me-2 fs-4';
    } else {
      iconElement.className = 'bi bi-info-circle text-primary me-2 fs-4';
    }

    // Show modal
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();

    // Handle close
    modal.addEventListener('hidden.bs.modal', () => resolve(), {
      once: true,
    });
  });
};

function createAlertModal() {
  const modalHTML = `
  <div class="modal fade" id="alertModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">
            <span id="alertIcon"></span>
            <span id="alertTitle">Information</span>
          </h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <p id="alertMessage"></p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">
            <i class="bi bi-check-lg me-1"></i>OK
          </button>
        </div>
      </div>
    </div>
  </div>
`;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// Modal z-index management utility
window.getNextModalZIndex = function () {
  const existingModals = document.querySelectorAll('.modal.show');
  const baseZIndex = 1050; // Bootstrap modal base z-index
  return baseZIndex + existingModals.length * 10 + 10;
};

// Modal utility functions
window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    const bootstrapModal = bootstrap.Modal.getInstance(modal);
    if (bootstrapModal) {
      bootstrapModal.hide();
    }
  }
};

window.openModal = function (modalId, options = {}) {
  const modal = document.getElementById(modalId);
  if (modal) {
    const bootstrapModal = new bootstrap.Modal(modal, {
      backdrop: options.backdrop || 'static',
      keyboard: options.keyboard !== false,
      ...options,
    });
    bootstrapModal.show();
    return bootstrapModal;
  }
};

// Make functions globally available
window.createConfirmationModal = createConfirmationModal;
window.createAlertModal = createAlertModal;
