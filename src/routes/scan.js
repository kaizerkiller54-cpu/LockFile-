const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { Document, Tag, Version, Notification } = require('../models');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const { sanitizeString, sanitizeTags } = require('../utils/sanitize');
const { encryptFile } = require('../utils/crypto');
const storage = require('../utils/storage');

const router = express.Router();

const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'application/pdf'];
const SCAN_UPLOAD_DIR = path.join(__dirname, '../../uploads/scan');

function ensureScanDir() {
  if (!fs.existsSync(SCAN_UPLOAD_DIR)) fs.mkdirSync(SCAN_UPLOAD_DIR, { recursive: true });
}

const scanUpload = upload.fields([
  { name: 'fichier', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

router.post('/upload', auth, (req, res, next) => {
  scanUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Fichier trop volumineux (max 50MB)' });
      return res.status(400).json({ message: 'Erreur upload: ' + err.message });
    }
    next();
  });
}, [
  body('titre').optional().trim().isLength({ max: 255 }).withMessage('Titre trop long'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description trop longue'),
  body('dossier').optional({ values: 'falsy' }).isInt().withMessage('Dossier invalide'),
  body('tags').optional().isArray().withMessage('Tags doit être un tableau'),
  body('ocr').optional().isBoolean().withMessage('ocr doit être un booléen'),
  body('format').optional().isIn(['pdf', 'jpeg', 'png']).withMessage('Format: pdf, jpeg ou png'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    if (!req.files || !req.files.fichier || req.files.fichier.length === 0) {
      return res.status(400).json({ message: 'Fichier requis' });
    }

    const file = req.files.fichier[0];
    const mime = file.mimetype.toLowerCase();
    if (!MIME_TYPES.includes(mime)) {
      fs.unlinkSync(file.path);
      return res.status(415).json({ message: 'Type non supporté: ' + mime });
    }

    const titre = sanitizeString(req.body.titre) || file.originalname.replace(/\.[^/.]+$/, '');
    const description = sanitizeString(req.body.description) || '';
    const tags = sanitizeTags(req.body.tags);
    const doOcr = req.body.ocr === true || req.body.ocr === 'true';
    const format = req.body.format || (mime === 'application/pdf' ? 'pdf' : 'jpeg');
    const dossierId = req.body.dossier || null;

    let ocrText = null;
    let processedPath = file.path;
    let processedMime = mime;

    if (doOcr) {
      try {
        const ocrService = require('../services/ocrService');
        if (ocrService.isAvailable()) {
          const result = await ocrService.extractText(file.path);
          ocrText = result.text;
          if (result.error) logger.warn('OCR échoué:', result.error);
        }
      } catch (e) { logger.warn('OCR non disponible:', e.message); }
    }

    if (format !== 'pdf' && mime !== format && mime !== 'application/pdf') {
      try {
        const imgProc = require('../services/imageProcessor');
        if (imgProc.isAvailable()) {
          ensureScanDir();
          const outputName = `${uuidv4()}.${format}`;
          const outputPath = path.join(SCAN_UPLOAD_DIR, outputName);
          const result = await imgProc.compressImage(file.path, outputPath, 80);
          processedPath = result.path;
          processedMime = `image/${format}`;
        }
      } catch (e) { logger.warn('Conversion impossible:', e.message); }
    }

    const doc = await Document.create({
      titre,
      description,
      nom_fichier: path.basename(processedPath),
      nom_original: file.originalname,
      type_fichier: processedMime,
      taille: fs.statSync(processedPath).size,
      chemin: processedPath,
      proprietaire_id: req.user.id,
      dossier_id: dossierId,
      contenu_ocr: ocrText,
    });

    if (tags.length > 0) {
      await doc.setTags(tags);
    }

    await Version.create({
      document_id: doc.id,
      numero_version: 1,
      nom_fichier: path.basename(processedPath),
      chemin: processedPath,
      taille: fs.statSync(processedPath).size,
      modifie_par_id: req.user.id,
      commentaire: 'Scan/Upload initial',
    });

    await Notification.create({
      destinataire_id: req.user.id,
      type: 'document_ajoute',
      titre: 'Document scanné',
      message: `"${titre}" a été importé`,
      lien: `/documents/${doc.id}`,
    });

    try { encryptFile(processedPath); } catch (e) { logger.error('Erreur chiffrement scan:', e); }

    try {
      const result = await storage.uploadFile(processedPath, file.originalname, processedMime, req.user.id);
      if (result.url) await doc.update({ url: result.url, firebase_path: result.cloudPath });
    } catch (e) { logger.error('Erreur upload Supabase scan:', e); }

    try {
      const searchService = require('../services/searchService');
      if (searchService.isAvailable()) {
        await searchService.indexDocument({
          id: doc.id, titre, description,
          nom_original: file.originalname,
          type_fichier: processedMime,
          contenu_ocr: ocrText,
          proprietaire_id: req.user.id,
          tags: tags.map(t => ({ id: t })),
          statut: 'actif',
          createdAt: doc.createdAt,
        });
      }
    } catch (e) { logger.warn('Indexation recherche échouée:', e.message); }

    logger.info(`Document scanné/uploadé: ${titre} par ${req.user.username}`);
    res.status(201).json({ document: doc.toJSON(), ocr: ocrText ? { text: ocrText } : null });
  } catch (error) {
    logger.error('Erreur scan upload:', error);
    res.status(500).json({ message: 'Erreur lors de l\'import' });
  }
});

router.get('/status/:jobId', auth, async (req, res) => {
  try {
    const queue = require('../config/queue');
    const status = await queue.getJobStatus(req.params.jobId);
    if (!status) return res.status(404).json({ message: 'Job non trouvé' });
    res.json({ status });
  } catch (error) {
    logger.error('Erreur status job:', error);
    res.status(500).json({ message: 'Erreur' });
  }
});

module.exports = router;
