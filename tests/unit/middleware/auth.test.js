// tests/unit/middleware/auth.test.js - Unit tests for authentication middleware

// Mock dependencies first before importing
jest.mock('../../../src/models', () => ({
  User: {
    findByPk: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  middlewareLogger: {
    logError: jest.fn(),
  },
}));

const {
  requireAuth,
  requireOnboarding,
  requireGuest,
  authRateLimit,
  loadUser,
  updateLastLogin,
} = require('../../../src/middleware/auth');
const { User } = require('../../../src/models');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      session: {},
      xhr: false,
      headers: {},
      originalUrl: '/test',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
      locals: {},
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('requireAuth', () => {
    it('should call next() when user is authenticated', () => {
      req.session.userId = 'user123';

      requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should redirect to login when no session', () => {
      req.session = null;

      requireAuth(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to login when no userId in session', () => {
      req.session = {};

      requireAuth(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return JSON error for AJAX requests', () => {
      req.session = null;
      req.xhr = true;

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
        redirect: '/auth/login',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return JSON error for JSON requests', () => {
      req.session = null;
      req.headers.accept = 'application/json';

      requireAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required',
        redirect: '/auth/login',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireOnboarding', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        isOnboarded: jest.fn().mockReturnValue(true),
        canUseApp: jest.fn().mockReturnValue(true),
      };
      User.findByPk = jest.fn().mockResolvedValue(mockUser);
    });

    it('should redirect to login when no session', async () => {
      req.session = null;

      await requireOnboarding(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to login when no userId', async () => {
      req.session = {};

      await requireOnboarding(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });

    it('should destroy session and redirect when user not found', async () => {
      req.session = { userId: 'user123', destroy: jest.fn() };
      User.findByPk.mockResolvedValue(null);

      await requireOnboarding(req, res, next);

      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith('/auth/login');
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to onboarding when user not onboarded', async () => {
      req.session = { userId: 'user123' };
      mockUser.isOnboarded.mockReturnValue(false);

      await requireOnboarding(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/onboarding');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return JSON error for AJAX when not onboarded', async () => {
      req.session = { userId: 'user123' };
      req.xhr = true;
      mockUser.isOnboarded.mockReturnValue(false);

      await requireOnboarding(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Onboarding required',
        redirect: '/onboarding',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should redirect to waiting approval when user cannot use app', async () => {
      req.session = { userId: 'user123' };
      mockUser.canUseApp.mockReturnValue(false);

      await requireOnboarding(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/auth/waiting-approval');
      expect(next).not.toHaveBeenCalled();
    });

    it('should return JSON error for AJAX when approval needed', async () => {
      req.session = { userId: 'user123' };
      req.xhr = true;
      mockUser.canUseApp.mockReturnValue(false);

      await requireOnboarding(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Admin approval required',
        message: 'Your account is pending admin approval',
        needsApproval: true,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should attach user to request and call next when all checks pass', async () => {
      req.session = { userId: 'user123' };

      await requireOnboarding(req, res, next);

      expect(req.user).toBe(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      req.session = { userId: 'user123' };
      const error = new Error('Database error');
      User.findByPk.mockRejectedValue(error);

      await requireOnboarding(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireGuest', () => {
    it('should call next() when user is not authenticated', () => {
      req.session = null;

      requireGuest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should call next() when session exists but no userId', () => {
      req.session = {};

      requireGuest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });

    it('should redirect to home when user is authenticated', () => {
      req.session = { userId: 'user123' };

      requireGuest(req, res, next);

      expect(res.redirect).toHaveBeenCalledWith('/');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('loadUser', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        toSafeObject: jest.fn().mockReturnValue({ id: 'user123', name: 'Test User' }),
      };
      User.findByPk = jest.fn().mockResolvedValue(mockUser);
    });

    it('should load user when session exists', async () => {
      req.session = { userId: 'user123' };

      await loadUser(req, res, next);

      expect(User.findByPk).toHaveBeenCalledWith('user123');
      expect(req.user).toBe(mockUser);
      expect(res.locals.user).toEqual({ id: 'user123', name: 'Test User' });
      expect(res.locals.isAuthenticated).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    it('should not load user when no session', async () => {
      req.session = null;

      await loadUser(req, res, next);

      expect(User.findByPk).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(res.locals.isAuthenticated).toBe(false);
      expect(res.locals.user).toBe(null);
      expect(next).toHaveBeenCalled();
    });

    it('should not load user when no userId in session', async () => {
      req.session = {};

      await loadUser(req, res, next);

      expect(User.findByPk).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(res.locals.isAuthenticated).toBe(false);
      expect(res.locals.user).toBe(null);
      expect(next).toHaveBeenCalled();
    });

    it('should handle user not found in database', async () => {
      req.session = { userId: 'user123' };
      User.findByPk.mockResolvedValue(null);

      await loadUser(req, res, next);

      expect(User.findByPk).toHaveBeenCalledWith('user123');
      expect(req.user).toBeUndefined();
      expect(res.locals.isAuthenticated).toBe(false);
      expect(res.locals.user).toBe(null);
      expect(next).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      req.session = { userId: 'user123' };
      const error = new Error('Database error');
      User.findByPk.mockRejectedValue(error);

      await loadUser(req, res, next);

      expect(res.locals.isAuthenticated).toBe(false);
      expect(res.locals.user).toBe(null);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('updateLastLogin', () => {
    let mockUser;

    beforeEach(() => {
      mockUser = {
        id: 'user123',
        update: jest.fn().mockResolvedValue(true),
      };
    });

    it('should update last login when user exists', async () => {
      req.user = mockUser;

      await updateLastLogin(req, res, next);

      expect(mockUser.update).toHaveBeenCalledWith({
        lastLoginAt: expect.any(Date),
      });
      expect(next).toHaveBeenCalled();
    });

    it('should not update when no user', async () => {
      req.user = null;

      await updateLastLogin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should handle update errors gracefully', async () => {
      req.user = mockUser;
      const error = new Error('Update error');
      mockUser.update.mockRejectedValue(error);

      await updateLastLogin(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('authRateLimit', () => {
    it('should be configured correctly', () => {
      expect(authRateLimit).toBeDefined();
      expect(typeof authRateLimit).toBe('function');
    });

    it('should be a rate limit middleware function', () => {
      // Rate limiter returns a middleware function
      expect(typeof authRateLimit).toBe('function');
      
      // Should behave like a middleware (accept req, res, next)
      expect(authRateLimit.length).toBe(3);
    });
  });
});