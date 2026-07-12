const express = require('express');
const { Op } = require('sequelize');
const { Document, Folder, Tag } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const docIncludes = [
  { model: Folder, as: 'dossier', attributes: ['id', 'nom'] },
  { model: Tag, as: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } }
];

router.get('/', auth, async (req, res) => {
  try {
    const { q, type, tag, dateDebut, dateFin, dossier, page = 1, limit = 20 } = req.query;
    const where = { proprietaire_id: req.user.id, statut: 'actif' };

    if (q) {
      where[Op.or] = [
        { titre: { [Op.iLike]: `%${q}%` } },
        { description: { [Op.iLike]: `%${q}%` } },
        { nom_original: { [Op.iLike]: `%${q}%` } }
      ];
    }

    if (type) where.type_fichier = { [Op.iLike]: `%${type}%` };
    if (dossier !== undefined) where.dossier_id = dossier === 'null' ? null : dossier;

    if (dateDebut || dateFin) {
      where.createdAt = {};
      if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
      if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const includeOpts = [...docIncludes];
    if (tag) {
      includeOpts.push({
        model: Tag, as: 'tags',
        where: { id: parseInt(tag) || 0 },
        through: { attributes: [] },
        required: true
      });
    }
    const { rows: documents, count: total } = await Document.findAndCountAll({
      where,
      include: includeOpts,
      order: [['createdAt', 'DESC']],
      distinct: true,
      offset,
      limit: parseInt(limit)
    });

    let folders = [];
    if (q) {
      folders = await Folder.findAll({
        where: {
          proprietaire_id: req.user.id,
          nom: { [Op.iLike]: `%${q}%` }
        },
        limit: 5
      });
    }

    res.json({
      documents,
      folders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    logger.error('Erreur recherche:', error);
    res.status(500).json({ message: 'Erreur recherche' });
  }
});

module.exports = router;
