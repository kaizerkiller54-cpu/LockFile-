const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Document, Folder, Permission, Notification, User, sequelize } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const MAX_SHARES_PER_RESOURCE = 200;
const DEFAULT_PAGE_LIMIT = 50;

const shareUserFields = [
  body('email').optional().isEmail().normalizeEmail().withMessage('Email invalide'),
  body('username').optional().trim().notEmpty().withMessage('Nom d\'utilisateur requis'),
  body('niveau').isIn(['lecture', 'ecriture']).withMessage('Niveau: lecture ou ecriture'),
  body('expiration').optional().isISO8601().withMessage('Date d\'expiration invalide'),
  body('mot_de_passe').optional().trim().isLength({ min: 4, max: 100 }).withMessage('Mot de passe: 4-100 caractères'),
];

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || DEFAULT_PAGE_LIMIT));
  return { offset: (page - 1) * limit, limit, page };
}

function permissionResponse(perm) {
  return {
    id: perm.id,
    niveau: perm.niveau,
    expiration: perm.expiration,
    date_partage: perm.createdAt,
    utilisateur: perm.utilisateur ? { id: perm.utilisateur.id, nom: perm.utilisateur.nom, prenom: perm.utilisateur.prenom, email: perm.utilisateur.email, username: perm.utilisateur.username } : null,
    accorde_par: perm.accorde_par ? { id: perm.accorde_par.id, nom: perm.accorde_par.nom, prenom: perm.accorde_par.prenom, email: perm.accorde_par.email, username: perm.accorde_par.username } : null,
  };
}

// ─── Helpers ───

async function findTargetUser(email, username) {
  if (!email && !username) return null;
  const clauses = [];
  if (email) clauses.push({ email });
  if (username) clauses.push({ username });
  return User.findOne({ where: { [Op.or]: clauses }, attributes: ['id', 'nom', 'prenom', 'email', 'username'] });
}

async function checkDuplicatePermission(entityField, entityId, userId) {
  const where = { utilisateur_id: userId };
  where[entityField] = entityId;
  return Permission.findOne({ where });
}

async function enforceShareLimit(entityField, entityId) {
  const where = {};
  where[entityField] = entityId;
  const count = await Permission.count({ where });
  if (count >= MAX_SHARES_PER_RESOURCE) {
    const err = new Error('Limite de partages atteinte pour cette ressource');
    err.status = 429;
    throw err;
  }
}

async function createShare(entity, entityType, req) {
  const { email, username, niveau, expiration } = req.body;
  if (!email && !username) {
    return { status: 400, json: { message: 'Email ou nom d\'utilisateur requis' } };
  }

  const targetUser = await findTargetUser(email, username);
  if (!targetUser) return { status: 404, json: { message: 'Utilisateur non trouvé' } };
  if (targetUser.id === req.user.id) return { status: 400, json: { message: 'Vous ne pouvez pas partager avec vous-même' } };

  const entityField = entityType === 'document' ? 'document_id' : 'dossier_id';
  const existing = await checkDuplicatePermission(entityField, entity.id, targetUser.id);
  if (existing) return { status: 409, json: { message: 'Ce partage existe déjà' } };

  await enforceShareLimit(entityField, entity.id);

  const permData = {
    utilisateur_id: targetUser.id,
    niveau,
    accorde_par_id: req.user.id,
    [entityField]: entity.id,
  };
  if (expiration) permData.expiration = new Date(expiration);

  const label = entityType === 'document' ? entity.titre : entity.nom;
  const typeLabel = entityType === 'document' ? 'Document' : 'Dossier';
  const link = entityType === 'document' ? `/documents/${entity.id}` : `/dossiers/${entity.id}`;

  const txn = await sequelize.transaction();
  try {
    const permission = await Permission.create(permData, { transaction: txn });

    await Notification.create({
      destinataire_id: targetUser.id,
      type: 'partage_recu',
      titre: `${typeLabel} partagé`,
      message: `${req.user.nom} ${req.user.prenom} a partagé le ${typeLabel.toLowerCase()} "${label}" avec vous (${niveau === 'ecriture' ? 'modification' : 'lecture'})`,
      lien: link,
    }, { transaction: txn });

    if (entityType === 'document') {
      await entity.update({ est_partage: true }, { transaction: txn });
    }

    await txn.commit();
    logger.info(`${typeLabel} partagé: ${label} par ${req.user.username} → ${targetUser.username}`);
    return { status: 201, json: { permission: permissionResponse({ ...permission.toJSON(), utilisateur: targetUser, accorde_par: req.user }) } };
  } catch (error) {
    await txn.rollback();
    throw error;
  }
}

