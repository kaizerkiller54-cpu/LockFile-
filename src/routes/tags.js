const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Tag } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const tags = await Tag.findAll({
      where: { proprietaire_id: req.user.id },
      order: [['nom', 'ASC']]
    });
    res.json({ tags });
  } catch (error) {
    logger.error('Erreur liste tags:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

const tagFields = [
  body('nom').trim().notEmpty().isLength({ max: 50 }).withMessage('Nom du tag requis (max 50)'),
  body('couleur').optional().matches(/^#[0-9a-f]{6}$/i).withMessage('Couleur invalide (format hex: #RRGGBB)'),
];

router.post('/', auth, tagFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const nom = sanitizeString(req.body.nom);
    const couleur = req.body.couleur || '#6366f1';
    const existing = await Tag.findOne({
      where: { nom: nom.toLowerCase(), proprietaire_id: req.user.id }
    });
    if (existing) return res.status(400).json({ message: 'Ce tag existe déjà' });

    const tag = await Tag.create({
      nom: nom.toLowerCase(),
      couleur,
      proprietaire_id: req.user.id
    });
    res.status(201).json({ tag });
  } catch (error) {
    logger.error('Erreur create tag:', error);
    res.status(500).json({ message: 'Erreur création tag' });
  }
});

router.put('/:id', auth, tagFields, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tag = await Tag.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!tag) return res.status(404).json({ message: 'Tag non trouvé' });
    if (req.body.nom !== undefined) tag.nom = sanitizeString(req.body.nom).toLowerCase();
    if (req.body.couleur !== undefined) tag.couleur = req.body.couleur;
    await tag.save();
    res.json({ tag });
  } catch (error) {
    logger.error('Erreur update tag:', error);
    res.status(500).json({ message: 'Erreur mise à jour tag' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const tag = await Tag.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!tag) return res.status(404).json({ message: 'Tag non trouvé' });
    await tag.destroy();
    res.json({ message: 'Tag supprimé' });
  } catch (error) {
    logger.error('Erreur delete tag:', error);
    res.status(500).json({ message: 'Erreur suppression tag' });
  }
});

module.exports = router;
