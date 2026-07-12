require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { connectDB } = require('./src/config/db');
const { init: initSupabase } = require('./src/config/supabase');
const logger = require('./src/utils/logger');
const fs = require('fs');

const app = express();

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
app.use(cors({ origin: true, credentials: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Trop de requêtes, veuillez réessayer plus tard' }
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/folders', require('./src/routes/folders'));
app.use('/api/tags', require('./src/routes/tags'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/search', require('./src/routes/search'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/sharing', require('./src/routes/sharing'));
app.use('/api/backup', require('./src/routes/backup'));

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
