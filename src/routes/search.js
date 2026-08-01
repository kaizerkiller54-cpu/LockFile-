const express = require('express');
const { Op, Sequelize } = require('sequelize');
const { Document, Folder, Tag } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const docIncludes = [
  { model: Folder, as: 'dossier', attributes: ['id', 'nom'] },
  { model: Tag, as: 'tags', attributes: ['id', 'nom', 'couleur'], through: { attributes: [] } }
];

// Documents accessibles à l'utilisateur : les siens + ceux partagés
// directement (document) ou via un dossier partagé
function accessCondition(userId) {
  return {
    [Op.or]: [
      { proprietaire_id: userId },
      { id: { [Op.in]: Sequelize.literal(`(SELECT "document_id" FROM "permissions" WHERE "utilisateur_id" = ${userId} AND "document_id" IS NOT NULL)`) } },
      { dossier_id: { [Op.in]: Sequelize.literal(`(SELECT "dossier_id" FROM "permissions" WHERE "utilisateur_id" = ${userId} AND "dossier_id" IS NOT NULL)`) } }
    ]
  };
}

// GET /api/search/suggestions - Live autocomplete suggestions
router.get('/suggestions', auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ documents: [], folders: [] });
    }

    const queryStr = q.trim();
    const tokens = queryStr.split(/\s+/).filter(Boolean);

    // Build conditions for each token
    const tokenConditions = tokens.map(token => ({
      [Op.or]: [
        { titre: { [Op.iLike]: `%${token}%` } },
        { nom_original: { [Op.iLike]: `%${token}%` } },
        { description: { [Op.iLike]: `%${token}%` } }
      ]
    }));

    const docWhere = {
      statut: 'actif',
      [Op.and]: tokenConditions,
      ...accessCondition(req.user.id)
    };

    const documents = await Document.findAll({
      where: docWhere,
      include: docIncludes,
      limit: 7,
      order: [
        // Prioritize exact or prefix matches on titre
        [Document.sequelize.literal(`CASE WHEN LOWER("titre") LIKE LOWER('${queryStr.replace(/'/g, "''")}%') THEN 0 ELSE 1 END`), 'ASC'],
        ['createdAt', 'DESC']
      ]
    });

    const folderConditions = tokens.map(token => ({
      nom: { [Op.iLike]: `%${token}%` }
    }));

    const folders = await Folder.findAll({
      where: {
        proprietaire_id: req.user.id,
        [Op.and]: folderConditions
      },
      limit: 3
    });

    res.json({ documents, folders });
  } catch (error) {
    logger.error('Erreur suggestions recherche:', error);
    res.status(500).json({ message: 'Erreur suggestions' });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { q, type, tag, dateDebut, dateFin, dossier, page = 1, limit = 20 } = req.query;
    const where = { statut: 'actif', ...accessCondition(req.user.id) };

    if (q && q.trim()) {
      const queryStr = q.trim();
      const tokens = queryStr.split(/\s+/).filter(Boolean);
      where[Op.and] = tokens.map(token => ({
        [Op.or]: [
          { titre: { [Op.iLike]: `%${token}%` } },
          { description: { [Op.iLike]: `%${token}%` } },
          { nom_original: { [Op.iLike]: `%${token}%` } }
        ]
      }));
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

    const cleanQ = q ? q.trim().replace(/'/g, "''") : '';
    const orderClause = cleanQ
      ? [
          [Document.sequelize.literal(`CASE WHEN LOWER("titre") LIKE LOWER('${cleanQ}%') THEN 0 ELSE 1 END`), 'ASC'],
          ['createdAt', 'DESC']
        ]
      : [['createdAt', 'DESC']];

    const { rows: documents, count: total } = await Document.findAndCountAll({
      where,
      include: includeOpts,
      order: orderClause,
      distinct: true,
      offset,
      limit: parseInt(limit)
    });

    let folders = [];
    if (q && q.trim()) {
      const tokens = q.trim().split(/\s+/).filter(Boolean);
      folders = await Folder.findAll({
        where: {
          proprietaire_id: req.user.id,
          [Op.and]: tokens.map(t => ({ nom: { [Op.iLike]: `%${t}%` } }))
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
