const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Folder, Document } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sanitizeString, sanitizeOptional } = require('../utils/sanitize');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { parent } = req.query;
    const where = { proprietaire_id: req.user.id };
    if (parent === 'null' || !parent) where.parent_id = null;
    else where.parent_id = parent;

    const [folders, docCounts] = await Promise.all([
      Folder.findAll({ where, order: [['nom', 'ASC']] }),
      Document.findAll({
        attributes: ['dossier_id', [Document.sequelize.fn('COUNT', Document.sequelize.col('id')), 'count']],
        where: { proprietaire_id: req.user.id, statut: 'actif', dossier_id: { [Op.ne]: null } },
        group: ['dossier_id'],
        raw: true
      })
    ]);

    const countMap = {};
    docCounts.forEach(r => { countMap[r.dossier_id] = parseInt(r.count); });

    const foldersWithCount = folders.map(f => ({
      ...f.toJSON(),
      documentCount: countMap[f.id] || 0
    }));
    res.json({ folders: foldersWithCount });
  } catch (error) {
    logger.error('Erreur liste dossiers:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/tree', auth, async (req, res) => {
  try {
    const folders = await Folder.findAll({
      where: { proprietaire_id: req.user.id },
      order: [['nom', 'ASC']],
      raw: true
    });

    const buildTree = (parentId = null) =>
      folders
        .filter(f => String(f.parent_id || null) === String(parentId))
        .map(f => ({ ...f, children: buildTree(f.id) }));

    res.json({ tree: buildTree() });
  } catch (error) {
    logger.error('Erreur tree:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

const folderFields = [
  body('nom').trim().notEmpty().isLength({ max: 100 }).withMessage('Nom du dossier requis (max 100)'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description trop longue'),
  body('couleur').optional().matches(/^#[0-9a-f]{6}$/i).withMessage('Couleur invalide'),
  body('icone').optional().trim().isLength({ max: 50 }).withMessage('Icône trop longue'),
  body('parent').optional({ values: 'falsy' }).isInt().withMessage('Parent invalide'),
];

router.post('/', auth, folderFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const nom = sanitizeString(req.body.nom);
    const description = sanitizeOptional(req.body.description);
    const couleur = req.body.couleur || '#4f46e5';
    const icone = req.body.icone || 'folder';
    const folder = await Folder.create({
      nom,
      description: description || '',
      parent_id: req.body.parent || null,
      couleur,
      icone,
      proprietaire_id: req.user.id
    });
    logger.info(`Dossier créé: ${folder.nom} par ${req.user.username}`);
    res.status(201).json({ folder });
  } catch (error) {
    logger.error('Erreur create folder:', error);
    res.status(500).json({ message: 'Erreur création dossier' });
  }
});

router.put('/:id', auth, folderFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const folder = await Folder.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!folder) return res.status(404).json({ message: 'Dossier non trouvé' });

    if (req.body.nom !== undefined) folder.nom = sanitizeString(req.body.nom);
    if (req.body.description !== undefined) folder.description = sanitizeString(req.body.description);
    if (req.body.couleur !== undefined) folder.couleur = req.body.couleur;
    if (req.body.icone !== undefined) folder.icone = sanitizeString(req.body.icone);
    if (req.body.parent !== undefined) folder.parent_id = req.body.parent || null;

    await folder.save();
    res.json({ folder });
  } catch (error) {
    logger.error('Erreur update folder:', error);
    res.status(500).json({ message: 'Erreur mise à jour dossier' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!folder) return res.status(404).json({ message: 'Dossier non trouvé' });

    await Document.update({ dossier_id: null }, { where: { dossier_id: folder.id } });
    await Folder.update(
      { parent_id: folder.parent_id },
      { where: { parent_id: folder.id } }
    );
    await folder.destroy();

    logger.info(`Dossier supprimé: ${folder.nom} par ${req.user.username}`);
    res.json({ message: 'Dossier supprimé' });
  } catch (error) {
    logger.error('Erreur delete folder:', error);
    res.status(500).json({ message: 'Erreur suppression dossier' });
  }
});

module.exports = router;
