const express = require('express');

const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const { Document, Folder, Tag, Version, Notification, Permission, sequelize } = require('../models');
const { auth } = require('../middleware/auth');
const { uploadLimiter, downloadLimiter } = require('../config/rateLimit');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const { encryptFile, decryptFile, decompressBuffer } = require('../utils/crypto');
const { sanitizeString, sanitizeOptional, sanitizeTags } = require('../utils/sanitize');
const { assertValidFile } = require('../utils/fileValidation');
const storage = require('../utils/storage');
const { logActivity } = require('../middleware/activityLogger');
const fs = require('fs');
const path = require('path');

const { idParam, paginationQuery } = require('../middleware/validateParams');

const router = express.Router();

const MAX_LIST_LIMIT = 100;
const WRITE_PERMISSION_LEVELS = new Set(['ecriture', 'suppression']);

function activePermissionWhere(userId) {
  return {
    utilisateur_id: userId,
    [Op.or]: [
      { expiration: null },
      { expiration: { [Op.gt]: new Date() } }
    ]
  };
}

async function getSharedAccessIds(userId) {
  const permissions = await Permission.findAll({
    attributes: ['document_id', 'dossier_id', 'niveau'],
    where: activePermissionWhere(userId),
    raw: true
  });

  return {
    documentIds: permissions
      .map(p => p.document_id)
      .filter(Boolean),
    folderIds: permissions
      .map(p => p.dossier_id)
      .filter(Boolean)
  };
}

function parsePositiveInt(value, fallback, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

// Lecture : propriétaire ou permission partagée (lecture / écriture)
async function canAccessDoc(docId, userId, include) {
  const doc = await Document.findByPk(docId, { include });
  if (!doc) return null;
  if (doc.proprietaire_id === userId) return doc;

  const directPerm = await Permission.findOne({
    where: { ...activePermissionWhere(userId), document_id: doc.id }
  });
  if (directPerm) return doc;

  if (doc.dossier_id) {
    const folderPerm = await Permission.findOne({
      where: { ...activePermissionWhere(userId), dossier_id: doc.dossier_id }
    });
    if (folderPerm) return doc;
  }

  return null;
}

// Modification : propriétaire ou permission écriture
async function canModifyDoc(docId, userId, include) {
  const doc = await Document.findByPk(docId, { include });
  if (!doc) return null;
  if (doc.proprietaire_id === userId) return doc;

  const directPerm = await Permission.findOne({
    where: {
      ...activePermissionWhere(userId),
      document_id: doc.id,
      niveau: { [Op.in]: Array.from(WRITE_PERMISSION_LEVELS) }
    }
  });
  if (directPerm) return doc;

  if (doc.dossier_id) {
    const folderPerm = await Permission.findOne({
      where: {
        ...activePermissionWhere(userId),
        dossier_id: doc.dossier_id,
        niveau: { [Op.in]: Array.from(WRITE_PERMISSION_LEVELS) }
      }
    });
    if (folderPerm) return doc;
  }

  return null;
}

// Validate that a folder belongs to the current user before assigning a document to it
async function validateFolderOwnership(dossier, userId) {
  if (dossier === undefined || dossier === null || dossier === '' || dossier === 'null') {
    return { ok: true, value: null };
  }
  const folder = await Folder.findOne({ where: { id: dossier, proprietaire_id: userId } });
  if (!folder) return { ok: false };
  return { ok: true, value: folder.id };
}

function sanitizeOriginalName(name) {
  return path.basename(String(name || '')).replace(/[\r\n\u0000-\u001F\u007F]/g, '');
}

const docIncludes = [
  { model: Folder, as: 'dossier', attributes: ['id', 'nom'] },
  { model: Tag, as: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } }
];

