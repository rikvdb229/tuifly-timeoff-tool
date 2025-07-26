/**
 * Replies Page JavaScript
 * Handles email reply management with filtering and processing
 */

let replies = [];
let currentUser = null;
let currentFilter = 'needreview'; // Default to need review
let currentReplyId = null; // For reply modal

// DOM Elements
const loadingSpinner = document.getElementById('loadingSpinner');
const repliesList = document.getElementById('repliesList');
const emptyState = document.getElementById('emptyState');
const repliesContainer = document.getElementById('repliesContainer');

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
  try {
    // Initialize user data first
    await initializeUserData();
    
    await loadReplies();
    initializeEventListeners();
    await updateBadgeCounter();

    logger.info('Replies page initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize replies page:', error);
    showToast('Failed to load replies', 'error');
  }
});

// Initialize user data from server
async function initializeUserData() {
  try {
    const response = await fetch('/api/user/email-preference');
    const result = await response.json();
    
    if (result.success) {
      window.currentUserData = result.user;
      console.log('User data initialized:', window.currentUserData);
    } else {
      console.warn('Failed to load user data:', result.error);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Load replies from server
async function loadReplies() {
  try {
    showLoadingState();

    const response = await fetch(`/api/replies?filter=${currentFilter}`);
    const result = await response.json();

    if (result.success) {
      replies = result.data.replies;
      renderReplies();
    } else {
      throw new Error(result.error || 'Failed to load replies');
    }
  } catch (error) {
    logger.error('Failed to load replies:', error);
    showToast('Failed to load replies', 'error');
    showEmptyState();
  }
}

// Show loading state
function showLoadingState() {
  loadingSpinner.style.display = 'block';
  repliesList.style.display = 'none';
  emptyState.style.display = 'none';
}

// Show empty state
function showEmptyState() {
  loadingSpinner.style.display = 'none';
  repliesList.style.display = 'none';
  emptyState.style.display = 'block';

  // Update empty state message based on filter
  const emptyStateMessage = document.getElementById('emptyStateMessage');
  if (emptyStateMessage) {
    switch (currentFilter) {
      case 'needreview':
        emptyStateMessage.textContent =
          'No replies need review. Check for new replies using the button above.';
        break;
      case 'reviewed':
        emptyStateMessage.textContent = 'No replies have been reviewed yet.';
        break;
      case 'all':
        emptyStateMessage.textContent =
          'No replies found. Use "Check for Replies" to scan for responses.';
        break;
    }
  }
}

// Render replies
function renderReplies() {
  const filteredReplies = filterReplies(replies);

  if (filteredReplies.length === 0) {
    showEmptyState();
    return;
  }

  loadingSpinner.style.display = 'none';
  repliesList.style.display = 'block';
  emptyState.style.display = 'none';

  repliesList.innerHTML = '';

  // Sort by received date (newest first)
  const sortedReplies = [...filteredReplies].sort(
    (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
  );

  sortedReplies.forEach(reply => {
    const replyCard = createReplyCard(reply);
    repliesList.appendChild(replyCard);
  });
}

// Filter replies based on current filter
function filterReplies(replies) {
  switch (currentFilter) {
    case 'needreview':
      return replies.filter(r => !r.isProcessed);
    case 'reviewed':
      return replies.filter(r => r.isProcessed);
    case 'all':
    default:
      return replies;
  }
}

// Create reply card element
function createReplyCard(reply) {
  const request = reply.TimeOffRequest;
  const isProcessed = reply.isProcessed;

  const card = document.createElement('div');
  card.className = `card reply-card mb-3 ${isProcessed ? 'border-success' : 'border-warning'}`;

  // Format dates
  const startDate = new Date(request.startDate);
  const endDate = new Date(request.endDate);
  const receivedDate = new Date(reply.receivedAt);

  const dateRange =
    startDate.toDateString() === endDate.toDateString()
      ? formatDate(request.startDate)
      : `${formatDate(request.startDate)} - ${formatDate(request.endDate)}`;

  // Status badge
  const statusBadge = isProcessed
    ? `<span class="badge bg-success">Reviewed</span>`
    : `<span class="badge bg-warning text-dark">Needs Review</span>`;

  // Request type formatting
  const typeMap = {
    REQ_DO: 'Day Off',
    PM_OFF: 'PM Off',
    AM_OFF: 'AM Off',
    FLIGHT: 'Flight',
  };
  const typeLabel = typeMap[request.type] || request.type;
  const flightInfo = request.flightNumber ? ` (${request.flightNumber})` : '';

  card.innerHTML = `
    <div class="card-body">
      <!-- Request Info Header -->
      <div class="d-flex justify-content-between align-items-start mb-3">
        <div>
          <h6 class="mb-1">
            <i class="bi bi-calendar-event me-1"></i>
            ${dateRange} - ${typeLabel}${flightInfo}
          </h6>
          <small class="text-muted">
            <i class="bi bi-person me-1"></i>
            From: ${reply.fromName || reply.fromEmail} 
            <span class="mx-2">•</span>
            <i class="bi bi-clock me-1"></i>
            Received: ${formatDateTime(reply.receivedAt)}
          </small>
        </div>
        ${statusBadge}
      </div>
      
      <!-- Per-Date Approval Section (MOVED UP) -->
      ${
        !isProcessed
          ? `
          ${reply.allRequestsInGroup && reply.allRequestsInGroup.length > 1 
            ? createGroupApprovalInterface(reply)
            : createSingleApprovalInterface(reply)
          }
        `
          : `
          <div class="text-muted small mb-3">
            <i class="bi bi-check-circle me-1"></i>
            Processed as: <span class="badge bg-${getStatusColor(request.status)} ${request.status === 'PENDING' ? 'text-dark' : ''}">${request.status}</span>
            ${reply.processedAt ? `on ${formatDateTime(reply.processedAt)}` : ''}
          </div>
        `
        }
      
      <!-- Email Thread Conversation -->
      <div class="mt-3 pt-3 border-top">
        <h6 class="text-muted mb-2">
          <i class="bi bi-chat-dots me-1"></i>
          Email Conversation
        </h6>
        <div class="conversation-thread">
          ${reply.threadReplies && reply.threadReplies.length > 0 
            ? buildConversationThread(reply.threadReplies)
            : `<div class="reply-content bg-light p-3 rounded">
                <div class="reply-text">
                  ${formatReplyContent(cleanQuotedContent(reply.replyContent))}
                </div>
              </div>`
          }
          
          <!-- Original Request Email -->
          <div class="mb-3 mt-4 pt-3 border-top">
            <div class="reply-header d-flex justify-content-between align-items-center mb-1">
              <small class="text-muted">
                <strong>You (Original Request)</strong>
                <span class="mx-2">•</span>
                ${request.emailSent ? formatDateTime(request.emailSent) : 'Date unknown'}
              </small>
            </div>
            <div class="reply-content bg-primary bg-opacity-10 p-3 rounded">
              <div class="reply-text">
                ${formatOriginalRequestEmail(request, reply.allRequestsInGroup)}
              </div>
            </div>
          </div>
        </div>
      </div>
        
      <!-- Send Reply Section (for automatic email users - processed or unprocessed) -->
      ${
        window.currentUserData?.emailPreference === 'automatic'
          ? reply.userReplySent
            ? `
        <div class="reply-container mt-3 pt-3 border-top">
          <h6 class="text-muted mb-2">
            <i class="bi bi-check-circle text-success me-1"></i>
            Reply Sent
          </h6>
          <div class="bg-light p-3 rounded">
            <div class="reply-text mb-2">
              ${formatReplyContent(reply.userReplyContent)}
            </div>
            <small class="text-muted">
              <i class="bi bi-clock me-1"></i>
              Sent ${formatDateTime(reply.userReplySentAt)}
            </small>
          </div>
        </div>
      `
            : `
        <div class="reply-container mt-3 pt-3 border-top">
          <h6 class="text-muted mb-2">
            <i class="bi bi-reply me-1"></i>
            Reply to Scheduling
          </h6>
          <div class="mb-3">
            <textarea class="form-control" id="replyMessage-${reply.id}" rows="6" placeholder="Type response to scheduling..."></textarea>
          </div>
          <div class="d-flex justify-content-end">
            <button type="button" 
                    class="btn btn-primary btn-sm" 
                    onclick="sendDirectReply(${reply.id})"
                    title="Send a reply to this email">
              <i class="bi bi-send me-1"></i> Send Reply
            </button>
          </div>
        </div>
      `
          : ''
        }
      </div>
      
    </div>
  `;

  return card;
}

// Process reply (approve/deny/pending)
async function processReply(replyId, newStatus) {
  const statusText = newStatus.toLowerCase();

  // Remove confirmation dialog as requested - users are grown up
  try {
    const response = await fetch(`/api/replies/${replyId}/process`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    const result = await response.json();
    if (result.success) {
      showToast(`Reply marked as ${statusText}!`, 'success');

      // Reload replies and update badge
      await loadReplies();
      await updateBadgeCounter();

      // Update calendar symbols if on calendar page
      if (typeof updateRequestSymbols === 'function' && result.data.allUpdatedRequests) {
        // Update symbols for all requests that were updated (handles group requests)
        const updatedRequestSymbols = result.data.allUpdatedRequests.map(request => ({
          id: request.id,
          needsReview: false
        }));
        updateRequestSymbols(updatedRequestSymbols);
      }

      // Refresh calendar after 1 second (following existing pattern)
      setTimeout(() => {
        if (typeof loadExistingRequests === 'function') {
          loadExistingRequests();
        }
      }, 1000);
    } else {
      showToast(result.error || `Failed to ${statusText} reply`, 'error');
    }
  } catch (error) {
    logger.error('Error processing reply:', error);
    showToast(`Failed to ${statusText} reply`, 'error');
  }
}

// Show reply modal
function showReplyModal(replyId) {
  currentReplyId = replyId;
  const modal = new bootstrap.Modal(document.getElementById('replyModal'));

  // Clear previous content
  document.getElementById('replyMessage').value = '';

  modal.show();
}

// Send reply
async function sendReply() {
  const messageContent = document.getElementById('replyMessage').value.trim();

  if (!messageContent) {
    showToast('Please enter a message', 'warning');
    return;
  }

  if (!currentReplyId) {
    showToast('No reply selected', 'error');
    return;
  }

  try {
    const response = await fetch(`/api/replies/${currentReplyId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageContent }),
    });

    const result = await response.json();
    if (result.success) {
      showToast('Reply sent successfully!', 'success');

      // Close modal
      const modal = bootstrap.Modal.getInstance(
        document.getElementById('replyModal')
      );
      modal.hide();

      // Clear current reply ID
      currentReplyId = null;
    } else {
      showToast(result.error || 'Failed to send reply', 'error');
    }
  } catch (error) {
    logger.error('Error sending reply:', error);
    showToast('Failed to send reply', 'error');
  }
}

// Initialize event listeners
function initializeEventListeners() {
  // Filter buttons
  document.getElementById('filterNeedReview').addEventListener('change', () => {
    currentFilter = 'needreview';
    loadReplies(); // Use loadReplies instead of renderReplies to fetch fresh data
  });

  document.getElementById('filterReviewed').addEventListener('change', () => {
    currentFilter = 'reviewed';
    loadReplies(); // Use loadReplies instead of renderReplies to fetch fresh data
  });

  document.getElementById('filterAll').addEventListener('change', () => {
    currentFilter = 'all';
    loadReplies(); // Use loadReplies instead of renderReplies to fetch fresh data
  });
}

// Badge counter is now handled globally in utils.js

// Get status color for consistent styling
function getStatusColor(status) {
  const colors = {
    PENDING: 'warning',
    APPROVED: 'success',
    DENIED: 'danger',
  };
  return colors[status] || 'secondary';
}

// Create single request approval interface (original behavior)
function createSingleApprovalInterface(reply) {
  return `
    <div class="d-flex justify-content-between align-items-center">
      <div class="btn-group" role="group">
        <button type="button" 
                class="btn btn-outline-danger btn-sm" 
                onclick="processReply(${reply.id}, 'DENIED')"
                title="Deny this request">
          <i class="bi bi-x"></i> Deny
        </button>
        <button type="button" 
                class="btn btn-outline-warning btn-sm" 
                onclick="processReply(${reply.id}, 'PENDING')"
                title="Keep as pending">
          <i class="bi bi-clock"></i> Pending
        </button>
        <button type="button" 
                class="btn btn-outline-success btn-sm" 
                onclick="processReply(${reply.id}, 'APPROVED')"
                title="Approve this request">
          <i class="bi bi-check"></i> Approve
        </button>
      </div>
    </div>
  `;
}

// Create group request approval interface with per-date controls
function createGroupApprovalInterface(reply) {
  const sortedRequests = reply.allRequestsInGroup.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
  // Type label mapping
  const typeMap = {
    REQ_DO: 'DO',
    PM_OFF: 'PM',
    AM_OFF: 'AM',
    FLIGHT: 'FLIGHT',
  };
  
  return `
    <div class="group-approval-section">
      <div class="mb-4">
        <!-- Bulk Actions Header -->
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
                          onclick="bulkSetStatus(${reply.id}, 'DENIED')"
                          title="Deny all dates">
                    <i class="bi bi-x"></i>
                  </button>
                  <button type="button" 
                          class="btn btn-outline-warning" 
                          onclick="bulkSetStatus(${reply.id}, 'PENDING')"
                          title="Set all as pending">
                    <i class="bi bi-clock"></i>
                  </button>
                  <button type="button" 
                          class="btn btn-outline-success" 
                          onclick="bulkSetStatus(${reply.id}, 'APPROVED')"
                          title="Approve all dates">
                    <i class="bi bi-check"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Individual Date Cards -->
        ${sortedRequests.map(request => {
          const typeLabel = typeMap[request.type] || request.type;
          const formattedDate = new Date(request.startDate).toLocaleDateString('en-GB');
          
          return `
            <div class="card mb-2">
              <div class="card-body py-2">
                <div class="row align-items-center">
                  <div class="col-md-3">
                    <strong>${formattedDate}</strong>
                  </div>
                  <div class="col-md-3">
                    <span class="badge bg-secondary">${typeLabel}</span>
                    ${request.flightNumber ? `<br><small class="text-muted">${request.flightNumber}</small>` : ''}
                  </div>
                  <div class="col-md-3">
                    <span id="status-badge-${request.id}" class="badge bg-${getStatusColor(request.status)} ${request.status === 'PENDING' ? 'text-dark' : ''}">${request.status}</span>
                  </div>
                  <div class="col-md-3">
                    <div class="btn-group btn-group-sm" role="group">
                      <button type="button" 
                              id="deny-btn-${request.id}"
                              class="btn btn-outline-danger ${request.status === 'DENIED' ? 'active' : ''}" 
                              onclick="setIndividualStatus(${reply.id}, ${request.id}, 'DENIED')"
                              title="Deny">
                        <i class="bi bi-x"></i>
                      </button>
                      <button type="button" 
                              id="pending-btn-${request.id}"
                              class="btn btn-outline-warning ${request.status === 'PENDING' ? 'active' : ''}" 
                              onclick="setIndividualStatus(${reply.id}, ${request.id}, 'PENDING')"
                              title="Pending">
                        <i class="bi bi-clock"></i>
                      </button>
                      <button type="button" 
                              id="approve-btn-${request.id}"
                              class="btn btn-outline-success ${request.status === 'APPROVED' ? 'active' : ''}" 
                              onclick="setIndividualStatus(${reply.id}, ${request.id}, 'APPROVED')"
                              title="Approve">
                        <i class="bi bi-check"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Submit Action -->
      <div class="text-center mt-3 pt-3 border-top">
        <button type="button" 
                class="btn btn-primary" 
                onclick="submitIndividualApprovals(${reply.id})"
                id="submit-approvals-${reply.id}">
          <i class="bi bi-check-circle me-1"></i>
          Update Request
        </button>
      </div>
    </div>
  `;
}

// Track individual request statuses for group approvals
const individualStatuses = new Map(); // replyId -> Map<requestId, status>

// Set individual status for a request in a group
function setIndividualStatus(replyId, requestId, status) {
  if (!individualStatuses.has(replyId)) {
    individualStatuses.set(replyId, new Map());
  }
  
  const replyStatuses = individualStatuses.get(replyId);
  replyStatuses.set(requestId, status);
  
  // Update button states
  const denyBtn = document.getElementById(`deny-btn-${requestId}`);
  const pendingBtn = document.getElementById(`pending-btn-${requestId}`);
  const approveBtn = document.getElementById(`approve-btn-${requestId}`);
  
  // Remove active class from all buttons and ensure they're outline buttons
  [denyBtn, pendingBtn, approveBtn].forEach(btn => {
    if (btn) {
      btn.classList.remove('active');
      // Ensure button has outline class
      if (!btn.classList.contains('btn-outline-danger') && 
          !btn.classList.contains('btn-outline-warning') && 
          !btn.classList.contains('btn-outline-success')) {
        // Re-add the appropriate outline class if missing
        if (btn.id.includes('deny')) btn.classList.add('btn-outline-danger');
        if (btn.id.includes('pending')) btn.classList.add('btn-outline-warning');
        if (btn.id.includes('approve')) btn.classList.add('btn-outline-success');
      }
    }
  });
  
  // Add active class to selected button
  // Map status to button ID prefix
  const buttonPrefixMap = {
    'DENIED': 'deny',
    'PENDING': 'pending',
    'APPROVED': 'approve'
  };
  const buttonPrefix = buttonPrefixMap[status];
  const selectedBtn = document.getElementById(`${buttonPrefix}-btn-${requestId}`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
    // Force a reflow to ensure styles are applied
    void selectedBtn.offsetHeight;
  }
  
  // Update the status badge
  const statusBadge = document.getElementById(`status-badge-${requestId}`);
  if (statusBadge) {
    // Remove all status color classes
    statusBadge.classList.remove('bg-warning', 'bg-success', 'bg-danger', 'text-dark');
    
    // Add appropriate color class
    const colorClass = getStatusColor(status);
    statusBadge.classList.add(`bg-${colorClass}`);
    if (status === 'PENDING') {
      statusBadge.classList.add('text-dark');
    }
    
    // Update the text
    statusBadge.textContent = status;
  }
  
  logger.info(`Set individual status: Request ${requestId} -> ${status}`, { replyId, requestId, status });
}

// Bulk set status for all requests in a group
function bulkSetStatus(replyId, status) {
  const reply = replies.find(r => r.id === replyId);
  if (!reply || !reply.allRequestsInGroup) return;
  
  // Set status for all requests - this will update individual buttons and badges
  reply.allRequestsInGroup.forEach(request => {
    setIndividualStatus(replyId, request.id, status);
  });
  
  logger.info(`Bulk set status: ${reply.allRequestsInGroup.length} requests -> ${status}`, { replyId, status });
}

// Submit individual approvals for a group reply
async function submitIndividualApprovals(replyId) {
  try {
    const reply = replies.find(r => r.id === replyId);
    if (!reply || !reply.allRequestsInGroup) {
      throw new Error('Reply or group requests not found');
    }
    
    const replyStatuses = individualStatuses.get(replyId) || new Map();
    
    // Build request statuses array
    const requestStatuses = reply.allRequestsInGroup.map(request => ({
      requestId: request.id,
      status: replyStatuses.get(request.id) || request.status || 'PENDING'
    }));
    
    // Disable submit button
    const submitBtn = document.getElementById(`submit-approvals-${replyId}`);
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Processing...';
    }
    
    const response = await fetch(`/api/replies/${replyId}/process-individual`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestStatuses }),
    });
    
    const result = await response.json();
    if (result.success) {
      showToast('Reply processed with individual decisions!', 'success');
      
      // Clear the stored statuses
      individualStatuses.delete(replyId);
      
      // Reload replies and update badge
      await loadReplies();
      await updateBadgeCounter();
      
      // Update calendar symbols if on calendar page
      if (typeof updateRequestSymbols === 'function' && result.data.updatedRequests) {
        const updatedRequestSymbols = result.data.updatedRequests.map(request => ({
          id: request.id,
          needsReview: false
        }));
        updateRequestSymbols(updatedRequestSymbols);
      }
      
      // Refresh calendar after 1 second
      setTimeout(() => {
        if (typeof loadExistingRequests === 'function') {
          loadExistingRequests();
        }
      }, 1000);
    } else {
      throw new Error(result.error || 'Failed to process reply');
    }
  } catch (error) {
    logger.error('Error submitting individual approvals:', error);
    showToast('Failed to process reply', 'error');
    
    // Re-enable submit button
    const submitBtn = document.getElementById(`submit-approvals-${replyId}`);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Update Request';
    }
  }
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Format date and time for display
function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Format reply content (preserve line breaks, handle long text)
function formatReplyContent(content) {
  if (!content) return '';

  // Escape HTML and preserve line breaks
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  // Truncate if too long (show first 1000 chars with expand option)
  if (escaped.length > 1000) {
    const truncated = escaped.substring(0, 1000);
    const remaining = escaped.substring(1000);

    return `
      <div class="reply-content-truncated">
        <div class="reply-preview">${truncated}...</div>
        <div class="reply-full" style="display: none;">${escaped}</div>
        <button type="button" class="btn btn-link btn-sm p-0 mt-2" onclick="toggleReplyContent(this)">
          <i class="bi bi-chevron-down me-1"></i>Show more
        </button>
      </div>
    `;
  }

  return escaped;
}

// Toggle reply content expansion
function toggleReplyContent(button) {
  const container = button.closest('.reply-content-truncated');
  const preview = container.querySelector('.reply-preview');
  const full = container.querySelector('.reply-full');
  const icon = button.querySelector('i');

  if (full.style.display === 'none') {
    preview.style.display = 'none';
    full.style.display = 'block';
    button.innerHTML = '<i class="bi bi-chevron-up me-1"></i>Show less';
  } else {
    preview.style.display = 'block';
    full.style.display = 'none';
    button.innerHTML = '<i class="bi bi-chevron-down me-1"></i>Show more';
  }
}

// Send direct reply from inline textarea
async function sendDirectReply(replyId) {
  const messageTextarea = document.getElementById(`replyMessage-${replyId}`);
  const messageContent = messageTextarea?.value.trim();

  if (!messageContent) {
    showToast('Please enter a message', 'warning');
    return;
  }

  const button = document.querySelector(`[onclick="sendDirectReply(${replyId})"]`);
  const originalText = button?.innerHTML;
  
  try {
    // Show loading state
    if (button) {
      button.disabled = true;
      button.innerHTML = '<i class="spinner-border spinner-border-sm me-1"></i>Sending...';
    }

    const response = await fetch(`/api/replies/${replyId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageContent }),
    });

    const result = await response.json();
    if (result.success) {
      showToast('Reply sent successfully!', 'success');
      
      // Reload replies to show updated state from database
      setTimeout(() => {
        loadReplies();
      }, 1000);
    } else {
      showToast(result.error || 'Failed to send reply', 'error');
    }
  } catch (error) {
    logger.error('Error sending direct reply:', error);
    showToast('Failed to send reply', 'error');
  } finally {
    // Reset button state
    if (button && originalText) {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  }
}

// Build conversation thread with proper message ordering
function buildConversationThread(threadReplies) {
  const messages = [];
  
  // Process each reply and extract both manager reply and user reply if exists
  threadReplies.forEach(threadReply => {
    // Add manager's reply
    messages.push({
      type: 'manager',
      content: threadReply.replyContent,
      from: threadReply.fromName || threadReply.fromEmail,
      timestamp: threadReply.receivedAt
    });
    
    // Add user's reply if exists
    if (threadReply.userReplySent) {
      messages.push({
        type: 'user',
        content: threadReply.userReplyContent,
        from: 'You',
        timestamp: threadReply.userReplySentAt
      });
    }
  });
  
  // Sort by timestamp (newest first)
  messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Build HTML for each message
  return messages.map(msg => `
    <div class="mb-3">
      <div class="reply-header d-flex justify-content-between align-items-center mb-1">
        <small class="text-muted">
          <strong>${msg.from}</strong>
          <span class="mx-2">•</span>
          ${formatDateTime(msg.timestamp)}
        </small>
      </div>
      <div class="reply-content ${msg.type === 'user' ? 'bg-primary bg-opacity-10' : 'bg-light'} p-3 rounded">
        <div class="reply-text">
          ${formatReplyContent(cleanQuotedContent(msg.content))}
        </div>
      </div>
    </div>
  `).join('');
}

// Clean quoted content from email replies (remove > lines and "On ... wrote:" lines)
function cleanQuotedContent(content) {
  if (!content) return '';
  
  // Split into lines
  const lines = content.split('\n');
  const cleanedLines = [];
  let skipMode = false;
  
  for (const line of lines) {
    // Check if this is a quote header like "On ... wrote:" (with or without email in <>)
    if (line.match(/^On .* wrote:/) || line.match(/^On .* <.*@.*> wrote:/)) {
      skipMode = true;
      continue;
    }
    
    // Skip lines that start with > (quoted content)
    if (line.trim().startsWith('>')) {
      skipMode = true;
      continue;
    }
    
    // If we're not in skip mode and the line doesn't start with >, include it
    if (!skipMode && !line.trim().startsWith('>')) {
      cleanedLines.push(line);
    }
    
    // Reset skip mode on empty lines after quotes
    if (skipMode && line.trim() === '') {
      skipMode = false;
    }
  }
  
  // Remove trailing empty lines and clean up
  return cleanedLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Replace multiple newlines with max 2
    .trim();
}

// Format the original request email content
function formatOriginalRequestEmail(request, allRequests) {
  // Group requests by type for better formatting
  const groupedRequests = {};
  allRequests.forEach(req => {
    const dateStr = formatDate(req.startDate);
    if (!groupedRequests[dateStr]) {
      groupedRequests[dateStr] = [];
    }
    groupedRequests[dateStr].push(req);
  });
  
  // Build the email content
  let content = 'Dear,<br><br>';
  
  for (const [date, requests] of Object.entries(groupedRequests)) {
    requests.forEach(req => {
      const typeMap = {
        REQ_DO: 'REQ DO',
        PM_OFF: 'PM OFF',
        AM_OFF: 'AM OFF',
        FLIGHT: 'FLIGHT',
      };
      const typeLabel = typeMap[req.type] || req.type;
      content += `${typeLabel} - ${date}`;
      if (req.flightNumber) {
        content += ` (${req.flightNumber})`;
      }
      content += '<br>';
    });
  }
  
  if (request.customMessage) {
    content += `<br>${request.customMessage}<br>`;
  }
  
  content += '<br>Brgds,<br>';
  content += window.currentUserData?.name || 'User';
  
  return content;
}

// Export functions for global access
window.processReply = processReply;
window.showReplyModal = showReplyModal;
window.sendReply = sendReply;
window.sendDirectReply = sendDirectReply;
window.updateBadgeCounter = updateBadgeCounter;