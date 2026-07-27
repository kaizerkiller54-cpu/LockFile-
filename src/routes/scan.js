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
const WORD_MIMES = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp'];
const MIME_TYPES = [...IMAGE_MIMES, 'application/pdf', ...WORD_MIMES];
const SCAN_UPLOAD_DIR = path.join(__dirname, '../../uploads/scan');

const tempStore = new Map();
const TEMP_TTL = 30 * 60 * 1000;
const TEMP_MAX_ENTRIES = 5000;

setInterval(() => {
  const now = Date.now();
  const expired = [];
  for (const [key, val] of tempStore) {
    if (now - val.createdAt > TEMP_TTL) expired.push(key);
  }
  for (const key of expired) {
    try { fs.unlinkSync(tempStore.get(key).filePath); } catch {}
    tempStore.delete(key);
  }
  if (tempStore.size > TEMP_MAX_ENTRIES) {
    const sorted = [...tempStore.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
    for (let i = 0; i < sorted.length - TEMP_MAX_ENTRIES; i++) {
      try { fs.unlinkSync(sorted[i][1].filePath); } catch {}
      tempStore.delete(sorted[i][0]);
    }
  }
}, 60 * 1000);

function ensureScanDir() {
  if (!fs.existsSync(SCAN_UPLOAD_DIR)) fs.mkdirSync(SCAN_UPLOAD_DIR, { recursive: true });
}

const scanUpload = upload.fields([
  { name: 'fichier', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

const validatePreview = [
  body('ocr').optional().isBoolean().withMessage('ocr doit être un booléen'),
  body('format').optional().isIn(['pdf', 'jpeg', 'png']).withMessage('Format: pdf, jpeg ou png'),
];

router.post('/preview', auth, (req, res, next) => {
  scanUpload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Fichier trop volumineux (max 50MB)' });
      return res.status(400).json({ message: 'Erreur upload: ' + err.message });
    }
    next();
  });
}, validatePreview, async (req, res) => {
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

    const doOcr = req.body.ocr === true || req.body.ocr === 'true';
    const isWord = WORD_MIMES.includes(mime);
    const isImage = IMAGE_MIMES.includes(mime);
    const isPdf = mime === 'application/pdf';

    const format = req.body.format || (isPdf ? 'pdf' : 'jpeg');
    let processedPath = file.path;
    let processedMime = mime;

    if (isImage && format !== 'pdf' && mime !== format) {
      try {
        const imgProc = require('../services/imageProcessor');
        if (imgProc.isAvailable()) {
          ensureScanDir();
          const outputName = `${uuidv4()}.${format}`;
          const outputPath = path.join(SCAN_UPLOAD_DIR, outputName);
          const result = await imgProc.compressImage(file.path, outputPath, 80);
          processedPath = result.path;
          processedMime = `image/${format}`;
          try { fs.unlinkSync(file.path); } catch {}
        }
      } catch (e) { logger.warn('Conversion impossible:', e.message); }
    }

    let ocrText = null;
    if (doOcr) {
      if (isWord) {
        const docxService = require('../services/docxService');
        if (docxService.isAvailable()) {
          const result = await docxService.extractText(processedPath);
          ocrText = result.text;
          if (result.error) logger.warn('Extraction Word échouée:', result.error);
        }
      } else if (isImage) {
        const ocrService = require('../services/ocrService');
        if (ocrService.isAvailable()) {
          try {
            const result = await ocrService.extractText(processedPath);
            ocrText = result.text;
            if (result.error) logger.warn('OCR échoué:', result.error);
          } catch (e) { logger.warn('OCR exception:', e.message); }
        }
      } else if (isPdf) {
        logger.warn('OCR ignoré: format PDF non supporté par Tesseract');
      }
    }

    const token = uuidv4();
    tempStore.set(token, {
      filePath: processedPath,
      originalName: file.originalname,
      mime: processedMime,
      size: fs.statSync(processedPath).size,
      userId: req.user.id,
      createdAt: Date.now(),
    });

    logger.info(`Preview scan: token=${token} ocr=${!!ocrText}`);
    res.json({
      token,
      preview: {
        nom_original: file.originalname,
        type_fichier: processedMime,
        taille: fs.statSync(processedPath).size,
      },
      ocr: ocrText ? { text: ocrText } : null,
    });
  } catch (error) {
    logger.error('Erreur preview scan:', error);
    res.status(500).json({ message: 'Erreur lors du preview' });
  }
});

const validateConfirm = [
  body('token').notEmpty().withMessage('Token requis'),
  body('titre').trim().notEmpty().isLength({ max: 255 }).withMessage('Titre requis (max 255)'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description trop longue'),
  body('dossier').optional({ values: 'falsy' }).isInt().withMessage('Dossier invalide'),
  body('tags').optional().isArray().withMessage('Tags doit être un tableau'),
  body('contenu_ocr').optional().isString().withMessage('contenu_ocr doit être du texte'),
];

router.post('/confirm', auth, validateConfirm, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const temp = tempStore.get(req.body.token);
    if (!temp) return res.status(404).json({ message: 'Session expirée ou invalide' });
    if (temp.userId !== req.user.id) return res.status(403).json({ message: 'Token non autorisé' });

    tempStore.delete(req.body.token);

    const titre = sanitizeString(req.body.titre);
    const description = sanitizeString(req.body.description) || '';
    const tags = sanitizeTags(req.body.tags);
    const dossierId = req.body.dossier || null;
    const contenuOcr = req.body.contenu_ocr !== undefined ? String(req.body.contenu_ocr).trim() : null;

    const doc = await Document.create({
      titre,
      description,
      nom_fichier: path.basename(temp.filePath),
      nom_original: temp.originalName,
      type_fichier: temp.mime,
      taille: temp.size,
      chemin: temp.filePath,
      proprietaire_id: req.user.id,
      dossier_id: dossierId,
      contenu_ocr: contenuOcr,
    });

    if (tags.length > 0) {
      await doc.setTags(tags);
    }

    await Version.create({
      document_id: doc.id,
      numero_version: 1,
      nom_fichier: path.basename(temp.filePath),
      chemin: temp.filePath,
      taille: temp.size,
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

    try { encryptFile(temp.filePath); } catch (e) { logger.error('Erreur chiffrement scan:', e); }

    try {
      const result = await storage.uploadFile(temp.filePath, temp.originalName, temp.mime, req.user.id);
      if (result.url) await doc.update({ url: result.url, firebase_path: result.cloudPath });
    } catch (e) { logger.error('Erreur upload Supabase scan:', e); }

    try {
      const searchService = require('../services/searchService');
      if (searchService.isAvailable()) {
        await searchService.indexDocument({
          id: doc.id, titre, description,
          nom_original: temp.originalName,
          type_fichier: temp.mime,
          contenu_ocr: contenuOcr,
          proprietaire_id: req.user.id,
          tags: tags.map(t => ({ id: t })),
          statut: 'actif',
          createdAt: doc.createdAt,
        });
      }
    } catch (e) { logger.warn('Indexation recherche échouée:', e.message); }

    logger.info(`Document scanné confirmé: ${titre} par ${req.user.username}`);
    res.status(201).json({ document: doc.toJSON() });
  } catch (error) {
    logger.error('Erreur confirmation scan:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement' });
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