router.get('/', auth, paginationQuery, async (req, res) => {
  try {
    const { dossier, statut, favori, tag, sort, q } = req.query;
    const page = parsePositiveInt(req.query.page, 1, 10000);
    const limit = parsePositiveInt(req.query.limit, 20, MAX_LIST_LIMIT);

    const statutVal = statut || 'actif';
    const andClauses = [{ statut: statutVal }];

    if (q && String(q).trim()) {
      const term = `%${sanitizeString(String(q).trim()).slice(0, 200)}%`;
      andClauses.push({
        [Op.or]: [
          { titre: { [Op.iLike]: term } },
          { description: { [Op.iLike]: term } },
          { nom_original: { [Op.iLike]: term } }
        ]
      });
    }
    if (dossier !== undefined) {
      andClauses.push({ dossier_id: dossier === 'null' ? null : dossier });
    }
    if (favori === 'true') {
      andClauses.push({ proprietaire_id: req.user.id, favori: true });
    } else {
      const { documentIds, folderIds } = await getSharedAccessIds(req.user.id);
      andClauses.push({
        [Op.or]: [
          { proprietaire_id: req.user.id },
          ...(documentIds.length ? [{ id: { [Op.in]: documentIds } }] : []),
          ...(folderIds.length ? [{ dossier_id: { [Op.in]: folderIds } }] : [])
        ]
      });
    }

    const where = { [Op.and]: andClauses };

    const include = [];
    include.push({ model: Folder, as: 'dossier', attributes: ['id', 'nom'] });
    if (tag) {
      include.push({
        model: Tag, as: 'tags',
        where: { id: tag },
        attributes: ['id', 'nom', 'couleur'],
        through: { attributes: [] },
        required: true
      });
    } else {
      include.push({ model: Tag, as: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } });
    }

    const offset = (page - 1) * limit;
    const sortOrders = {
      date: [['createdAt', 'DESC']],
      recent: [['updatedAt', 'DESC']],
      type: [['type_fichier', 'DESC']],
      taille: [['taille', 'DESC']]
    };
    const allowedSort = sortOrders[sort] ? sort : 'date';
    const { rows: documents, count: total } = await Document.findAndCountAll({
      where,
      include,
      order: sortOrders[allowedSort] || sortOrders.date,
      offset,
      limit,
      distinct: true
    });
    res.json({ documents, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    logger.error('Erreur liste documents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/recent', auth, async (req, res) => {
  try {
    const { documentIds: sharedDocIds, folderIds: sharedFolderIds } = await getSharedAccessIds(req.user.id);

    const documents = await Document.findAll({
      where: {
        statut: 'actif',
        [Op.or]: [
          { proprietaire_id: req.user.id },
          ...(sharedDocIds.length ? [{ id: { [Op.in]: sharedDocIds } }] : []),
          ...(sharedFolderIds.length ? [{ dossier_id: { [Op.in]: sharedFolderIds } }] : [])
        ]
      },
      include: docIncludes,
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    res.json({ documents });
  } catch (error) {
    logger.error('Erreur documents récents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/stats', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const { documentIds: sharedDocIds, folderIds: sharedFolderIds } = await getSharedAccessIds(userId);

    const accessFilter = {
      [Op.or]: [
        { proprietaire_id: userId },
        ...(sharedDocIds.length ? [{ id: { [Op.in]: sharedDocIds } }] : []),
        ...(sharedFolderIds.length ? [{ dossier_id: { [Op.in]: sharedFolderIds } }] : [])
      ]
    };
    const ownerFilter = { proprietaire_id: userId };

    const [total, recents, favoris, partages, parType] = await Promise.all([
      Document.count({ where: { ...accessFilter, statut: 'actif' } }),
      Document.count({ where: { ...accessFilter, statut: 'actif', createdAt: { [Op.gte]: weekAgo } } }),
      Document.count({ where: { ...ownerFilter, favori: true, statut: 'actif' } }),
      Document.count({ where: { ...ownerFilter, est_partage: true, statut: 'actif' } }),
      Document.findAll({
        attributes: ['type_fichier', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        where: { ...accessFilter, statut: 'actif' },
        group: ['type_fichier'],
        raw: true
      })
    ]);

    res.json({ total, parType, recents, favoris, partages });
  } catch (error) {
    logger.error('Erreur stats:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/download/:id', auth, downloadLimiter, ...idParam('id'), async (req, res) => {
  try {
    const userId = req.user.id;

    const doc = await canAccessDoc(req.params.id, userId);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
    if (doc.statut === 'supprime') return res.status(410).json({ message: 'Document supprimé' });

    logActivity({
      userId: userId,
      action: 'document_telecharge',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" téléchargé`,
      req
    });

    if (doc.firebase_path) {
      try {
        if (doc.statut === 'archive') {
          const compressed = await storage.downloadFile(doc.firebase_path);
          if (compressed) {
            const data = decompressBuffer(compressed);
            res.setHeader('Content-Type', doc.type_fichier || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_original)}"`);
            res.setHeader('Content-Length', data.length);
            return res.send(data);
          }
        } else {
          const cloudUrl = await storage.getDownloadUrl(doc.firebase_path);
          if (cloudUrl) return res.redirect(cloudUrl);
        }
      } catch (e) { logger.error('Erreur download cloud:', e); }
    }

    const uploadsDir = path.resolve(process.env.UPLOAD_DIR || 'uploads');
    const filePath = path.resolve(doc.chemin);
    if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + path.sep)) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Fichier introuvable sur le disque' });
    }
    try {
      const data = decryptFile(filePath);
      res.setHeader('Content-Type', doc.type_fichier || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.nom_original)}"`);
      res.setHeader('Content-Length', data.length);
      res.send(data);
    } catch (e) {
      logger.error('Erreur déchiffrement:', e);
      res.download(filePath, doc.nom_original);
    }
  } catch (error) {
    logger.error('Erreur download:', error);
    res.status(500).json({ message: 'Erreur téléchargement' });
  }
});

router.get('/:id', auth, ...idParam('id'), async (req, res) => {
  try {
    const doc = await canAccessDoc(req.params.id, req.user.id, docIncludes);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
    res.json({ document: doc });
  } catch (error) {
    logger.error('Erreur get document:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

const validateDocInput = [
  body('titre').optional().trim().isLength({ max: 255 }).withMessage('Titre trop long (max 255)'),
  body('description').optional().trim().isLength({ max: 5000 }).withMessage('Description trop longue'),
  body('dossier').optional({ values: 'falsy' }).isInt().withMessage('Dossier invalide'),
  body('tags').optional().custom(value => Array.isArray(value) || typeof value === 'string').withMessage('Tags doit être un tableau'),
  body('favori').optional().isBoolean().withMessage('Favori doit être un booléen'),
  body('commentaire').optional().trim().isLength({ max: 500 }).withMessage('Commentaire trop long'),
  body('date_expiration').optional({ values: 'falsy' }).isISO8601().withMessage('Date d\'expiration invalide'),
  body('jours_alerte').optional().isInt({ min: 1, max: 365 }).withMessage('Jours d\'alerte: 1-365'),
];

router.post('/', auth, uploadLimiter, upload.single('fichier'), validateDocInput, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ errors: errors.array() });
    }

    const fileCheck = assertValidFile(req.file.path, req.file.mimetype);
    if (!fileCheck.ok) {
      fs.unlink(req.file.path, () => {});
      return res.status(415).json({ message: 'Contenu du fichier incohérent avec le type déclaré' });
    }

    const { dossier, tags } = req.body;
    const folderCheck = await validateFolderOwnership(dossier, req.user.id);
    if (!folderCheck.ok) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ message: 'Dossier invalide ou non autorisé' });
    }
    const titre = sanitizeString(req.body.titre) || req.file.originalname.replace(/\.[^/.]+$/, '');
    const description = sanitizeString(req.body.description) || '';
    const tagIds = sanitizeTags(tags);
    const dateExpiration = req.body.date_expiration || null;
    const joursAlerte = parseInt(req.body.jours_alerte) || 30;

    const docData = {
      titre,
      description,
      nom_fichier: req.file.filename,
      nom_original: sanitizeOriginalName(req.file.originalname),
      type_fichier: req.file.mimetype,
      taille: req.file.size,
      chemin: req.file.path,
      proprietaire_id: req.user.id,
      dossier_id: folderCheck.value,
      date_expiration: dateExpiration,
      jours_alerte: joursAlerte,
    };

    const doc = await Document.create(docData);

    if (tagIds.length > 0) {
      await doc.setTags(tagIds);
    }

    await Version.create({
      document_id: doc.id,
      numero_version: 1,
      nom_fichier: req.file.filename,
      chemin: req.file.path,
      taille: req.file.size,
      modifie_par_id: req.user.id,
      commentaire: 'Version initiale'
    });

    await Notification.create({
      destinataire_id: req.user.id,
      type: 'document_ajoute',
      titre: 'Document ajouté',
      message: `"${doc.titre}" a été ajouté avec succès`,
      lien: `/documents/${doc.id}`
    });

    try {
      const result = await storage.uploadFile(req.file.path, req.file.originalname, req.file.mimetype, req.user.id);
      if (result.url) {
        await doc.update({ url: result.url, firebase_path: result.cloudPath });
      }
    } catch (e) { logger.error('Erreur upload Supabase:', e); }

    try { encryptFile(doc.chemin); } catch (e) { logger.error('Erreur chiffrement:', e); }

    logger.info(`Document créé: ${doc.titre} par ${req.user.username}`);
    const reloaded = await Document.findByPk(doc.id, { include: docIncludes });
    
    logActivity({
      userId: req.user.id,
      action: 'document_cree',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" créé`,
      req
    });
    
    res.status(201).json({ document: reloaded });
  } catch (error) {
    logger.error('Erreur upload:', error);
    res.status(500).json({ message: 'Erreur lors de l\'upload' });
  }
});

router.put('/:id', auth, uploadLimiter, upload.single('fichier'), validateDocInput, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ errors: errors.array() });
    }

    const doc = await canModifyDoc(req.params.id, req.user.id);
    if (!doc) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ message: 'Document non trouvé' });
    }

    if (req.file) {
      const fileCheck = assertValidFile(req.file.path, req.file.mimetype);
      if (!fileCheck.ok) {
        fs.unlink(req.file.path, () => {});
        return res.status(415).json({ message: 'Contenu du fichier incohérent avec le type déclaré' });
      }
    }

    if (req.body.titre !== undefined) doc.titre = sanitizeString(req.body.titre);
    if (req.body.description !== undefined) doc.description = sanitizeString(req.body.description);
    if (req.body.dossier !== undefined) {
      const folderCheck = await validateFolderOwnership(req.body.dossier, req.user.id);
      if (!folderCheck.ok) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(403).json({ message: 'Dossier invalide ou non autorisé' });
      }
      doc.dossier_id = folderCheck.value;
    }
    if (req.body.favori !== undefined) doc.favori = req.body.favori === 'true' || req.body.favori === true;
    if (req.body.date_expiration !== undefined) doc.date_expiration = req.body.date_expiration || null;
    if (req.body.jours_alerte !== undefined) doc.jours_alerte = parseInt(req.body.jours_alerte) || 30;

    if (req.body.tags) {
      const tagIds = sanitizeTags(req.body.tags);
      await doc.setTags(tagIds);
    }

    if (req.file) {
      doc.nom_fichier = req.file.filename;
      doc.nom_original = sanitizeOriginalName(req.file.originalname);
      doc.type_fichier = req.file.mimetype;
      doc.taille = req.file.size;
      doc.chemin = req.file.path;
      doc.version_actuelle += 1;

      await Version.create({
        document_id: doc.id,
        numero_version: doc.version_actuelle,
        nom_fichier: req.file.filename,
        chemin: req.file.path,
        taille: req.file.size,
        modifie_par_id: req.user.id,
        commentaire: req.body.commentaire || `Version ${doc.version_actuelle}`
      });
      try {
        const result = await storage.uploadVersionFile(req.file.path, req.file.originalname, req.file.mimetype, req.user.id);
        if (result.cloudPath) {
          doc.firebase_path = result.cloudPath;
        }
      } catch (e) { logger.error('Erreur upload version Supabase:', e); }
      try { encryptFile(req.file.path); } catch (e) { logger.error('Erreur chiffrement version:', e); }
    }

    await doc.save();

    await Notification.create({
      destinataire_id: req.user.id,
      type: 'document_modifie',
      titre: 'Document modifié',
      message: `"${doc.titre}" a été mis à jour`,
      lien: `/documents/${doc.id}`
    });

    logActivity({
      userId: req.user.id,
      action: 'document_modifie',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" modifié${req.file ? ' (nouvelle version)' : ''}`,
      req
    });

    const reloaded = await Document.findByPk(doc.id, { include: docIncludes });
    res.json({ document: reloaded });
  } catch (error) {
    logger.error('Erreur update document:', error);
    res.status(500).json({ message: 'Erreur mise à jour' });
  }
});

