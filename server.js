require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { connectDB } = require('./src/config/db');
const { init: initSupabase } = require('./src/config/supabase');
const queue = require('./src/config/queue');
const ocrService = require('./src/services/ocrService');
const imageProcessor = require('./src/services/imageProcessor');
const searchService = require('./src/services/searchService');
const logger = require('./src/utils/logger');
const fs = require('fs');

const app = express();

// Trust proxy (Railway, Render, etc.)
app.set('trust proxy', 1);

// Ensure required directories exist
['uploads', 'logs'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// Security
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
  : true;
app.use(cors({ origin: corsOrigins, credentials: true }));
app.options('*', cors());

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Trop de tentatives, réessayez plus tard' }
});
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { message: 'Trop de requêtes, veuillez réessayer plus tard' }
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { message: 'Trop d\'uploads, réessayez plus tard' }
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/documents', uploadLimiter, require('./src/routes/documents'));
app.use('/api/folders', require('./src/routes/folders'));
app.use('/api/tags', require('./src/routes/tags'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/search', require('./src/routes/search'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/sharing', require('./src/routes/sharing'));
app.use('/api/backup', require('./src/routes/backup'));
app.use('/api/scan', require('./src/routes/scan'));

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Route API non trouvée' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'Fichier trop volumineux (max 50MB)' });
  }
  if (err.message === 'Type de fichier non supporté') {
    return res.status(415).json({ message: err.message });
  }
  logger.error(err.stack);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();
    initSupabase();
    queue.init();
    ocrService.init();
    imageProcessor.init();
    searchService.init();
    app.listen(PORT, () => {
      logger.info(`Serveur démarré sur http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('Erreur démarrage:', error);
    process.exit(1);
  }
};

start();

module.exports = app;
