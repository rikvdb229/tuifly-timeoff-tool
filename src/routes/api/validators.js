// src/routes/api/validators.js - Shared validation schemas and helpers
const Joi = require('joi');

// Validation schemas
const createRequestSchema = Joi.object({
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).required(),
  type: Joi.string().valid('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT').required(),
  flightNumber: Joi.string().when('type', {
    is: 'FLIGHT',
    then: Joi.string().pattern(/^TB/).required(),
    otherwise: Joi.string().allow(null, ''),
  }),
  customMessage: Joi.string().allow(null, '').max(500),
});

const groupRequestSchema = Joi.object({
  dates: Joi.array()
    .items(
      Joi.object({
        date: Joi.date().iso().required(),
        type: Joi.string()
          .valid('REQ_DO', 'PM_OFF', 'AM_OFF', 'FLIGHT')
          .required(),
        flightNumber: Joi.string().when('type', {
          is: 'FLIGHT',
          then: Joi.string().pattern(/^TB/).required(),
          otherwise: Joi.string().allow(null, ''),
        }),
      })
    )
    .min(1)
    .max(parseInt(process.env.MAX_DAYS_PER_REQUEST) || 4)
    .required(),
  customMessage: Joi.string().allow(null, '').max(500),
});

// Helper function to validate consecutive dates
function validateConsecutiveDates(dates) {
  if (dates.length <= 1) {return true;}

  const sortedDates = dates.map(d => new Date(d.date)).sort((a, b) => a - b);

  for (let i = 1; i < sortedDates.length; i++) {
    const prevDate = sortedDates[i - 1];
    const currentDate = sortedDates[i];
    const dayDiff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);

    if (dayDiff !== 1) {
      return false;
    }
  }

  return true;
}

module.exports = {
  createRequestSchema,
  groupRequestSchema,
  validateConsecutiveDates,
};