router.patch('/:id/tags', auth, [
  body('tags').isArray({ min: 1 }).withMessage('Liste de tags valide requise')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doc = await canModifyDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const tagIds = sanitizeTags(req.body.tags);
    await doc.setTags(tagIds);

    const reloaded = await Document.findByPk(doc.id, { include: docIncludes });
    res.json({ document: reloaded, message: 'Tags mis à jour' });
  } catch (error) {
    logger.error('Erreur update tags:', error);
    res.status(500).json({ message: 'Erreur mise à jour des tags' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const docId = doc.id;
    const docTitre = doc.titre;
    const userId = req.user.id;
    const username = req.user.username;

    await sequelize.query(
      'UPDATE documents SET statut = $1, "updatedAt" = NOW() WHERE id = $2',
      { bind: ['supprime', docId] }
    );

    const check = await sequelize.query(
      'SELECT statut FROM documents WHERE id = $1',
      { bind: [docId], type: sequelize.QueryTypes.SELECT }
    );
    logger.info(`Delete verify: id=${docId} statut=${check[0]?.statut}`);

    await Notification.create({
      destinataire_id: userId,
      type: 'document_supprime',
      titre: 'Document supprimé',
      message: `"${docTitre}" a été déplacé dans la corbeille`,
      lien: '#/trash'
    });

    logActivity({
      userId: userId,
      action: 'document_supprime',
      cibleType: 'document',
      cibleId: docId,
      description: `Document "${docTitre}" supprimé`,
      req
    });

    logger.info(`Document supprimé: ${docTitre} par ${username}`);
    res.json({ message: 'Document supprimé' });
  } catch (error) {
    logger.error('Erreur delete document:', error);
    res.status(500).json({ message: 'Erreur suppression' });
  }
});

router.post('/:id/restore', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id, statut: 'supprime' }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    await sequelize.query(
      'UPDATE documents SET statut = $1, "updatedAt" = NOW() WHERE id = $2',
      { bind: ['actif', doc.id] }
    );
    doc.statut = 'actif';
    
    logActivity({
      userId: req.user.id,
      action: 'document_restauré',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" restauré de la corbeille`,
      req
    });
    
    res.json({ document: doc });
  } catch (error) {
    logger.error('Erreur restore:', error);
    res.status(500).json({ message: 'Erreur restauration' });
  }
});

