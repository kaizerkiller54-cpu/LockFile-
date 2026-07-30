const express = require('express');

const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const { Document, Folder, Tag, Version, Notification, Permission, sequelize } = require('../models');
const { auth } = require('../middleware/auth');
const upload = require('../middleware/upload');
const logger = require('../utils/logger');
const { encryptFile, decryptFile, decompressBuffer } = require('../utils/crypto');
const { sanitizeString, sanitizeOptional, sanitizeTags } = require('../utils/sanitize');
const storage = require('../utils/storage');
const { logActivity } = require('../middleware/activityLogger');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Check if user can access document (owner or has ecriture permission)
async function canModifyDoc(docId, userId, include) {
  let doc = await Document.findOne({
    where: { id: docId, proprietaire_id: userId },
    include
  });
  if (doc) return doc;
  const perm = await Permission.findOne({
    where: { document_id: docId, utilisateur_id: userId, niveau: 'ecriture' }
  });
  if (perm) return await Document.findByPk(docId, { include });
  return null;
}

const docIncludes = [
  { model: Folder, as: 'dossier', attributes: ['id', 'nom'] },
  { model: Tag, as: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } }
];

router.get('/', auth, async (req, res) => {
  try {
    const { dossier, statut, favori, tag, page = 1, limit = 20 } = req.query;

    const where = { statut: statut || 'actif' };
    if (dossier !== undefined) where.dossier_id = dossier === 'null' ? null : dossier;
    if (favori === 'true') {
      where.proprietaire_id = req.user.id;
      where.favori = true;
    } else {
      const sharedIds = (await Permission.findAll({
        attributes: ['document_id'],
        where: { utilisateur_id: req.user.id, document_id: { [Op.ne]: null } },
        raw: true
      })).map(p => p.document_id).filter(Boolean);
      where[Op.or] = [
        { proprietaire_id: req.user.id },
        { id: sharedIds }
      ];
    }

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

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: documents, count: total } = await Document.findAndCountAll({
      where,
      include,
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
      distinct: true
    });
    res.json({ documents, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    logger.error('Erreur liste documents:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/recent', auth, async (req, res) => {
  try {
    const sharedIds = await Permission.findAll({
      attributes: ['document_id'],
      where: { utilisateur_id: req.user.id, document_id: { [Op.ne]: null } },
      raw: true
    });
    const sharedDocIds = sharedIds.map(p => p.document_id).filter(Boolean);

    const documents = await Document.findAll({
      where: {
        statut: 'actif',
        [Op.or]: [
          { proprietaire_id: req.user.id },
          { id: sharedDocIds }
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
    const sharedIds = (await Permission.findAll({
      attributes: ['document_id'],
      where: { utilisateur_id: userId, document_id: { [Op.ne]: null } },
      raw: true
    })).map(p => p.document_id).filter(Boolean);

    const accessFilter = {
      [Op.or]: [
        { proprietaire_id: userId },
        { id: sharedIds }
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

router.get('/:id', auth, async (req, res) => {
  try {
    const doc = await canModifyDoc(req.params.id, req.user.id, docIncludes);
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
  body('tags').optional().isArray().withMessage('Tags doit être un tableau'),
  body('favori').optional().isBoolean().withMessage('Favori doit être un booléen'),
  body('commentaire').optional().trim().isLength({ max: 500 }).withMessage('Commentaire trop long'),
  body('date_expiration').optional({ values: 'falsy' }).isISO8601().withMessage('Date d\'expiration invalide'),
  body('jours_alerte').optional().isInt({ min: 1, max: 365 }).withMessage('Jours d\'alerte: 1-365'),
];

router.post('/', auth, upload.single('fichier'), validateDocInput, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { dossier, tags } = req.body;
    const titre = sanitizeString(req.body.titre) || req.file.originalname.replace(/\.[^/.]+$/, '');
    const description = sanitizeString(req.body.description) || '';
    const tagIds = sanitizeTags(tags);
    const dateExpiration = req.body.date_expiration || null;
    const joursAlerte = parseInt(req.body.jours_alerte) || 30;

    const docData = {
      titre,
      description,
      nom_fichier: req.file.filename,
      nom_original: req.file.originalname,
      type_fichier: req.file.mimetype,
      taille: req.file.size,
      chemin: req.file.path,
      proprietaire_id: req.user.id,
      dossier_id: dossier || null,
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

router.put('/:id', auth, upload.single('fichier'), validateDocInput, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doc = await canModifyDoc(req.params.id, req.user.id);
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    if (req.body.titre !== undefined) doc.titre = sanitizeString(req.body.titre);
    if (req.body.description !== undefined) doc.description = sanitizeString(req.body.description);
    if (req.body.dossier !== undefined) doc.dossier_id = req.body.dossier || null;
    if (req.body.favori !== undefined) doc.favori = req.body.favori === 'true' || req.body.favori === true;
    if (req.body.date_expiration !== undefined) doc.date_expiration = req.body.date_expiration || null;
    if (req.body.jours_alerte !== undefined) doc.jours_alerte = parseInt(req.body.jours_alerte) || 30;

    if (req.body.tags) {
      const tagIds = sanitizeTags(req.body.tags);
      await doc.setTags(tagIds);
    }

    if (req.file) {
      doc.nom_fichier = req.file.filename;
      doc.nom_original = req.file.originalname;
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

router.get('/:id/versions', auth, async (req, res) => {
  try {
    const doc = await canModifyDoc(req.params.id, req.user.id);
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

router.get('/download/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const doc = await Document.findOne({
      where: { id: req.params.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const isOwner = doc.proprietaire_id === userId;
    const perm = isOwner ? null : await Permission.findOne({
      where: { document_id: doc.id, utilisateur_id: userId }
    });
    if (!isOwner && !perm) return res.status(403).json({ message: 'Accès non autorisé' });

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

    const filePath = path.resolve(doc.chemin);
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

module.exports = router;
