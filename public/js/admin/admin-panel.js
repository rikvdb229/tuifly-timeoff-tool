// public/js/admin/admin-panel.js
class AdminPanel {
    constructor() {
        this.init();
    }

    async init() {
        logger.info('Admin panel initializing');
        
        // Load initial data
        await this.loadUsers();
        await this.loadPendingApprovals();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup tab change handlers
        this.setupTabHandlers();
        
        logger.info('Admin panel initialized');
    }

    setupEventListeners() {
        // Refresh buttons
        document.getElementById('refreshUsersBtn')?.addEventListener('click', () => {
            this.loadUsers();
        });

        document.getElementById('refreshPendingBtn')?.addEventListener('click', () => {
            this.loadPendingApprovals();
        });

        // System settings form
        document.getElementById('systemSettingsForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveSystemSettings();
        });

        // Roster creation
        document.getElementById('saveRosterBtn')?.addEventListener('click', () => {
            this.saveRosterSchedule();
        });
    }

    setupTabHandlers() {
        // Load roster data when roster tab is activated
        document.getElementById('roster-tab')?.addEventListener('shown.bs.tab', () => {
            this.loadRosterSchedules();
        });

        // Load system settings when settings tab is activated  
        document.getElementById('settings-tab')?.addEventListener('shown.bs.tab', () => {
            this.loadSystemSettings();
        });

        // Load users and pending approvals when users tab is activated (it's the default active tab)
        document.getElementById('users-tab')?.addEventListener('shown.bs.tab', () => {
            this.loadUsers();
            this.loadPendingApprovals();
        });
    }

    async loadUsers() {
        try {
            const response = await fetch('/admin/api/users');
            const result = await response.json();

            if (result.success) {
                this.renderUsersTable(result.data);
            } else {
                throw new Error(result.error || 'Failed to load users');
            }
        } catch (error) {
            logger.error('Error loading users:', error);
            document.getElementById('usersTableContainer').innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Error loading users: ${error.message}
                </div>
            `;
        }
    }

    async loadPendingApprovals() {
        try {
            const response = await fetch('/admin/api/pending-approvals');
            const result = await response.json();

            const pendingSection = document.getElementById('pendingApprovalsSection');
            
            if (result.success && result.data.length > 0) {
                this.renderPendingApprovals(result.data);
                pendingSection.style.display = 'block';
            } else {
                pendingSection.style.display = 'none';
            }
        } catch (error) {
            logger.error('Error loading pending approvals:', error);
            document.getElementById('pendingApprovalsSection').style.display = 'none';
        }
    }

    renderPendingApprovals(pendingUsers) {
        const containerElement = document.getElementById('pendingApprovalsContainer');
        
        if (pendingUsers.length === 0) {
            containerElement.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-check-circle text-success" style="font-size: 3rem;"></i>
                    <h5 class="mt-3 text-muted">No Pending Approvals</h5>
                    <p class="text-muted">All users have been processed.</p>
                </div>
            `;
            return;
        }

        const pendingHtml = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Code</th>
                            <th>Registered</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendingUsers.map(user => `
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        ${user.profilePicture ? 
                                            `<img src="${user.profilePicture}" class="rounded-circle me-2" width="32" height="32" alt="Avatar">` :
                                            `<div class="rounded-circle bg-warning text-dark d-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; font-size: 14px;">${user.name.charAt(0).toUpperCase()}</div>`
                                        }
                                        <div class="fw-medium">${user.name}</div>
                                    </div>
                                </td>
                                <td>${user.email}</td>
                                <td><span class="badge bg-light text-dark">${user.code || '-'}</span></td>
                                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <button class="btn btn-success" onclick="adminPanel.approveUser(${user.id})" title="Approve User">
                                            <i class="bi bi-check-lg"></i> Approve
                                        </button>
                                        <button class="btn btn-outline-danger" onclick="adminPanel.deleteUser(${user.id}, '${user.name}')" title="Reject User">
                                            <i class="bi bi-x-lg"></i> Reject
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        containerElement.innerHTML = pendingHtml;
    }

    renderUsersTable(users) {
        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Code</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${users.map(user => this.renderUserRow(user)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('usersTableContainer').innerHTML = tableHtml;
    }

    renderUserRow(user) {
        const roleLabel = user.role === 'superadmin' ? 'Super Admin' : (user.role === 'admin' ? 'Admin' : 'User');
        const roleBadge = user.role === 'superadmin' ? 'danger' : (user.role === 'admin' ? 'warning' : 'secondary');
        const statusLabel = user.adminApproved ? 'Active' : 'Pending';
        const statusBadge = user.adminApproved ? 'success' : 'warning';

        return `
            <tr>
                <td>
                    <div class="d-flex align-items-center">
                        ${user.profilePicture ? 
                            `<img src="${user.profilePicture}" class="rounded-circle me-2" width="32" height="32" alt="Avatar">` :
                            `<div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2" style="width: 32px; height: 32px; font-size: 14px;">${user.name.charAt(0).toUpperCase()}</div>`
                        }
                        <div class="fw-medium">${user.name}</div>
                    </div>
                </td>
                <td>${user.email}</td>
                <td><span class="badge bg-light text-dark">${user.code || '-'}</span></td>
                <td><span class="badge bg-${roleBadge}">${roleLabel}</span></td>
                <td><span class="badge bg-${statusBadge}">${statusLabel}</span></td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        ${!user.adminApproved ? `
                            <button class="btn btn-success" onclick="adminPanel.approveUser(${user.id})" title="Approve User">
                                <i class="bi bi-check-lg"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-outline-primary" onclick="adminPanel.editUserRole(${user.id}, '${user.name}', '${roleLabel}')" title="Edit Role">
                            <i class="bi bi-person-gear"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="adminPanel.deleteUser(${user.id}, '${user.name}')" title="Delete User">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    async approveUser(userId) {
        try {
            const response = await fetch(`/admin/api/users/${userId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (result.success) {
                logger.info('User approved successfully');
                // Refresh both pending approvals and users tables
                await this.loadPendingApprovals();
                await this.loadUsers();
            } else {
                throw new Error(result.error || 'Failed to approve user');
            }
        } catch (error) {
            logger.error('Error approving user:', error);
            alert('Error approving user: ' + error.message);
        }
    }

    editUserRole(userId, userName, currentRole) {
        const modal = new bootstrap.Modal(document.getElementById('userActionModal'));
        
        document.getElementById('userActionModalTitle').textContent = `Edit Role - ${userName}`;
        document.getElementById('userActionModalBody').innerHTML = `
            <p>Current role: <span class="badge bg-secondary">${currentRole}</span></p>
            <div class="mb-3">
                <label class="form-label">New Role:</label>
                <select class="form-select" id="newUserRole">
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                </select>
            </div>
            <div class="alert alert-info">
                <small>
                    <strong>User:</strong> Basic access to create requests<br>
                    <strong>Admin:</strong> Can approve users<br>
                    <strong>Super Admin:</strong> Can approve users, manage rosters, and change system settings
                </small>
            </div>
        `;
        
        document.getElementById('userActionModalFooter').innerHTML = `
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" onclick="adminPanel.updateUserRole(${userId})">Update Role</button>
        `;

        modal.show();
    }

    async updateUserRole(userId) {
        try {
            const newRole = document.getElementById('newUserRole').value;
            
            const response = await fetch(`/admin/api/users/${userId}/role`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: newRole })
            });

            const result = await response.json();
            if (result.success) {
                logger.info('User role updated successfully');
                bootstrap.Modal.getInstance(document.getElementById('userActionModal')).hide();
                await this.loadUsers();
            } else {
                throw new Error(result.error || 'Failed to update user role');
            }
        } catch (error) {
            logger.error('Error updating user role:', error);
            alert('Error updating user role: ' + error.message);
        }
    }

    async deleteUser(userId, userName) {
        if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/admin/api/users/${userId}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            if (result.success) {
                logger.info('User deleted successfully');
                await this.loadPendingApprovals();
                await this.loadUsers();
            } else {
                throw new Error(result.error || 'Failed to delete user');
            }
        } catch (error) {
            logger.error('Error deleting user:', error);
            alert('Error deleting user: ' + error.message);
        }
    }

    async loadRosterSchedules() {
        try {
            const response = await fetch('/admin/api/rosters');
            const result = await response.json();

            if (result.success) {
                this.renderRosterTable(result.data);
            } else {
                throw new Error(result.error || 'Failed to load roster schedules');
            }
        } catch (error) {
            logger.error('Error loading roster schedules:', error);
            document.getElementById('rosterTableContainer').innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Error loading roster schedules: ${error.message}
                </div>
            `;
        }
    }

    renderRosterTable(schedules) {
        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead class="table-light">
                        <tr>
                            <th>Period</th>
                            <th>Publication Date</th>
                            <th>Request Deadline</th>
                            <th>Status</th>
                            <th>Description</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${schedules.map(schedule => this.renderRosterRow(schedule)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        document.getElementById('rosterTableContainer').innerHTML = tableHtml;
    }

    renderRosterRow(schedule) {
        const statusBadge = schedule.isActive ? 'success' : 'secondary';
        const statusText = schedule.isActive ? 'Active' : 'Inactive';
        
        const deadlineBadge = schedule.deadlineStatus === 'passed' ? 'danger' : 'success';
        const deadlineText = schedule.deadlineStatus === 'passed' ? 'Deadline Passed' : 'Upcoming';

        return `
            <tr>
                <td>
                    <div class="fw-medium">${new Date(schedule.startPeriod).toLocaleDateString()} - ${new Date(schedule.endPeriod).toLocaleDateString()}</div>
                </td>
                <td>${new Date(schedule.publicationDate).toLocaleDateString()}</td>
                <td>
                    ${new Date(schedule.latestRequestDate).toLocaleDateString()}
                    <br><span class="badge bg-${deadlineBadge} mt-1">${deadlineText}</span>
                </td>
                <td><span class="badge bg-${statusBadge}">${statusText}</span></td>
                <td>${schedule.description || '-'}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="adminPanel.editRosterSchedule(${schedule.id})" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="adminPanel.deleteRosterSchedule(${schedule.id})" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }

    async loadSystemSettings() {
        try {
            const response = await fetch('/admin/api/settings');
            const result = await response.json();

            if (result.success) {
                const settings = result.data;
                
                // Calendar & Booking Rules
                document.getElementById('calendarBookingWindowMonths').value = settings.calendarBookingWindowMonths || 6;
                document.getElementById('minAdvanceDays').value = settings.minAdvanceDays || 60;
                document.getElementById('maxDaysPerRequest').value = settings.maxDaysPerRequest || 4;
                
                // Email Configuration
                document.getElementById('approverEmail').value = settings.approverEmail || '';
                document.getElementById('adminNotificationEmail').value = settings.adminNotificationEmail || '';
                
                // Email Labels
                document.getElementById('emailReqDoLabel').value = settings.emailReqDoLabel || 'REQ DO';
                document.getElementById('emailAmOffLabel').value = settings.emailAmOffLabel || 'AM OFF';
                document.getElementById('emailPmOffLabel').value = settings.emailPmOffLabel || 'PM OFF';
            }
        } catch (error) {
            logger.error('Error loading system settings:', error);
        }
    }

    async saveSystemSettings() {
        try {
            const settings = {
                // Calendar & Booking Rules
                calendarBookingWindowMonths: parseInt(document.getElementById('calendarBookingWindowMonths').value),
                minAdvanceDays: parseInt(document.getElementById('minAdvanceDays').value),
                maxDaysPerRequest: parseInt(document.getElementById('maxDaysPerRequest').value),
                
                // Email Configuration
                approverEmail: document.getElementById('approverEmail').value,
                adminNotificationEmail: document.getElementById('adminNotificationEmail').value,
                
                // Email Labels
                emailReqDoLabel: document.getElementById('emailReqDoLabel').value,
                emailAmOffLabel: document.getElementById('emailAmOffLabel').value,
                emailPmOffLabel: document.getElementById('emailPmOffLabel').value
            };

            const response = await fetch('/admin/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });

            const result = await response.json();
            if (result.success) {
                logger.info('System settings saved successfully');
                alert('Settings saved successfully!');
            } else {
                throw new Error(result.error || 'Failed to save settings');
            }
        } catch (error) {
            logger.error('Error saving system settings:', error);
            alert('Error saving settings: ' + error.message);
        }
    }

    // Roster management methods
    async editRosterSchedule(rosterId) {
        logger.info('Edit roster schedule:', rosterId);
        // TODO: Implement edit roster modal
        alert('Edit roster functionality coming soon!');
    }

    async deleteRosterSchedule(rosterId) {
        if (!confirm('Are you sure you want to delete this roster schedule? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await fetch(`/admin/api/rosters/${rosterId}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            if (result.success) {
                logger.info('Roster schedule deleted successfully');
                await this.loadRosterSchedules();
            } else {
                throw new Error(result.error || 'Failed to delete roster schedule');
            }
        } catch (error) {
            logger.error('Error deleting roster schedule:', error);
            alert('Error deleting roster schedule: ' + error.message);
        }
    }

    createNewRosterSchedule() {
        logger.info('Create new roster schedule');
        const modal = new bootstrap.Modal(document.getElementById('createRosterModal'));
        modal.show();
    }

    async saveRosterSchedule() {
        try {
            const form = document.getElementById('createRosterForm');
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }

            const rosterData = {
                publicationDate: document.getElementById('publicationDate').value,
                latestRequestDate: document.getElementById('latestRequestDate').value,
                startPeriod: document.getElementById('startPeriod').value,
                endPeriod: document.getElementById('endPeriod').value,
                description: document.getElementById('description').value,
                isActive: document.getElementById('isActive').checked
            };

            const response = await fetch('/admin/api/rosters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(rosterData)
            });

            const result = await response.json();
            if (result.success) {
                logger.info('Roster schedule created successfully');
                bootstrap.Modal.getInstance(document.getElementById('createRosterModal')).hide();
                form.reset();
                await this.loadRosterSchedules();
            } else {
                throw new Error(result.error || 'Failed to create roster schedule');
            }
        } catch (error) {
            logger.error('Error creating roster schedule:', error);
            alert('Error creating roster schedule: ' + error.message);
        }
    }
}

// Global function for creating new roster (called from template)
function createNewRosterSchedule() {
    if (window.adminPanel) {
        window.adminPanel.createNewRosterSchedule();
    }
}

// Initialize admin panel when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.adminPanel = new AdminPanel();
});