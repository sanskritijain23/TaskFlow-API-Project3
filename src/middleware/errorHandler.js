'use strict';

const isDevelopment = () => !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

/**
 * Central error handler.
 *
 * - Application errors we throw ourselves (validation failures, 404s, the
 *   status/completed conflict error) already carry a safe statusCode and a
 *   human-written message, so those are passed through as-is.
 * - Anything else (including raw better-sqlite3 / SqliteError instances,
 *   which can carry the failing SQL text or a CHECK constraint expression
 *   in their message) is treated as an unexpected 500 and reduced to a
 *   generic message. The full error is logged server-side only, never sent
 *   to the client, so SQL statements, stack traces, and absolute file paths
 *   never leak into an API response.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isKnownAppError = Number.isInteger(err.statusCode) && err.statusCode < 500;

  if (isDevelopment()) {
    // Detailed logging for local development debugging only - never part of
    // the response, and never emitted during tests or in production.
    console.error(err);
  }

  if (isKnownAppError) {
    const error = { message: err.message || 'Request could not be processed' };
    if (err.details) {
      error.details = err.details;
    }
    return res.status(err.statusCode).json({ success: false, error });
  }

  // Unexpected error: database errors, programming errors, etc. Never leak
  // err.message/err.stack here, since it may contain SQL text or paths.
  return res.status(500).json({
    success: false,
    error: { message: 'Internal Server Error' },
  });
}

module.exports = errorHandler;
