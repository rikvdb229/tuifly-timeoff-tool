/**
 * Admin Roster Management Page
 * Handles roster schedule creation, editing, and management
 */

let rosterSchedules = [];
let currentUser = null;

// DOM Elements
const loadingSpinner = document.getElementById('loadingSpinner');
const rosterContainer = document.getElementById('rosterContainer');
const emptyState = document.getElementById('emptyState');
const createRosterForm = document.getElementById('createRosterForm');
const editRosterForm = document.getElementById('editRosterForm');
const saveRosterBtn = document.getElementById('saveRosterBtn');
const updateRosterBtn = document.getElementById('updateRosterBtn');

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
  try {
    await loadUserData();
    await loadRosterSchedules();
    initializeEventListeners();
    initializeTooltips();
    
    logger.info('Admin roster page initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize admin roster page:', error);
    showToast('Failed to load roster management page', 'error');
  }
});

// Load current user data
async function loadUserData() {
  try {
    const response = await fetch('/auth/status');
    const result = await response.json();
    
    if (result.authenticated) {
      currentUser = result.user;
      document.getElementById('navUserName').textContent = currentUser.name || currentUser.email;
      
      // Check admin permissions
      if (!currentUser.canManageRosters && !currentUser.isAdmin) {
        showToast('You do not have permission to manage rosters', 'error');
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }
    } else {
      window.location.href = '/auth/login';
    }
  } catch (error) {
    logger.error('Failed to load user data:', error);
    window.location.href = '/auth/login';
  }
}

// Load roster schedules
async function loadRosterSchedules() {
  try {
    showLoadingState();
    
    const response = await fetch('/api/admin/rosters');
    const result = await response.json();
    
    if (result.success) {
      rosterSchedules = result.data;
      renderRosterSchedules();
      updateStatsCards();
    } else {
      throw new Error(result.error || 'Failed to load roster schedules');
    }
  } catch (error) {
    logger.error('Failed to load roster schedules:', error);
    showToast('Failed to load roster schedules', 'error');
    showEmptyState();
  }
}

// Show loading state
function showLoadingState() {
  loadingSpinner.style.display = 'block';
  rosterContainer.style.display = 'none';
  emptyState.style.display = 'none';
}

// Show empty state
function showEmptyState() {
  loadingSpinner.style.display = 'none';
  rosterContainer.style.display = 'none';
  emptyState.style.display = 'block';
}

// Render roster schedules
function renderRosterSchedules() {
  if (rosterSchedules.length === 0) {
    showEmptyState();
    return;
  }
  
  loadingSpinner.style.display = 'none';
  rosterContainer.style.display = 'flex';
  emptyState.style.display = 'none';
  
  rosterContainer.innerHTML = '';
  
  // Sort schedules by publication date
  const sortedSchedules = [...rosterSchedules].sort((a, b) => 
    new Date(a.publicationDate) - new Date(b.publicationDate)
  );
  
  sortedSchedules.forEach(schedule => {
    const rosterCard = createRosterCard(schedule);
    rosterContainer.appendChild(rosterCard);
  });
}

