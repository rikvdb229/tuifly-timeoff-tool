// src/services/index.js - Service layer dependency injection
const GmailService = require('./gmailService');
const UserService = require('./userService');
const RequestService = require('./requestService');
const EmailService = require('./emailService');
const StatusService = require('./statusService');
const GroupRequestService = require('./groupRequestService');

/**
 * Create and configure all services with proper dependency injection
 * @returns {Object} Service instances
 */
function createServices() {
  // Create foundational services (no dependencies)
  const gmailService = new GmailService();
  const userService = new UserService();

  // Create dependent services
  const requestService = new RequestService(userService);
  const emailService = new EmailService(gmailService, userService);
  const statusService = new StatusService(requestService, emailService);
  const groupRequestService = new GroupRequestService(
    requestService,
    emailService
  );

  return {
    gmailService,
    userService,
    requestService,
    emailService,
    statusService,
    groupRequestService,
  };
}

/**
 * Service container for managing service instances
 */
class ServiceContainer {
  constructor() {
    this.services = null;
  }

  /**
   * Get all services (singleton pattern)
   * @returns {Object} Service instances
   */
  getServices() {
    if (!this.services) {
      this.services = createServices();
    }
    return this.services;
  }

  /**
   * Get a specific service
   * @param {string} serviceName - Name of the service
   * @returns {Object} Service instance
   */
  getService(serviceName) {
    const services = this.getServices();
    if (!services[serviceName]) {
      throw new Error(`Service '${serviceName}' not found`);
    }
    return services[serviceName];
  }

  /**
   * Reset services (useful for testing)
   */
  reset() {
    this.services = null;
  }
}

// Create global service container instance
const serviceContainer = new ServiceContainer();

module.exports = {
  createServices,
  ServiceContainer,
  serviceContainer,

  // Direct service exports for convenience
  GmailService,
  UserService,
  RequestService,
  EmailService,
  StatusService,
  GroupRequestService,
};
