const express = require('express');
const { body, validationResult } = require('express-validator');
const { Folder, Document } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { parent } = req.query;
    const where = { proprietaire_id: req.user.id };
    if (parent === 'null' || !parent) where.parent_id = null;
    else where.parent_id = parent;

    const folders = await Folder.findAll({ where, order: [['nom', 'ASC']] });

    const foldersWithCount = await Promise.all(folders.map(async (folder) => {
      const count = await Document.count({
        where: { dossier_id: folder.id, proprietaire_id: req.user.id, statut: 'actif' }
      });
      return { ...folder.toJSON(), documentCount: count };
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

router.post('/', auth, [
  body('nom').trim().notEmpty().withMessage('Nom du dossier requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { nom, description, parent, couleur, icone } = req.body;
    const folder = await Folder.create({
      nom,
      description: description || '',
      parent_id: parent || null,
      couleur: couleur || '#4f46e5',
      icone: icone || 'folder',
      proprietaire_id: req.user.id
    });
    logger.info(`Dossier créé: ${folder.nom} par ${req.user.username}`);
    res.status(201).json({ folder });
  } catch (error) {
    logger.error('Erreur create folder:', error);
    res.status(500).json({ message: 'Erreur création dossier' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!folder) return res.status(404).json({ message: 'Dossier non trouvé' });

    ['nom', 'description', 'couleur', 'icone'].forEach(field => {
      if (req.body[field] !== undefined) folder[field] = req.body[field];
    });
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
