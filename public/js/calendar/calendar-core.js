/**
 * Calendar Core Module
 * Contains CalendarManager class, date calculations, and calendar rendering logic
 */

// Configuration from meta tags
const CONFIG = {
  MIN_ADVANCE_DAYS: parseInt(
    document.querySelector('meta[name="min-advance-days"]')?.content || 60
  ),
  MAX_ADVANCE_DAYS: parseInt(
    document.querySelector('meta[name="max-advance-days"]')?.content || 180 // 6 months
  ),
  MAX_DAYS_PER_REQUEST: parseInt(
    document.querySelector('meta[name="max-days-per-request"]')?.content || 4
  ),
  REQUEST_TYPES: {
    REQ_DO: 'DO',
    PM_OFF: 'PM',
    AM_OFF: 'AM',
    FLIGHT: 'FL',
  },
};

// Global state - ensure these are truly global
window.existingRequests = window.existingRequests || [];
window.selectedDates = window.selectedDates || [];
window.currentUserData = window.currentUserData || null;

// DST-safe date utility
function addDays(dateStr, days) {
  const parts = dateStr.split('-');
  const date = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2])
  );
  date.setDate(date.getDate() + days);
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  return utcDate.toISOString().split('T')[0];
}

// Enhanced consecutive date validation
function validateConsecutiveDates(dates) {
  if (dates.length <= 1) {return true;}

  const sortedDates = [...dates].sort();
  for (let i = 1; i < sortedDates.length; i++) {
    const expectedDate = addDays(sortedDates[i - 1], 1);
    if (sortedDates[i] !== expectedDate) {
      return false;
    }
  }
  return true;
}

// Calendar Management Class
class CalendarManager {
  constructor() {
    this.today = new Date();
    this.rosterDeadlines = new Map(); // Cache for roster deadlines
    
    // Initial fallback values (will be updated from roster schedules)
    this.minDate = this.addDays(this.today, CONFIG.MIN_ADVANCE_DAYS);
    this.maxDate = this.addDays(this.today, CONFIG.MAX_ADVANCE_DAYS);

    // Allow viewing past requests - start from 6 months before today
    this.viewMinDate = this.addDays(this.today, -180);
    // Allow viewing through December 2025
    this.viewMaxDate = new Date(2025, 11, 31); // December 31, 2025

    // Find the first month that has selectable days
    // Start from current month and go forward until we find selectable dates
    let firstSelectableMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    let foundSelectable = false;
    
    // Check up to 12 months ahead
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(firstSelectableMonth);
      monthStart.setMonth(monthStart.getMonth() + i);
      
      // Check if any day in this month is selectable
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      for (let day = new Date(monthStart); day <= monthEnd; day.setDate(day.getDate() + 1)) {
        if (day >= this.minDate && day <= this.viewMaxDate) {
          foundSelectable = true;
          firstSelectableMonth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
          break;
        }
      }
      if (foundSelectable) break;
    }

    // Start one month before the first selectable month to show context
    this.currentViewStart = new Date(firstSelectableMonth);
    this.currentViewStart.setMonth(this.currentViewStart.getMonth() - 1);
    
    // Ensure we don't go before viewMinDate
    if (this.currentViewStart < this.viewMinDate) {
      this.currentViewStart = new Date(this.viewMinDate.getFullYear(), this.viewMinDate.getMonth(), 1);
    }
    
    this.monthsToShow = 3;
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // Fetch roster deadline for a specific date
  async fetchRosterDeadline(dateStr) {
    try {
      // Check cache first
      if (this.rosterDeadlines.has(dateStr)) {
        return this.rosterDeadlines.get(dateStr);
      }

      const response = await fetch(`/api/admin/roster-deadline/${dateStr}`);
      const result = await response.json();

      if (result.success && result.data) {
        this.rosterDeadlines.set(dateStr, result.data);
        return result.data;
      }

      // No roster schedule found for this date
      return null;
    } catch (error) {
      logger.error(`Error fetching deadline for ${dateStr}:`, error);
      return null;
    }
  }

