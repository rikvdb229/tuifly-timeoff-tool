// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User, createUser } = require('../src/models');

// Configure Google OAuth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI || '/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = await User.findByGoogleId(profile.id);

        if (user) {
          // Update user's profile picture and name if they changed
          const updates = {};

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

          updates.lastLoginAt = new Date();

          if (Object.keys(updates).length > 0) {
            await user.update(updates);
          }

          return done(null, user);
        }

        // Create new user with Google profile name
        const googleName =
          profile.displayName ||
          `${profile.name?.givenName || ''} ${profile.name?.familyName || ''}`.trim();

        const userData = {
          googleId: profile.id,
          email: profile.emails[0].value,
          name: googleName || null, // Store the Google profile name
          profilePicture: profile.photos[0]?.value || null,
          lastLoginAt: new Date(),
        };

        user = await createUser(userData);

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