// Create roster card
function createRosterCard(schedule) {
  const col = document.createElement('div');
  col.className = 'col-lg-6 col-xl-4 mb-4';
  
  const statusClass = getStatusClass(schedule.status);
  const statusText = getStatusText(schedule.status);
  
  col.innerHTML = `
    <div class="card roster-card h-100">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-start mb-3">
          <div>
            <h6 class="card-title mb-1">
              ${schedule.description || 'Roster Period'}
            </h6>
            <div class="roster-dates">
              ${formatDate(schedule.startPeriod)} - ${formatDate(schedule.endPeriod)}
            </div>
          </div>
          <span class="badge ${statusClass} roster-status">
            ${statusText}
          </span>
        </div>
        
        <div class="mb-3">
          <div class="row text-center">
            <div class="col-6">
              <small class="text-muted d-block">Publication Date</small>
              <strong>${formatDate(schedule.publicationDate)}</strong>
            </div>
            <div class="col-6">
              <small class="text-muted d-block">Request Deadline</small>
              <strong>${formatDate(schedule.latestRequestDate)}</strong>
            </div>
          </div>
        </div>
        
        ${schedule.status === 'accepting_requests' ? `
          <div class="text-center mb-3">
            <div class="days-until text-success">
              <i class="bi bi-clock"></i>
              ${schedule.daysUntilDeadline} days remaining
            </div>
          </div>
        ` : ''}
        
        <div class="d-flex justify-content-between align-items-center">
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" 
                   id="active-${schedule.id}" 
                   ${schedule.isActive ? 'checked' : ''}
                   onchange="toggleRosterActive(${schedule.id}, this.checked)">
            <label class="form-check-label" for="active-${schedule.id}">
              <small>Active</small>
            </label>
          </div>
          
          <div>
            <button class="btn btn-sm btn-outline-primary btn-roster-action me-1"
                    onclick="editRoster(${schedule.id})"
                    data-bs-toggle="tooltip" title="Edit roster">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger btn-roster-action"
                    onclick="deleteRoster(${schedule.id})"
                    data-bs-toggle="tooltip" title="Delete roster">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  return col;
}

// Get status class for badges
function getStatusClass(status) {
  switch (status) {
    case 'accepting_requests':
      return 'bg-success status-accepting';
    case 'deadline_passed':
      return 'bg-warning status-deadline-passed';
    case 'published':
      return 'bg-secondary status-published';
    default:
      return 'bg-secondary';
  }
}

// Get status text
function getStatusText(status) {
  switch (status) {
    case 'accepting_requests':
      return 'Accepting Requests';
    case 'deadline_passed':
      return 'Deadline Passed';
    case 'published':
      return 'Published';
    default:
      return 'Unknown';
  }
}

// Update stats cards
function updateStatsCards() {
  const stats = {
    active: rosterSchedules.filter(r => r.isActive).length,
    accepting: rosterSchedules.filter(r => r.status === 'accepting_requests').length,
    deadlinePassed: rosterSchedules.filter(r => r.status === 'deadline_passed').length,
    published: rosterSchedules.filter(r => r.status === 'published').length
  };
  
  document.getElementById('statsActiveSchedules').textContent = stats.active;
  document.getElementById('statsAcceptingRequests').textContent = stats.accepting;
  document.getElementById('statsDeadlinePassed').textContent = stats.deadlinePassed;
  document.getElementById('statsPublished').textContent = stats.published;
}

// Initialize event listeners
function initializeEventListeners() {
  // Create roster form
  saveRosterBtn.addEventListener('click', handleCreateRoster);
  updateRosterBtn.addEventListener('click', handleUpdateRoster);
  
  // Form validation
  const dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach(input => {
    input.addEventListener('change', validateDates);
  });
}

// Initialize tooltips
function initializeTooltips() {
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });
}

// Handle create roster
async function handleCreateRoster() {
  try {
    if (!createRosterForm.checkValidity()) {
      createRosterForm.classList.add('was-validated');
      return;
    }
    
    setButtonLoading(saveRosterBtn, true);
    
    const formData = {
      publicationDate: document.getElementById('publicationDate').value,
      latestRequestDate: document.getElementById('latestRequestDate').value,
      startPeriod: document.getElementById('startPeriod').value,
      endPeriod: document.getElementById('endPeriod').value,
      description: document.getElementById('description').value,
      isActive: document.getElementById('isActive').checked
    };
    
    const response = await fetch('/api/admin/rosters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Roster schedule created successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('createRosterModal')).hide();
      createRosterForm.reset();
      createRosterForm.classList.remove('was-validated');
      await loadRosterSchedules();
    } else {
      throw new Error(result.error || 'Failed to create roster schedule');
    }
  } catch (error) {
    logger.error('Failed to create roster:', error);
    showToast('Failed to create roster schedule', 'error');
  } finally {
    setButtonLoading(saveRosterBtn, false);
  }
}

// Handle update roster
async function handleUpdateRoster() {
  try {
    if (!editRosterForm.checkValidity()) {
      editRosterForm.classList.add('was-validated');
      return;
    }
    
    setButtonLoading(updateRosterBtn, true);
    
    const rosterId = document.getElementById('editRosterId').value;
    const formData = {
      publicationDate: document.getElementById('editPublicationDate').value,
      latestRequestDate: document.getElementById('editLatestRequestDate').value,
      startPeriod: document.getElementById('editStartPeriod').value,
      endPeriod: document.getElementById('editEndPeriod').value,
      description: document.getElementById('editDescription').value,
      isActive: document.getElementById('editIsActive').checked
    };
    
    const response = await fetch(`/api/admin/rosters/${rosterId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Roster schedule updated successfully', 'success');
      bootstrap.Modal.getInstance(document.getElementById('editRosterModal')).hide();
      await loadRosterSchedules();
    } else {
      throw new Error(result.error || 'Failed to update roster schedule');
    }
  } catch (error) {
    logger.error('Failed to update roster:', error);
    showToast('Failed to update roster schedule', 'error');
  } finally {
    setButtonLoading(updateRosterBtn, false);
  }
}

