// src/routes/api/middleware.js - Shared API middleware
const { requireAuth, requireOnboarding } = require('../../middleware/auth');

// Apply common middleware to all API routes
const applyApiMiddleware = router => {
  router.use(requireAuth);
  router.use(requireOnboarding);
};

module.exports = {
  applyApiMiddleware,
};
