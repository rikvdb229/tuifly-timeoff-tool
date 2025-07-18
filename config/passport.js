// config/passport.js - UNIFIED OAUTH VERSION using environment variables
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User, createUser } = require('../src/models');

// Get scopes from environment variable (space-separated)
const getOAuthScopes = () => {
  const scopes = process.env.GOOGLE_SCOPES;
  return scopes ? scopes.split(' ') : ['profile', 'email'];
};

console.log('🔧 OAuth Scopes:', getOAuthScopes());

// Configure Google OAuth strategy with Gmail permissions
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || '/auth/google/callback',
      scope: getOAuthScopes(),
      accessType: 'offline', // Required for refresh tokens
      prompt: 'consent', // Force consent to get refresh token
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('🔍 OAuth tokens received:', {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          userId: profile.id,
          email: profile.emails[0]?.value,
        });

        // Check if user already exists
        let user = await User.findByGoogleId(profile.id);

        if (user) {
          // Update existing user with new tokens and profile info
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

          // 🚀 CRITICAL: Update Gmail tokens from OAuth
          if (accessToken) {
            updates.gmailAccessToken = accessToken;
            updates.gmailScopeGranted = true;
          }

          if (refreshToken) {
            updates.gmailRefreshToken = refreshToken;
          }

          // Calculate token expiry (usually 1 hour from now)
          updates.gmailTokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

          await user.update(updates);

          console.log(`✅ Updated user ${user.email} with Gmail permissions`);
          return done(null, user);
        }

        // Create new user with Google profile AND Gmail permissions
        const googleName =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();

        const userData = {
          googleId: profile.id,
          email: profile.emails[0].value,
          name: googleName || null,
          profilePicture: profile.photos[0]?.value || null,
          lastLoginAt: new Date(),
          // 🚀 NEW: Set Gmail permissions during user creation
          gmailAccessToken: accessToken,
          gmailRefreshToken: refreshToken,
          gmailTokenExpiry: new Date(Date.now() + 3600 * 1000), // 1 hour
          gmailScopeGranted: !!accessToken,
        };

        user = await createUser(userData);

        console.log(`✅ Created new user ${user.email} with Gmail permissions`);
        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error, null);
      }
    }
  )
);

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
