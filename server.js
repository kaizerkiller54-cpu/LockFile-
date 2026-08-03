require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const { connectDB, getPoolStats } = require('./src/config/db');
const { init: initSupabase } = require('./src/config/supabase');
const { authLimiter, apiLimiter, sharingLimiter } = require('./src/config/rateLimit');
const queue = require('./src/config/queue');
const ocrService = require('./src/services/ocrService');
const imageProcessor = require('./src/services/imageProcessor');
const searchService = require('./src/services/searchService');
const logger = require('./src/utils/logger');
const { requestId, securityHeaders, sanitizeError, sanitizeInput } = require('./src/middleware/security');
const { auth, checkRole } = require('./src/middleware/auth');
const fs = require('fs');

if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET est requis dans .env. Arrêt du serveur.');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  logger.error('ENCRYPTION_KEY est requise dans .env. Arrêt du serveur.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  logger.warn('Avertissement: JWT_SECRET est trop court (< 32 caractères). Utilisez une valeur aléatoire longue.');
}
if (process.env.ENCRYPTION_KEY.length < 32) {
  logger.warn('Avertissement: ENCRYPTION_KEY est trop courte (< 32 caractères). Utilisez une clé aléatoire de 32+ caractères.');
}

const app = express();
const server = require('http').createServer(app);

app.set('trust proxy', 1);

process.on('unhandledRejection', (reason) => {
  logger.warn('Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  setTimeout(() => process.exit(1), 1000);
});

['uploads', 'logs'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

app.use(requestId);
app.use(sanitizeInput);
app.use(compression({ filter: (req, res) => {
  if (req.headers['x-no-compression']) return false;
  return compression.filter(req, res);
}, level: 6, threshold: 1024 }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      "img-src": ["'self'", "data:", "blob:", "https:"],
      "font-src": ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com", "https:"],
      "connect-src": ["'self'", "https:", "wss:"],
      "media-src": ["'self'", "blob:", "data:", "https:"],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'self'"],
      "worker-src": ["'self'", "blob:"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));
app.use(securityHeaders);

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : false;
app.use(cors({ origin: corsOrigins, credentials: true, maxAge: 86400, exposedHeaders: ['Content-Disposition'] }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);
app.use(morgan((tokens, req, res) => {
  const status = tokens.status(req, res);
  const size = tokens.res(req, res, 'content-length');
  return `${tokens.method(req, res)} ${req.path} ${status || '-'} ${size ? size + ' -' : ''} ${(tokens['response-time'](req, res) || '').trim()} ms`;
}, {
  stream: { write: msg => logger.info(msg.trim()) },
  skip: (req) => req.path === '/health'
}));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  etag: true,
  lastModified: true
}));

app.get('/health', async (req, res) => {
  const health = { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  try {
    const pool = getPoolStats();
    health.database = pool;
    if (pool.total > pool.idle * 2) health.status = 'degraded';
  } catch { health.database = { status: 'unavailable' }; }
  const status = health.status === 'ok' ? 200 : 503;
  res.status(status).json(health);
});

app.get('/api/stats', auth, checkRole('admin'), async (req, res) => {
  try {
    const pool = getPoolStats();
    res.json({ uptime: process.uptime(), memory: process.memoryUsage(), pool, pid: process.pid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/folders', require('./src/routes/folders'));
app.use('/api/tags', require('./src/routes/tags'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/search', require('./src/routes/search'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/sharing', sharingLimiter, require('./src/routes/sharing'));
app.use('/api/backup', require('./src/routes/backup'));
app.use('/api/scan', require('./src/routes/scan'));
app.use('/api/approvals', require('./src/routes/approvals'));
app.use('/api/activity', require('./src/routes/activity'));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Fichier trop volumineux (max 50MB)' });
  }
  if (err.message === 'Type de fichier non supporté') {
    return res.status(415).json({ message: err.message });
  }
  sanitizeError(err, req, res, next);
});

const PORT = process.env.PORT || 5000;
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`${signal} received, shutting down gracefully...`);

  server.close(async () => {
    logger.info('HTTP server closed');
    const { sequelize } = require('./src/config/db');
    try {
      await sequelize.close();
      logger.info('Database connection closed');
    } catch (e) {
      logger.warn('Error closing database:', e.message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const start = async () => {
  try {
    await connectDB();
    initSupabase();
    queue.init();
    ocrService.init();
    imageProcessor.init();
    searchService.init();
    require('./src/services/docxService').init();
    require('./src/services/expirationChecker').startExpirationChecker();
    server.listen(PORT, () => {
      logger.info(`Serveur démarré sur http://localhost:${PORT} (PID: ${process.pid})`);
    });
  } catch (error) {
    logger.error('Erreur démarrage:', error);
    process.exit(1);
  }
};

start();

module.exports = app;
