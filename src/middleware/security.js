const crypto = require('crypto');
const logger = require('../utils/logger');

function requestId(req, res, next) {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=()');
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  next();
}

function sanitizeError(err, req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, {
      requestId: req.id,
      status,
      message: err.message,
      stack: isProd ? undefined : err.stack,
      ip: req.ip,
      userId: req.user?.id
    });
  }

  const response = {
    message: isProd && status >= 500
      ? 'Erreur interne du serveur'
      : err.message || 'Erreur interne du serveur',
    requestId: req.id
  };

  if (err.errors) {
    response.errors = err.errors.map(e => ({
      field: e.path || e.param,
      message: e.msg || e.message
    }));
  }

  res.status(status).json(response);
}

function passwordPolicy(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('8 caractères minimum');
  if (!/[A-Z]/.test(password)) errors.push('1 majuscule minimum');
  if (!/[a-z]/.test(password)) errors.push('1 minuscule minimum');
  if (!/[0-9]/.test(password)) errors.push('1 chiffre minimum');
  if (password && /(.)(.)\1\1/.test(password)) errors.push('Pas de 4 caractères répétés');
  return errors;
}

module.exports = { requestId, securityHeaders, sanitizeError, passwordPolicy };
