const express = require('express');
const { Op } = require('sequelize');
const { ActivityLog, User } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, userId, dateDebut, dateFin } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};

    if (req.user.role !== 'admin') {
      where.utilisateur_id = req.user.id;
    } else if (userId) {
      where.utilisateur_id = parseInt(userId);
    }

    if (action) where.action = action;
    if (dateDebut || dateFin) {
      where.createdAt = {};
      if (dateDebut) where.createdAt[Op.gte] = new Date(dateDebut);
      if (dateFin) where.createdAt[Op.lte] = new Date(dateFin);
    }

    const { rows, count } = await ActivityLog.findAndCountAll({
      where,
      include: [{ model: User, as: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'username'] }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
    });

    res.json({
      activities: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    logger.error('Erreur activity log:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/document/:documentId', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await ActivityLog.findAndCountAll({
      where: { cible_type: 'document', cible_id: parseInt(req.params.documentId) },
      include: [{ model: User, as: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'username'] }],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
    });

    res.json({
      activities: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    logger.error('Erreur document activity:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
