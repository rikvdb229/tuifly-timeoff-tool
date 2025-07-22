// config/passport.js - SPLIT OAUTH VERSION
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User, createUser } = require('../src/models');

/**
 * Gets basic OAuth scopes for Google authentication (initial login)
 * @returns {string[]} Array of basic OAuth scope strings
 */
const getBasicScopes = () => {
  const scopes = process.env.GOOGLE_SCOPES_BASIC;
  return scopes ? scopes.split(' ') : ['profile', 'email', 'openid'];
};

/**
 * Gets Gmail OAuth scopes for automatic email sending
 * @returns {string[]} Array of Gmail OAuth scope strings including send and read permissions
 */
const getGmailScopes = () => {
  const scopes = process.env.GOOGLE_SCOPES_GMAIL;
  return scopes ? scopes.split(' ') : ['profile', 'email', 'openid', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];
};

console.log('🔧 Basic OAuth Scopes:', getBasicScopes());
console.log('🔧 Gmail OAuth Scopes:', getGmailScopes());

// Strategy 1: Basic Google OAuth (for initial login)
passport.use('google-basic', new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_REDIRECT_URI || '/auth/google/callback',
    scope: getBasicScopes(),
    accessType: 'offline',
    prompt: 'select_account',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Basic OAuth tokens received:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        userId: profile.id,
        email: profile.emails[0]?.value,
      });

      // Check if user already exists
      let user = await User.findByGoogleId(profile.id);

      if (user) {
        // Update existing user with basic info
        const updates = {
          lastLoginAt: new Date(),
        };

        // Update profile picture if changed
        if (user.profilePicture !== profile.photos[0]?.value) {
          updates.profilePicture = profile.photos[0]?.value || null;
        }

        // Update name from Google profile if not set yet
        const googleName =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();
        if (!user.name && googleName) {
          updates.name = googleName;
        }

        await user.update(updates);
        console.log(`✅ Updated existing user ${user.email} (basic login)`);
        return done(null, user);
      }

      // Create new user (WITHOUT Gmail permissions initially)
      const googleName =
        profile.displayName ||
        `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();

      const userData = {
        googleId: profile.id,
        email: profile.emails[0].value,
        name: googleName || null,
        profilePicture: profile.photos[0]?.value || null,
        lastLoginAt: new Date(),
        // NOT setting Gmail tokens yet - user will grant these during onboarding
        gmailScopeGranted: false,
      };

      user = await createUser(userData);
      console.log(`✅ Created new user ${user.email} (basic permissions only)`);
      return done(null, user);
    } catch (error) {
      console.error('Google OAuth (basic) error:', error);
      return done(error, null);
    }
  }
));

// Strategy 2: Gmail Google OAuth (for automatic email users)
passport.use('google-gmail', new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_GMAIL_REDIRECT_URI || '/auth/google/gmail/callback',
    scope: getGmailScopes(),
    accessType: 'offline',
    prompt: 'consent', // Force consent to get Gmail permissions
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔍 Gmail OAuth strategy called:');
      console.log('Profile received:', {
        id: profile.id,
        email: profile.emails[0]?.value,
        name: profile.displayName
      });
      console.log('Tokens received:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken ? accessToken.length : 0
      });

      // Find existing user (should already exist from basic login)
      const user = await User.findByGoogleId(profile.id);
      console.log('User found in database:', user ? user.email : 'NOT FOUND');

      if (!user) {
        console.error('❌ User not found during Gmail OAuth - this should not happen');
        return done(new Error('User not found during Gmail OAuth'), null);
      }

      // Update user with Gmail permissions
      const updates = {
        gmailAccessToken: accessToken,
        gmailRefreshToken: refreshToken,
        gmailTokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
        gmailScopeGranted: true,
        lastLoginAt: new Date(),
      };

      console.log('Updating user with Gmail permissions...');
      const updatedUser = await user.update(updates);
      console.log(`✅ Updated user ${user.email} with Gmail permissions`);
      
      return done(null, updatedUser);
    } catch (error) {
      console.error('Google OAuth (Gmail) error:', error);
      console.error('Error stack:', error.stack);
      return done(error, null);
    }
  }
));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;