  // Check if a date is available for requests based on roster deadlines
  async isDateAvailableForRoster(date) {
    const dateStr = this.formatDate(date);
    const deadline = await this.fetchRosterDeadline(dateStr);
    
    if (!deadline) {
      // Fall back to traditional advance days logic
      return this.isDateAvailable(date);
    }

    // Check if today is before the request deadline
    const today = new Date().toISOString().split('T')[0];
    return today <= deadline.deadline;
  }

  getMonthsToDisplay() {
    const months = [];
    const current = new Date(this.currentViewStart);

    for (let i = 0; i < this.monthsToShow; i++) {
      months.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  canNavigatePrevious() {
    const previousMonth = new Date(this.currentViewStart);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    const viewMinMonth = new Date(
      this.viewMinDate.getFullYear(),
      this.viewMinDate.getMonth(),
      1
    );
    return previousMonth >= viewMinMonth;
  }

  canNavigateNext() {
    const lastDisplayedMonth = new Date(this.currentViewStart);
    lastDisplayedMonth.setMonth(
      lastDisplayedMonth.getMonth() + this.monthsToShow - 1
    );
    const viewMaxMonth = new Date(
      this.viewMaxDate.getFullYear(),
      this.viewMaxDate.getMonth(),
      1
    );
    return lastDisplayedMonth < viewMaxMonth;
  }

  async navigatePrevious() {
    if (this.canNavigatePrevious()) {
      this.currentViewStart.setMonth(this.currentViewStart.getMonth() - 1);
      await this.generateCalendar();
      this.updateNavigationButtons();
    }
  }

  async navigateNext() {
    if (this.canNavigateNext()) {
      this.currentViewStart.setMonth(this.currentViewStart.getMonth() + 1);
      await this.generateCalendar();
      this.updateNavigationButtons();
    }
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const currentDisplay = document.getElementById('currentMonthDisplay');

    if (prevBtn) {prevBtn.disabled = !this.canNavigatePrevious();}
    if (nextBtn) {nextBtn.disabled = !this.canNavigateNext();}

    // Update current month display
    const months = this.getMonthsToDisplay();
    const startMonth = months[0].toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    const endMonth = months[months.length - 1].toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    if (currentDisplay) {
      currentDisplay.textContent = `${startMonth} - ${endMonth}`;
    }
  }

  isDateAvailable(date) {
    return date >= this.minDate && date <= this.maxDate;
  }

  isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  formatDate(date) {
    // DST-safe date formatting
    const utcDate = new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    return utcDate.toISOString().split('T')[0];
  }

  async generateCalendar() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) {
      logger.error('Calendar container not found');
      return;
    }

    calendarGrid.innerHTML = '';

    const months = this.getMonthsToDisplay();

    // Create all month containers asynchronously
    const monthPromises = months.map(monthStart => 
      this.createMonthContainer(monthStart)
    );

    try {
      const monthContainers = await Promise.all(monthPromises);
      monthContainers.forEach(monthContainer => 
        calendarGrid.appendChild(monthContainer)
      );
    } catch (error) {
      logger.error('Error generating calendar:', error);
    }

    this.updateNavigationButtons();
    this.updateDateSelection();
  }