router.delete('/:id/permanent', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    await storage.deleteFile(doc.nom_fichier, doc.firebase_path);

    await Version.destroy({ where: { document_id: doc.id } });
    await Permission.destroy({ where: { document_id: doc.id } });
    await Notification.destroy({ where: { lien: `/documents/${doc.id}` } });
    await Document.destroy({ where: { id: doc.id } });

    logActivity({
      userId: req.user.id,
      action: 'document_supprime_definitivement',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" supprimé définitivement`,
      req
    });

    logger.info(`Suppression définitive: ${doc.titre} par ${req.user.username}`);
    res.json({ message: 'Document supprimé définitivement' });
  } catch (error) {
    logger.error('Erreur suppression définitive:', error);
    res.status(500).json({ message: 'Erreur suppression définitive' });
  }
});

router.delete('/trash/empty', auth, async (req, res) => {
  try {
    const docs = await Document.findAll({
      where: { proprietaire_id: req.user.id, statut: 'supprime' }
    });

    for (const doc of docs) {
      try { await storage.deleteFile(doc.nom_fichier, doc.firebase_path); } catch {}
      await Version.destroy({ where: { document_id: doc.id } });
      await Permission.destroy({ where: { document_id: doc.id } });
      await Notification.destroy({ where: { lien: `/documents/${doc.id}` } });
      await Document.destroy({ where: { id: doc.id } });
    }

    logActivity({
      userId: req.user.id,
      action: 'corbeille_vidée',
      cibleType: 'corbeille',
      cibleId: null,
      description: `Corbeille vidée (${docs.length} document(s) supprimé(s))`,
      req
    });

    logger.info(`Corbeille vidée par ${req.user.username} (${docs.length} doc(s))`);
    res.json({ message: `Corbeille vidée (${docs.length} document(s) supprimé(s))` });
  } catch (error) {
    logger.error('Erreur vidage corbeille:', error);
    res.status(500).json({ message: 'Erreur vidage corbeille' });
  }
});

