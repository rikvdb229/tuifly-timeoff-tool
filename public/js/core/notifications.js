/**
 * TUIfly Time-Off Tool - Notification Manager
 * Centralized notification system with toast messages, alerts, and confirmation dialogs
 */

class NotificationManager {
  constructor() {
    this.toastContainer = null;
    this.defaultToastOptions = {
      autohide: true,
      delay: 5000,
      position: 'top-end',
    };
    this.init();
  }

  /**
   * Initialize the notification system
   */
  init() {
    this.createToastContainer();
    this.addStyles();
  }

  /**
   * Create toast container if it doesn't exist
   */
  createToastContainer() {
    if (!this.toastContainer) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.className = 'toast-container position-fixed p-3';
      this.toastContainer.style.zIndex = '9999';
      this.setToastPosition('top-end');
      document.body.appendChild(this.toastContainer);
    }
  }

  /**
   * Set toast container position
   * @param {string} position - Position ('top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end')
   */
  setToastPosition(position) {
    if (!this.toastContainer) {return;}

    // Remove all position classes
    this.toastContainer.classList.remove(
      'top-0',
      'bottom-0',
      'start-0',
      'end-0',
      'start-50',
      'translate-middle-x'
    );

    const positions = {
      'top-start': ['top-0', 'start-0'],
      'top-center': ['top-0', 'start-50', 'translate-middle-x'],
      'top-end': ['top-0', 'end-0'],
      'bottom-start': ['bottom-0', 'start-0'],
      'bottom-center': ['bottom-0', 'start-50', 'translate-middle-x'],
      'bottom-end': ['bottom-0', 'end-0'],
    };

    const classes = positions[position] || positions['top-end'];
    this.toastContainer.classList.add(...classes);
  }

  /**
   * Add custom styles for notifications
   */
  addStyles() {
    if (document.getElementById('notification-styles')) {return;}

    const styles = document.createElement('style');
    styles.id = 'notification-styles';
    styles.textContent = `
      .toast-container .toast {
        min-width: 300px;
        max-width: 500px;
      }

      .toast-header.bg-success,
      .toast-header.bg-danger,
      .toast-header.bg-warning,
      .toast-header.bg-info,
      .toast-header.bg-primary {
        color: white;
      }

      .toast-header.bg-success .btn-close,
      .toast-header.bg-danger .btn-close,
      .toast-header.bg-warning .btn-close,
      .toast-header.bg-info .btn-close,
      .toast-header.bg-primary .btn-close {
        filter: invert(1) grayscale(100%) brightness(200%);
      }

      .notification-modal .modal-header {
        border-bottom: 1px solid #dee2e6;
      }

      .notification-modal .modal-footer {
        border-top: 1px solid #dee2e6;
      }

      .notification-icon {
        font-size: 1.5rem;
        margin-right: 0.5rem;
      }

      .fade-in {
        animation: fadeIn 0.3s ease-in-out;
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-20px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(styles);
  }

  /**
   * Show a toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type ('success', 'error', 'warning', 'info', 'primary')
   * @param {Object} options - Additional options
   * @returns {HTMLElement} Toast element
   */
  showToast(message, type = 'info', options = {}) {
    const config = { ...this.defaultToastOptions, ...options };
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const toastElement = this.createToastElement(
      toastId,
      message,
      type,
      config
    );
    this.toastContainer.appendChild(toastElement);

    // Initialize Bootstrap toast
    const bsToast = new bootstrap.Toast(toastElement, {
      autohide: config.autohide,
      delay: config.delay,
    });

    // Show toast with animation
    toastElement.classList.add('fade-in');
    bsToast.show();

    // Auto-remove from DOM after hiding
    toastElement.addEventListener('hidden.bs.toast', () => {
      toastElement.remove();
    });

    return toastElement;
  }

  /**
   * Create toast HTML element
   * @param {string} id - Toast ID
   * @param {string} message - Toast message
   * @param {string} type - Toast type
   * @param {Object} options - Toast options
   * @returns {HTMLElement}
   */
  createToastElement(id, message, type, options) {
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');

    const typeConfig = this.getTypeConfig(type);
    const title = options.title || typeConfig.title;

    // Create toast structure safely to prevent XSS
    toast.innerHTML = `
      <div class="toast-header bg-${typeConfig.bgClass} text-white">
        <i class="bi bi-${typeConfig.icon} notification-icon"></i>
        <strong class="me-auto"></strong>
        ${options.timestamp !== false ? `<small class="text-white-50">${new Date().toLocaleTimeString()}</small>` : ''}
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
      <div class="toast-body">
      </div>
    `;

    // Set text content safely
    const titleElement = toast.querySelector('.me-auto');
    const bodyElement = toast.querySelector('.toast-body');
    if (titleElement) {titleElement.textContent = title;}
    if (bodyElement) {bodyElement.textContent = message;}

    return toast;
  }

  /**
   * Get configuration for notification types
   * @param {string} type - Notification type
   * @returns {Object}
   */
  getTypeConfig(type) {
    const configs = {
      success: { title: 'Success', icon: 'check-circle', bgClass: 'success' },
      error: {
        title: 'Error',
        icon: 'exclamation-triangle',
        bgClass: 'danger',
      },
      warning: {
        title: 'Warning',
        icon: 'exclamation-triangle',
        bgClass: 'warning',
      },
      info: { title: 'Information', icon: 'info-circle', bgClass: 'info' },
      primary: { title: 'Notice', icon: 'bell', bgClass: 'primary' },
    };

    return configs[type] || configs.info;
  }

  /**
   * Show confirmation dialog
   * @param {string} message - Confirmation message
   * @param {string} title - Dialog title
   * @param {string} type - Dialog type ('danger', 'warning', 'info', 'success')
   * @returns {Promise<boolean>} User's choice
   */
  async showConfirm(message, title = 'Confirm Action', type = 'warning') {
    return new Promise(resolve => {
      const modalId = `confirm-modal-${Date.now()}`;
      const modal = this.createConfirmModal(
        modalId,
        message,
        title,
        type,
        resolve
      );

      document.body.appendChild(modal);
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();

      // Clean up after modal is hidden
      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
      });

      // Fix accessibility: Remove focus from modal elements before hiding
      modal.addEventListener('hide.bs.modal', () => {
        const focusedElement = modal.querySelector(':focus');
        if (focusedElement) {
          focusedElement.blur();
        }
      });
    });
  }

  /**
   * Create confirmation modal
   * @param {string} id - Modal ID
   * @param {string} message - Modal message
   * @param {string} title - Modal title
   * @param {string} type - Modal type
   * @param {Function} resolve - Promise resolve function
   * @returns {HTMLElement}
   */
  createConfirmModal(id, message, title, type, resolve) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal fade notification-modal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', `${id}-label`);
    modal.setAttribute('aria-hidden', 'true');

    const typeConfig = this.getModalTypeConfig(type);

    // Create modal structure safely to prevent XSS
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${id}-label">
              <i class="bi bi-${typeConfig.icon} me-2 text-${typeConfig.textClass}"></i>
              <span class="title-text"></span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0 message-text"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-${typeConfig.btnClass}" id="${id}-confirm">
              ${typeConfig.confirmText}
            </button>
          </div>
        </div>
      </div>
    `;

    // Set text content safely
    const titleTextElement = modal.querySelector('.title-text');
    const messageTextElement = modal.querySelector('.message-text');
    if (titleTextElement) {titleTextElement.textContent = title;}
    if (messageTextElement) {messageTextElement.textContent = message;}

    // Add event listeners
    const cancelBtn = modal.querySelector('[data-bs-dismiss="modal"]');
    const confirmBtn = modal.querySelector(`#${id}-confirm`);

    const handleCancel = () => resolve(false);
    const handleConfirm = () => {
      modal.querySelector('.modal').classList.add('d-none');
      bootstrap.Modal.getInstance(modal).hide();
      resolve(true);
    };

    cancelBtn.addEventListener('click', handleCancel);
    confirmBtn.addEventListener('click', handleConfirm);

    // Handle escape key and backdrop click
    modal.addEventListener('hidden.bs.modal', () => {
      resolve(false);
    });

    return modal;
  }

  /**
   * Get modal type configuration
   * @param {string} type - Modal type
   * @returns {Object}
   */
  getModalTypeConfig(type) {
    const configs = {
      danger: {
        icon: 'exclamation-triangle',
        textClass: 'danger',
        btnClass: 'danger',
        confirmText: 'Delete',
      },
      warning: {
        icon: 'exclamation-triangle',
        textClass: 'warning',
        btnClass: 'warning',
        confirmText: 'Proceed',
      },
      info: {
        icon: 'info-circle',
        textClass: 'info',
        btnClass: 'primary',
        confirmText: 'OK',
      },
      success: {
        icon: 'check-circle',
        textClass: 'success',
        btnClass: 'success',
        confirmText: 'Continue',
      },
    };

    return configs[type] || configs.info;
  }

  /**
   * Show alert dialog (information only, no confirmation)
   * @param {string} message - Alert message
   * @param {string} title - Alert title
   * @param {string} type - Alert type
   * @returns {Promise<void>}
   */
  async showAlert(message, title = 'Alert', type = 'info') {
    return new Promise(resolve => {
      const modalId = `alert-modal-${Date.now()}`;
      const modal = this.createAlertModal(
        modalId,
        message,
        title,
        type,
        resolve
      );

      document.body.appendChild(modal);
      const bsModal = new bootstrap.Modal(modal);
      bsModal.show();

      // Clean up after modal is hidden
      modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
      });

      // Fix accessibility: Remove focus from modal elements before hiding
      modal.addEventListener('hide.bs.modal', () => {
        const focusedElement = modal.querySelector(':focus');
        if (focusedElement) {
          focusedElement.blur();
        }
      });
    });
  }

  /**
   * Create alert modal
   * @param {string} id - Modal ID
   * @param {string} message - Modal message
   * @param {string} title - Modal title
   * @param {string} type - Modal type
   * @param {Function} resolve - Promise resolve function
   * @returns {HTMLElement}
   */
  createAlertModal(id, message, title, type, resolve) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal fade notification-modal';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('aria-labelledby', `${id}-label`);
    modal.setAttribute('aria-hidden', 'true');

    const typeConfig = this.getModalTypeConfig(type);

    // Create modal structure safely to prevent XSS
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="${id}-label">
              <i class="bi bi-${typeConfig.icon} me-2 text-${typeConfig.textClass}"></i>
              <span class="title-text"></span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p class="mb-0 message-text"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
          </div>
        </div>
      </div>
    `;

    // Set text content safely
    const titleTextElement = modal.querySelector('.title-text');
    const messageTextElement = modal.querySelector('.message-text');
    if (titleTextElement) {titleTextElement.textContent = title;}
    if (messageTextElement) {messageTextElement.textContent = message;}

    // Add event listener
    modal.addEventListener('hidden.bs.modal', () => {
      resolve();
    });

    return modal;
  }

  /**
   * Clear all toast notifications
   */
  clearToasts() {
    const toasts = this.toastContainer.querySelectorAll('.toast');
    toasts.forEach(toast => {
      const bsToast = bootstrap.Toast.getInstance(toast);
      if (bsToast) {
        bsToast.hide();
      }
    });
  }

  /**
   * Utility methods for common notification patterns
   */
  success(message, options = {}) {
    return this.showToast(message, 'success', options);
  }

  error(message, options = {}) {
    return this.showToast(message, 'error', { delay: 8000, ...options });
  }

  warning(message, options = {}) {
    return this.showToast(message, 'warning', options);
  }

  info(message, options = {}) {
    return this.showToast(message, 'info', options);
  }

  /**
   * Confirmation shortcuts
   */
  async confirmDelete(message = 'Are you sure you want to delete this item?') {
    return this.showConfirm(message, 'Delete Confirmation', 'danger');
  }

  async confirmAction(message, title = 'Confirm Action') {
    return this.showConfirm(message, title, 'warning');
  }
}

// Create and export singleton instance
const notificationManager = new NotificationManager();

// Make available globally for backwards compatibility
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;

// Legacy function names for backwards compatibility
window.showToast = (message, type, options) =>
  notificationManager.showToast(message, type, options);
window.showError = (message, options) =>
  notificationManager.error(message, options);
window.showSuccess = (message, options) =>
  notificationManager.success(message, options);

// Export statements removed for browser compatibility - objects are available globally
