const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    message: 'Authentication endpoints',
    available: ['/auth/google', '/auth/google/callback'],
  });
});

module.exports = router;