router.get('/:id/versions', auth, ...idParam('id'), async (req, res) => {
  try {
    const doc = await canAccessDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const versions = await Version.findAll({
      where: { document_id: doc.id },
      include: [{ model: require('../models/User'), as: 'modifie_par', attributes: ['id', 'nom', 'prenom'] }],
      order: [['numero_version', 'DESC']]
    });
    res.json({ versions });
  } catch (error) {
    logger.error('Erreur versions:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/:id/restore-version/:versionId', auth, async (req, res) => {
  try {
    const doc = await canModifyDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const version = await Version.findOne({
      where: { id: req.params.versionId, document_id: doc.id }
    });
    if (!version) return res.status(404).json({ message: 'Version non trouvée' });

    doc.nom_fichier = version.nom_fichier;
    doc.chemin = version.chemin;
    doc.taille = version.taille;
    doc.version_actuelle += 1;
    await doc.save();

    await Version.create({
      document_id: doc.id,
      numero_version: doc.version_actuelle,
      nom_fichier: version.nom_fichier,
      chemin: version.chemin,
      taille: version.taille,
      modifie_par_id: req.user.id,
      commentaire: `Restauration version ${version.numero_version}`
    });
    try {
      const result = await storage.uploadVersionFile(doc.chemin, doc.nom_original, doc.type_fichier, req.user.id);
      if (result.cloudPath) doc.firebase_path = result.cloudPath;
    } catch (e) { logger.error('Erreur upload Supabase restauration:', e); }

    try { encryptFile(doc.chemin); } catch (e) { logger.error('Erreur chiffrement restauration:', e); }

    logActivity({
      userId: req.user.id,
      action: 'version_restaurée',
      cibleType: 'version',
      cibleId: version.id,
      description: `Version ${version.numero_version} restaurée pour "${doc.titre}"`,
      req
    });

    res.json({ document: doc, message: `Version ${version.numero_version} restaurée` });
  } catch (error) {
    logger.error('Erreur restore version:', error);
    res.status(500).json({ message: 'Erreur restauration version' });
  }
});

router.post('/:id/archive', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({ where: { id: req.params.id, proprietaire_id: req.user.id } });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    if (fs.existsSync(doc.chemin)) {
      try {
        const result = await storage.uploadArchivedFile(doc.chemin, req.user.id);
        if (result.url) {
          await doc.update({ url: result.url, firebase_path: result.cloudPath });
        }
      } catch (e) { logger.error('Erreur compression archivage:', e); }
    }

    doc.statut = 'archive';
    await doc.save();
    
    logActivity({
      userId: req.user.id,
      action: 'document_archivé',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" archivé`,
      req
    });
    
    logger.info(`Document archivé: ${doc.titre}`);
    res.json({ message: 'Document archivé', document: doc });
  } catch (error) {
    logger.error('Erreur archive:', error);
    res.status(500).json({ message: 'Erreur archivage' });
  }
});

router.post('/:id/unarchive', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({ where: { id: req.params.id, proprietaire_id: req.user.id } });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });
    doc.statut = 'actif';
    await doc.save();
    
    logActivity({
      userId: req.user.id,
      action: 'document_désarchivé',
      cibleType: 'document',
      cibleId: doc.id,
      description: `Document "${doc.titre}" désarchivé`,
      req
    });
    
    logger.info(`Document désarchivé: ${doc.titre}`);
    res.json({ message: 'Document désarchivé', document: doc });
  } catch (error) {
    logger.error('Erreur unarchive:', error);
    res.status(500).json({ message: 'Erreur désarchivage' });
  }
});

module.exports = router;
