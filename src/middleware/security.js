const crypto = require('crypto');
const logger = require('../utils/logger');

const suspiciousPatterns = [
  /union\s+select/i,
  /or\s+1\s*=\s*1/i,
  /drop\s+table/i,
  /script\s*:/i,
  /javascript\s*:/i,
  /onerror\s*=/i,
  /onload\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /document\.cookie/i,
  /eval\s*\(/i,
  /fromCharCode/i
];

function detectSuspiciousInput(input) {
  if (!input || typeof input !== 'string') return false;
  return suspiciousPatterns.some(pattern => pattern.test(input));
}

function sanitizeInput(req, res, next) {
  const checkBody = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        if (detectSuspiciousInput(obj[key])) {
          logger.warn(`Suspicious input detected from ${req.ip}: ${key} = ${obj[key].substring(0, 100)}`);
          return res.status(400).json({ message: 'Entrée suspecte détectée' });
        }
      } else if (typeof obj[key] === 'object') {
        checkBody(obj[key]);
      }
    }
  };
  
  if (req.body) checkBody(req.body);
  if (req.query) checkBody(req.query);
  if (req.params) checkBody(req.params);
  
  next();
}

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
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  
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
    logger.error(`${req.method} ${req.path}`, {
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
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) errors.push('1 caractère spécial minimum');
  if (password && /(.)(.)\1\1/.test(password)) errors.push('Pas de 4 caractères répétés');
  if (password && password.toLowerCase().includes('password')) errors.push('Mot de passe trop commun');
  return errors;
}

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
}

module.exports = { 
  requestId, 
  securityHeaders, 
  sanitizeError, 
  passwordPolicy,
  sanitizeInput,
  validateEmail,
  validateUsername
};
