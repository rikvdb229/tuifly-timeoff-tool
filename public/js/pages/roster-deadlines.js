/**
 * Roster Deadlines Page
 * Shows all roster periods and their request deadlines in a user-friendly format
 */

let rosterSchedules = [];
let currentUser = null;
let currentFilter = 'upcoming'; // Default to upcoming rosters
let isTimelineView = true;

// DOM Elements
const loadingSpinner = document.getElementById('loadingSpinner');
const deadlinesList = document.getElementById('deadlinesList');
const emptyState = document.getElementById('emptyState');
const deadlinesContainer = document.getElementById('deadlinesContainer');

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
  try {
    await loadUserData();
    await loadRosterDeadlines();
    initializeEventListeners();
    
    logger.info('Roster deadlines page initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize roster deadlines page:', error);
    showToast('Failed to load roster deadlines', 'error');
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
      
      // Show admin menu if user is admin
      if (currentUser.isAdmin) {
        const adminMenuItem = document.getElementById('adminMenuItem');
        if (adminMenuItem) {
          adminMenuItem.style.display = 'block';
        }
      }
    } else {
      window.location.href = '/auth/login';
    }
  } catch (error) {
    logger.error('Failed to load user data:', error);
    window.location.href = '/auth/login';
  }
}

// Load roster deadlines
async function loadRosterDeadlines() {
  try {
    showLoadingState();
    
    const response = await fetch('/api/roster-deadlines');
    const result = await response.json();
    
    if (result.success) {
      rosterSchedules = result.data;
      renderDeadlines();
    } else {
      throw new Error(result.error || 'Failed to load roster deadlines');
    }
  } catch (error) {
    logger.error('Failed to load roster deadlines:', error);
    showToast('Failed to load roster deadlines', 'error');
    showEmptyState();
  }
}

// Show loading state
function showLoadingState() {
  loadingSpinner.style.display = 'block';
  deadlinesList.style.display = 'none';
  emptyState.style.display = 'none';
}

// Show empty state
function showEmptyState() {
  loadingSpinner.style.display = 'none';
  deadlinesList.style.display = 'none';
  emptyState.style.display = 'block';
}

// Render deadlines
function renderDeadlines() {
  const filteredSchedules = filterSchedules(rosterSchedules);
  
  if (filteredSchedules.length === 0) {
    showEmptyState();
    return;
  }
  
  loadingSpinner.style.display = 'none';
  deadlinesList.style.display = 'block';
  emptyState.style.display = 'none';
  
  deadlinesList.innerHTML = '';
  
  // Sort by request deadline
  const sortedSchedules = [...filteredSchedules].sort((a, b) => 
    new Date(a.latestRequestDate) - new Date(b.latestRequestDate)
  );
  
  sortedSchedules.forEach((schedule, index) => {
    const deadlineCard = createDeadlineCard(schedule, index);
    deadlinesList.appendChild(deadlineCard);
  });
}

// Filter schedules based on current filter
function filterSchedules(schedules) {
  const today = new Date().toISOString().split('T')[0];
  
  switch (currentFilter) {
    case 'upcoming':
      return schedules.filter(s => s.latestRequestDate >= today);
    case 'passed':
      return schedules.filter(s => s.latestRequestDate < today);
    default:
      return schedules;
  }
}

// Create deadline card
function createDeadlineCard(schedule, index) {
  const today = new Date();
  const deadlineDate = new Date(schedule.latestRequestDate + 'T23:59:59');
  const daysUntilDeadline = Math.ceil((deadlineDate - today) / (1000 * 60 * 60 * 24));
  const isPassed = deadlineDate < today;
  const isWithinWeek = daysUntilDeadline <= 7 && daysUntilDeadline >= 0;
  
  const card = document.createElement('div');
  card.className = `card deadline-card ${isPassed ? 'deadline-passed' : isWithinWeek ? 'deadline-soon' : 'deadline-upcoming'}`;
  
  // Add timeline dot if in timeline view
  if (isTimelineView) {
    const dot = document.createElement('div');
    dot.className = `timeline-dot ${isPassed ? 'passed' : isWithinWeek ? 'active' : 'upcoming'}`;
    dot.style.top = `${index * 150 + 30}px`; // Adjust position based on card index
    card.appendChild(dot);
  }
  
  const statusBadge = isPassed 
    ? '<span class="badge bg-danger">Deadline Passed</span>'
    : isWithinWeek 
      ? `<span class="badge bg-warning text-dark">${daysUntilDeadline} days left</span>`
      : `<span class="badge bg-success">${daysUntilDeadline} days left</span>`;
  
  const daysDisplay = isPassed
    ? `<span class="text-danger"><i class="bi bi-x-circle"></i> Closed</span>`
    : isWithinWeek
      ? `<span class="text-warning days-remaining"><i class="bi bi-exclamation-triangle"></i> ${daysUntilDeadline} days</span>`
      : `<span class="text-success days-remaining"><i class="bi bi-check-circle"></i> ${daysUntilDeadline} days</span>`;
  
  card.innerHTML = `
    <div class="card-body">
      <div class="row align-items-center">
        <div class="col-md-6">
          <h5 class="roster-period mb-1">
            ${formatDateRange(schedule.startPeriod, schedule.endPeriod)}
          </h5>
          <p class="deadline-date mb-0">
            <i class="bi bi-calendar-event"></i>
            Request Deadline: <strong>${formatDate(schedule.latestRequestDate)}</strong>
          </p>
          <small class="text-muted">
            <i class="bi bi-megaphone"></i>
            Publication: ${formatDate(schedule.publicationDate)}
          </small>
        </div>
        
        <div class="col-md-3 text-center">
          <div class="mb-2">
            ${daysDisplay}
          </div>
          ${statusBadge}
        </div>
        
        <div class="col-md-3 text-end">
          ${!isPassed ? `
            <a href="/" class="btn btn-primary btn-sm">
              <i class="bi bi-calendar-plus"></i>
              Request Time Off
            </a>
          ` : `
            <button class="btn btn-secondary btn-sm" disabled>
              <i class="bi bi-lock"></i>
              Closed
            </button>
          `}
        </div>
      </div>
      
      ${schedule.description ? `
        <div class="mt-2">
          <small class="text-muted">
            <i class="bi bi-info-circle"></i>
            ${schedule.description}
          </small>
        </div>
      ` : ''}
    </div>
  `;
  
  return card;
}

// Initialize event listeners
function initializeEventListeners() {
  // Filter buttons
  document.getElementById('filterAll').addEventListener('change', () => {
    currentFilter = 'all';
    renderDeadlines();
  });
  
  document.getElementById('filterUpcoming').addEventListener('change', () => {
    currentFilter = 'upcoming';
    renderDeadlines();
  });
  
  document.getElementById('filterPassed').addEventListener('change', () => {
    currentFilter = 'passed';
    renderDeadlines();
  });
  
  // Timeline view toggle
  document.getElementById('timelineView').addEventListener('change', (e) => {
    isTimelineView = e.target.checked;
    deadlinesContainer.classList.toggle('timeline-container', isTimelineView);
    renderDeadlines();
  });
}

// Format date for display
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Format date range
function formatDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
  const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  
  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${start.getDate()}-${end.getDate()}, ${startYear}`;
    } else {
      return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${startYear}`;
    }
  } else {
    return `${startMonth} ${start.getDate()}, ${startYear} - ${endMonth} ${end.getDate()}, ${endYear}`;
  }
}