// ─── PARTAGE DOCUMENTS ───

router.post('/documents/:id/share', auth, shareUserFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id },
      attributes: ['id', 'titre', 'est_partage']
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const result = await createShare(doc, 'document', req);
    res.status(result.status).json(result.json);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    logger.error('Erreur share document:', error);
    res.status(500).json({ message: 'Erreur partage' });
  }
});

router.delete('/documents/:id/share/:permissionId', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const permission = await Permission.findOne({
      where: { id: req.params.permissionId, document_id: req.params.id }
    });
    if (!permission) return res.status(404).json({ message: 'Permission non trouvée' });

    await permission.destroy();

    const remaining = await Permission.count({ where: { document_id: req.params.id } });
    if (remaining === 0) {
      await Document.update({ est_partage: false }, { where: { id: req.params.id } });
    }

    res.json({ message: 'Partage révoqué' });
  } catch (error) {
    logger.error('Erreur revoke share:', error);
    res.status(500).json({ message: 'Erreur révocation' });
  }
});

// ─── PARTAGE DOSSIERS ───

router.post('/folders/:id/share', auth, shareUserFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const folder = await Folder.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id },
      attributes: ['id', 'nom']
    });
    if (!folder) return res.status(404).json({ message: 'Dossier non trouvé' });

    const result = await createShare(folder, 'folder', req);
    res.status(result.status).json(result.json);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    logger.error('Erreur share folder:', error);
    res.status(500).json({ message: 'Erreur partage' });
  }
});

router.delete('/folders/:id/share/:permissionId', auth, async (req, res) => {
  try {
    const folder = await Folder.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!folder) return res.status(404).json({ message: 'Dossier non trouvé' });

    const permission = await Permission.findOne({
      where: { id: req.params.permissionId, dossier_id: req.params.id }
    });
    if (!permission) return res.status(404).json({ message: 'Permission non trouvée' });

    await permission.destroy();
    res.json({ message: 'Partage révoqué' });
  } catch (error) {
    logger.error('Erreur revoke folder share:', error);
    res.status(500).json({ message: 'Erreur révocation' });
  }
});

// ─── CONSULTATION PAGINÉE ───