  async createMonthContainer(monthStart) {
    const monthContainer = document.createElement('div');
    monthContainer.className = 'month-container';

    // Month header
    const monthHeader = document.createElement('div');
    monthHeader.className = 'month-header';
    monthHeader.textContent = monthStart.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    // Weekday headers
    const weekdayHeader = document.createElement('div');
    weekdayHeader.className = 'weekday-header';
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.className = 'weekday';
      dayElement.textContent = day;
      weekdayHeader.appendChild(dayElement);
    });

    // Days grid
    const daysGrid = document.createElement('div');
    daysGrid.className = 'days-grid';

    const firstDay = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      1
    );
    const startDate = new Date(firstDay);
    let dayOfWeek = firstDay.getDay();
    dayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(startDate.getDate() - dayOfWeek);

    // Create all day cells asynchronously
    const dayCellPromises = [];
    for (let i = 0; i < 42; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const isCurrentMonth = currentDate.getMonth() === monthStart.getMonth();
      dayCellPromises.push(
        this.createDayCell(currentDate, monthStart, isCurrentMonth)
      );
    }

    // Wait for all day cells to be created
    const dayCells = await Promise.all(dayCellPromises);
    dayCells.forEach(dayCell => daysGrid.appendChild(dayCell));

    monthContainer.appendChild(monthHeader);
    monthContainer.appendChild(weekdayHeader);
    monthContainer.appendChild(daysGrid);

    return monthContainer;
  }

  async createDayCell(date, monthStart, shouldShowDate) {
    const dayCell = document.createElement('div');
    dayCell.className = 'day-cell';
    dayCell.dataset.date = this.formatDate(date);

    if (!shouldShowDate) {
      dayCell.style.visibility = 'hidden';
      dayCell.style.pointerEvents = 'none';
      return dayCell;
    }

    // Day number
    const dayNumber = document.createElement('div');
    dayNumber.className = 'day-number';
    dayNumber.textContent = date.getDate();

    // Determine cell state
    const isCurrentMonth = date.getMonth() === monthStart.getMonth();
    const isAvailable = await this.isDateAvailableForRoster(date);
    const isWeekend = this.isWeekend(date);

    if (!isCurrentMonth) {
      dayCell.classList.add('other-month');
    }

    if (isWeekend) {
      dayCell.classList.add('weekend');
    }

    if (!isAvailable) {
      dayCell.classList.add('unavailable');
      // Add deadline information if available
      const dateStr = this.formatDate(date);
      const deadline = await this.fetchRosterDeadline(dateStr);
      if (deadline) {
        dayCell.setAttribute('data-bs-toggle', 'tooltip');
        dayCell.setAttribute('data-bs-placement', 'top');
        dayCell.setAttribute('title', 
          `Request deadline: ${new Date(deadline.deadline).toLocaleDateString()}`);
      }
    } else {
      dayCell.addEventListener('click', async () => await this.handleDateClick(date));
    }

    // Check for existing requests
    const existingRequest = this.getExistingRequest(date);
    if (existingRequest) {
      const requestElement = document.createElement('div');
      requestElement.className = `day-request request-${existingRequest.status.toLowerCase()}`;

      // Create request content container
      const requestContent = document.createElement('div');
      requestContent.className = 'request-content';

      // Create request type span
      const requestType = document.createElement('span');
      requestType.className = 'request-type';
      requestType.textContent = CONFIG.REQUEST_TYPES[existingRequest.type];

      // Email status icon
      const emailStatusIcon = document.createElement('span');
      emailStatusIcon.className = 'email-status-icon';

      const emailStatus = this.getSimpleEmailStatus(existingRequest);
      emailStatusIcon.textContent = emailStatus.icon;
      emailStatusIcon.setAttribute('title', emailStatus.title);

      // Append elements
      requestContent.appendChild(requestType);
      requestContent.appendChild(emailStatusIcon);
      requestElement.appendChild(requestContent);

      // Tooltip
      dayCell.setAttribute('data-bs-toggle', 'tooltip');
      dayCell.setAttribute('data-bs-placement', 'top');
      dayCell.setAttribute(
        'title',
        `${this.formatDate(date)}: ${existingRequest.type} (${existingRequest.status}) - ${emailStatus.title}${
          existingRequest.customMessage
            ? ' - ' + existingRequest.customMessage
            : ''
        }`
      );

      dayCell.appendChild(requestElement);
    }

    dayCell.appendChild(dayNumber);
    return dayCell;
  }

  getSimpleEmailStatus(request) {
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

  getExistingRequest(date) {
    const dateStr = this.formatDate(date);
    return window.existingRequests.find(
      request => request.startDate === dateStr || request.endDate === dateStr
    );
  }

  async handleDateClick(date) {
    const isAvailable = await this.isDateAvailableForRoster(date);
    if (!isAvailable) {return;}

    const dateStr = this.formatDate(date);
    const existingRequest = this.getExistingRequest(date);

    if (existingRequest) {
      // Show request detail modal
      window.showRequestDetailModal(existingRequest, dateStr);
      return;
    }

    // Regular date selection logic...
    const index = window.selectedDates.findIndex(d => d.date === dateStr);

    if (index > -1) {
      // Deselecting - check if remaining dates stay consecutive
      const tempSelection = [...window.selectedDates];
      tempSelection.splice(index, 1);

      if (
        tempSelection.length > 1 &&
        !validateConsecutiveDates(tempSelection.map(d => d.date))
      ) {
        window.showToast(
          'Removing this date would break consecutive selection. Starting fresh.',
          'warning'
        );
        window.selectedDates = [];
      } else {
        window.selectedDates.splice(index, 1);
      }
    } else {
      // Selecting new date
      if (window.selectedDates.length === 0) {
        window.selectedDates.push({ date: dateStr, type: 'REQ_DO' });
      } else {
        if (this.isConsecutiveToSelection(dateStr)) {
          if (window.selectedDates.length >= CONFIG.MAX_DAYS_PER_REQUEST) {
            window.showToast(
              `Maximum ${CONFIG.MAX_DAYS_PER_REQUEST} consecutive days allowed`,
              'warning'
            );
            return;
          }
          window.selectedDates.push({ date: dateStr, type: 'REQ_DO' });
        } else {
          window.selectedDates = [{ date: dateStr, type: 'REQ_DO' }];
          window.showToast('Started new selection', 'info');
        }
      }
    }

    window.selectedDates.sort((a, b) => new Date(a.date) - new Date(b.date));

    setTimeout(() => {
      this.updateDateSelection();
      this.updateFloatingButton();
    }, 10);
  }

  // DST-safe consecutive check
  isConsecutiveToSelection(newDateStr) {
    if (window.selectedDates.length === 0) {return true;}

    const selectedDateStrings = window.selectedDates.map(d => d.date).sort();
    const allDates = [...selectedDateStrings, newDateStr].sort();

    for (let i = 1; i < allDates.length; i++) {
      const prevDate = allDates[i - 1];
      const currentDate = allDates[i];
      const expectedNext = addDays(prevDate, 1);
      if (currentDate !== expectedNext) {
        return false;
      }
    }

    return true;
  }

  updateDateSelection() {
    const allSelected = document.querySelectorAll('.day-cell.selected');
    allSelected.forEach(cell => cell.classList.remove('selected'));

    window.selectedDates.forEach(({ date }) => {
      const cells = document.querySelectorAll(`[data-date="${date}"]`);
      cells.forEach(cell => {
        if (cell.style.visibility !== 'hidden') {
          cell.classList.add('selected');
        }
      });
    });
  }

  updateFloatingButton() {
    const button = document.getElementById('createRequestBtn');
    const buttonText = document.getElementById('requestBtnText');

    if (window.selectedDates.length > 0) {
      button.classList.add('show');
      if (buttonText) {
        buttonText.textContent = `Create Request (${window.selectedDates.length} day${window.selectedDates.length > 1 ? 's' : ''})`;
      }
    } else {
      button.classList.remove('show');
      if (buttonText) {
        buttonText.textContent = 'New Request';
      }
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'APPROVED':
        return 'success';
      case 'DENIED':
        return 'danger';
      default:
        return 'warning';
    }
  }
}

// Initialize calendar
const calendar = new CalendarManager();

// Make global for other modules
window.calendar = calendar;
window.CONFIG = CONFIG;
window.validateConsecutiveDates = validateConsecutiveDates;
window.addDays = addDays;