// Edit roster
function editRoster(rosterId) {
  const roster = rosterSchedules.find(r => r.id === rosterId);
  if (!roster) {
    showToast('Roster not found', 'error');
    return;
  }
  
  // Populate edit form
  document.getElementById('editRosterId').value = roster.id;
  document.getElementById('editPublicationDate').value = roster.publicationDate;
  document.getElementById('editLatestRequestDate').value = roster.latestRequestDate;
  document.getElementById('editStartPeriod').value = roster.startPeriod;
  document.getElementById('editEndPeriod').value = roster.endPeriod;
  document.getElementById('editDescription').value = roster.description || '';
  document.getElementById('editIsActive').checked = roster.isActive;
  
  // Show modal
  const modal = new bootstrap.Modal(document.getElementById('editRosterModal'));
  modal.show();
}

// Toggle roster active status
async function toggleRosterActive(rosterId, isActive) {
  try {
    const response = await fetch(`/api/admin/rosters/${rosterId}/toggle-active`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ isActive })
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(`Roster ${isActive ? 'activated' : 'deactivated'} successfully`, 'success');
      await loadRosterSchedules();
    } else {
      throw new Error(result.error || 'Failed to toggle roster status');
    }
  } catch (error) {
    logger.error('Failed to toggle roster status:', error);
    showToast('Failed to update roster status', 'error');
    // Revert checkbox state
    document.getElementById(`active-${rosterId}`).checked = !isActive;
  }
}

// Delete roster
async function deleteRoster(rosterId) {
  const roster = rosterSchedules.find(r => r.id === rosterId);
  if (!roster) {
    showToast('Roster not found', 'error');
    return;
  }
  
  const confirmMessage = `Are you sure you want to delete this roster schedule?\n\n${roster.description || 'Roster Period'}\n${formatDate(roster.startPeriod)} - ${formatDate(roster.endPeriod)}\n\nThis action cannot be undone.`;
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/admin/rosters/${rosterId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Roster schedule deleted successfully', 'success');
      await loadRosterSchedules();
    } else {
      throw new Error(result.error || 'Failed to delete roster schedule');
    }
  } catch (error) {
    logger.error('Failed to delete roster:', error);
    showToast('Failed to delete roster schedule', 'error');
  }
}

// Validate dates
function validateDates() {
  // Add date validation logic here
  const publicationDate = document.getElementById('publicationDate');
  const latestRequestDate = document.getElementById('latestRequestDate');
  const startPeriod = document.getElementById('startPeriod');
  const endPeriod = document.getElementById('endPeriod');
  
  if (publicationDate && latestRequestDate && publicationDate.value && latestRequestDate.value) {
    if (new Date(publicationDate.value) <= new Date(latestRequestDate.value)) {
      publicationDate.setCustomValidity('Publication date must be after the request deadline');
    } else {
      publicationDate.setCustomValidity('');
    }
  }
  
  if (startPeriod && endPeriod && startPeriod.value && endPeriod.value) {
    if (new Date(startPeriod.value) >= new Date(endPeriod.value)) {
      endPeriod.setCustomValidity('End date must be after start date');
    } else {
      endPeriod.setCustomValidity('');
    }
  }
}

// Set button loading state
function setButtonLoading(button, isLoading) {
  const btnText = button.querySelector('.btn-text');
  const btnLoading = button.querySelector('.btn-loading');
  
  if (isLoading) {
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-block';
    button.disabled = true;
  } else {
    btnText.style.display = 'inline-block';
    btnLoading.style.display = 'none';
    button.disabled = false;
  }
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}