router.get('/shared-with-me', auth, async (req, res) => {
  try {
    const { offset, limit, page } = parsePagination(req.query);

    const { rows, count: total } = await Permission.findAndCountAll({
      where: { utilisateur_id: req.user.id },
      include: [
        { model: Document, as: 'document', attributes: ['id', 'titre', 'statut', 'type_fichier', 'taille', 'createdAt'], required: false },
        { model: Folder, as: 'dossier', attributes: ['id', 'nom', 'couleur'], required: false },
        { model: User, as: 'accorde_par', attributes: ['id', 'nom', 'prenom', 'email', 'username'] }
      ],
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    const documents = rows.filter(p => p.document && p.document.statut === 'actif').map(p => ({
      type: 'document',
      element: p.document,
      permission: p.niveau,
      partage_par: p.accorde_par,
      date_partage: p.createdAt
    }));

    const dossiers = rows.filter(p => p.dossier).map(p => ({
      type: 'dossier',
      element: p.dossier,
      permission: p.niveau,
      partage_par: p.accorde_par,
      date_partage: p.createdAt
    }));

    res.json({
      documents, dossiers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Erreur shared with me:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/shared-by-me', auth, async (req, res) => {
  try {
    const { offset, limit, page } = parsePagination(req.query);

    const { rows, count: total } = await Permission.findAndCountAll({
      where: { accorde_par_id: req.user.id },
      include: [
        { model: Document, as: 'document', attributes: ['id', 'titre', 'statut', 'type_fichier'], required: false },
        { model: Folder, as: 'dossier', attributes: ['id', 'nom', 'couleur'], required: false },
        { model: User, as: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'email', 'username'] }
      ],
      order: [['createdAt', 'DESC']],
      offset,
      limit,
    });

    const items = rows.map(p => ({
      permission_id: p.id,
      type: p.document_id ? 'document' : 'dossier',
      element: p.document || p.dossier,
      utilisateur: p.utilisateur,
      niveau: p.niveau,
      date_partage: p.createdAt,
      expiration: p.expiration
    }));

    res.json({
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Erreur shared by me:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ─── LIEN PUBLIC ───

router.post('/documents/:id/link', auth, [
  body('niveau').isIn(['lecture', 'ecriture']).withMessage('Niveau: lecture ou ecriture'),
  body('expiration').optional().isISO8601().withMessage('Date d\'expiration invalide'),
  body('mot_de_passe').optional().trim().isLength({ min: 4, max: 100 }).withMessage('Mot de passe: 4-100 caractères'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id },
      attributes: ['id', 'titre', 'est_partage']
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const txn = await sequelize.transaction();
    try {
      const permData = {
        document_id: doc.id,
        niveau: req.body.niveau,
        accorde_par_id: req.user.id,
        lien_partage: uuidv4(),
        expiration: req.body.expiration ? new Date(req.body.expiration) : null,
      };
      if (req.body.mot_de_passe) {
        const bcrypt = require('bcryptjs');
        permData.mot_de_passe = await bcrypt.hash(req.body.mot_de_passe, 10);
      }

      const permission = await Permission.create(permData, { transaction: txn });

      await doc.update({ est_partage: true }, { transaction: txn });
      await txn.commit();

      const link = `${req.protocol}://${req.get('host')}/api/sharing/access/${permission.lien_partage}`;
      res.status(201).json({
        permission: permissionResponse(permission.toJSON()),
        lien: link,
        protege: !!req.body.mot_de_passe
      });
    } catch (error) {
      await txn.rollback();
      throw error;
    }
  } catch (error) {
    logger.error('Erreur create link:', error);
    res.status(500).json({ message: 'Erreur création lien' });
  }
});

router.get('/access/:link', async (req, res) => {
  try {
    const permission = await Permission.findOne({
      where: {
        lien_partage: req.params.link,
        [Op.or]: [
          { expiration: null },
          { expiration: { [Op.gte]: new Date() } }
        ]
      },
      include: [{ model: Document, as: 'document', attributes: ['id', 'titre', 'type_fichier', 'taille'] }]
    });
    if (!permission || !permission.document) {
      return res.status(404).json({ message: 'Lien invalide ou expiré' });
    }

    const protege = !!permission.mot_de_passe;
    if (protege) {
      if (!req.query.password) {
        return res.json({
          document: { id: permission.document.id, titre: 'Document protégé' },
          niveau: permission.niveau,
          protege: true
        });
      }
      const bcrypt = require('bcryptjs');
      const valid = await bcrypt.compare(req.query.password, permission.mot_de_passe);
      if (!valid) return res.status(403).json({ message: 'Mot de passe incorrect' });
    }

    res.json({ document: permission.document, niveau: permission.niveau, protege });
  } catch (error) {
    logger.error('Erreur access link:', error);
    res.status(500).json({ message: 'Erreur accès' });
  }
});

module.exports = router;
