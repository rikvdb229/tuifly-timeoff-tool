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
    this.isInitialized = false; // Track initialization state
    
    // For roster-based system, we use a wide range and let roster deadlines control availability
    this.minDate = new Date(this.today); // Allow checking from today
    this.maxDate = this.addDays(this.today, CONFIG.MAX_ADVANCE_DAYS); // 6 months ahead

    // Allow viewing past requests - start from 6 months before today
    this.viewMinDate = this.addDays(this.today, -180);
    // Allow viewing 6 months in advance from today
    this.viewMaxDate = this.addDays(this.today, CONFIG.MAX_ADVANCE_DAYS);

    // Default to current month - will be updated in initialize()
    this.currentViewStart = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    this.monthsToShow = 3;
  }

  async initialize() {
    // Find the first month with selectable days
    let firstSelectableMonth = await this.findFirstSelectableMonth();

    // Find the first selectable day in that month
    const firstSelectableDay = await this.findFirstSelectableDay(firstSelectableMonth);
    
    // Update maxDate to be first selectable day + 6 months (approximately 180 days)
    this.maxDate = this.addDays(firstSelectableDay, 180);

    // Start WITH the first selectable month (it will be the leftmost/first displayed)  
    this.currentViewStart = new Date(firstSelectableMonth);
    
    // Ensure we don't go before viewMinDate
    if (this.currentViewStart < this.viewMinDate) {
      this.currentViewStart = new Date(this.viewMinDate.getFullYear(), this.viewMinDate.getMonth(), 1);
    }
    
    // Adjust viewMaxDate to allow 6 months of navigation from the first selectable day
    this.viewMaxDate = this.addDays(firstSelectableDay, 180);
    
    // Generate the initial calendar
    await this.generateCalendar();
    
    // Mark as initialized to prevent duplicate generations
    this.isInitialized = true;
  }

  addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // Find the first month that has any selectable days
  async findFirstSelectableMonth() {
    // Start from current month and check up to 12 months ahead
    const currentMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    
    for (let i = 0; i < 12; i++) {
      const monthToCheck = new Date(currentMonth);
      monthToCheck.setMonth(currentMonth.getMonth() + i);
      
      // Check if this month has any selectable days
      const hasSelectableDays = await this.monthHasSelectableDays(monthToCheck);
      if (hasSelectableDays) {
        logger.debug('Found first selectable month:', monthToCheck.toDateString().substring(4, 7), monthToCheck.getFullYear());
        return monthToCheck;
      }
    }
    
    // Fallback to current month if no selectable days found
    logger.debug('No selectable days found, using current month');
    return currentMonth;
  }

  // Find the first selectable day in a given month
  async findFirstSelectableDay(monthStart) {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const dayToCheck = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      
      // Check if this day is available for selection
      if (await this.isDateAvailable(dayToCheck)) {
        logger.debug('Found first selectable day:', this.formatDate(dayToCheck));
        return dayToCheck;
      }
    }
    
    // Fallback to first day of month if no selectable days found
    logger.debug('No selectable days found in month, using first day');
    return new Date(monthStart.getFullYear(), monthStart.getMonth(), 1);
  }

  // Check if a month has any selectable days
  async monthHasSelectableDays(monthStart) {
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    
    // Check all days in the month to ensure we don't miss selectable days
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      const dateToCheck = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const isAvailable = await this.isDateAvailableForRoster(dateToCheck);
      if (isAvailable) {
        return true;
      }
    }
    
    return false;
  }

  // Check if a date is available for requests based on roster deadlines (using cached data)
  async isDateAvailableForRoster(date) {
    const dateStr = this.formatDate(date);
    const today = new Date().toISOString().split('T')[0];
    
    // Quick check: if date is in the past, it's not available
    if (dateStr < today) {
      return false;
    }
    
    // Check minimum advance days requirement
    const todayDate = new Date(today);
    const requestDate = new Date(dateStr);
    const daysDifference = Math.floor((requestDate - todayDate) / (1000 * 60 * 60 * 24));
    
    if (daysDifference < CONFIG.MIN_ADVANCE_DAYS) {
      return false;
    }
    
    // Check cache first
    if (this.rosterDeadlines.has(dateStr)) {
      const schedule = this.rosterDeadlines.get(dateStr);
      return today <= schedule.deadline;
    }
    
    // Fetch from existing working API
    try {
      const response = await fetch(`/api/admin/roster-deadline/${dateStr}`);
      const result = await response.json();

      if (result.success && result.data) {
        // Cache the result
        this.rosterDeadlines.set(dateStr, result.data);
        return today <= result.data.deadline;
      }
      
      return false;
    } catch (error) {
      console.error(`Error fetching deadline for ${dateStr}:`, error);
      return false;
    }
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

    // Create all month containers with caching
    const monthPromises = months.map(monthStart => this.createMonthContainer(monthStart));
    const monthContainers = await Promise.all(monthPromises);
    monthContainers.forEach(monthContainer => calendarGrid.appendChild(monthContainer));

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

    // Create all day cells with caching for efficiency
    const dayCellPromises = [];
    for (let i = 0; i < 42; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const isCurrentMonth = currentDate.getMonth() === monthStart.getMonth();
      dayCellPromises.push(this.createDayCell(currentDate, monthStart, isCurrentMonth));
    }

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
      // Add deadline information if available from cached data
      const dateStr = this.formatDate(date);
      const schedule = this.rosterDeadlines.get(dateStr);
      
      // Always add tooltip for unavailable days
      dayCell.setAttribute('data-bs-toggle', 'tooltip');
      dayCell.setAttribute('data-bs-placement', this.getTooltipPlacement(date));
      
      if (schedule) {
        dayCell.setAttribute('title', 
          `Request deadline: ${new Date(schedule.deadline).toLocaleDateString()}`);
      } else {
        // Default tooltip for unavailable days
        const reason = isWeekend ? 'Weekend' : 'Not available for requests';
        dayCell.setAttribute('title', `${this.formatDate(date)}: ${reason}`);
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
      dayCell.setAttribute('data-bs-placement', this.getTooltipPlacement(date));
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

  /**
   * Get smart tooltip placement based on date position in calendar
   * @param {Date} date - The date to position tooltip for
   * @returns {string} Bootstrap tooltip placement ('top', 'bottom', 'left', 'right')
   */
  getTooltipPlacement(date) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // If date is in current month, use top placement
    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      return 'top';
    }
    
    // For future months, check how far ahead
    const monthsDiff = (date.getFullYear() - currentYear) * 12 + (date.getMonth() - currentMonth);
    
    // For dates more than 2 months in the future, use bottom placement
    // This helps when the calendar shows far future dates at the bottom
    if (monthsDiff > 2) {
      return 'bottom';
    }
    
    // Default to top for near-future dates
    return 'top';
  }
}

// Create calendar instance but don't auto-initialize
const calendar = new CalendarManager();

// Make global for other modules
window.calendar = calendar;
window.CONFIG = CONFIG;
window.validateConsecutiveDates = validateConsecutiveDates;
window.addDays = addDays;
