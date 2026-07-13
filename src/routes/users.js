const express = require('express');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User } = require('../models');
const { auth, checkRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sanitizeString } = require('../utils/sanitize');

const router = express.Router();

router.post('/', auth, checkRole('admin'), [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username: 3-30 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe: min 6 caractères'),
  body('nom').trim().notEmpty().isLength({ max: 100 }).withMessage('Nom requis'),
  body('prenom').trim().notEmpty().isLength({ max: 100 }).withMessage('Prénom requis'),
  body('role').optional().isIn(['admin', 'utilisateur', 'lecteur']).withMessage('Rôle invalide'),
  body('type').optional().isIn(['particulier', 'organisation']).withMessage('Type invalide'),
  body('nombre_employes').if(body('type').equals('organisation')).isInt({ min: 1 }).withMessage('Nombre d\'employés requis'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const username = sanitizeString(req.body.username);
    const email = req.body.email;
    const password = req.body.password;
    const nom = sanitizeString(req.body.nom);
    const prenom = sanitizeString(req.body.prenom);
    const role = req.body.role || 'utilisateur';
    const type = req.body.type || 'particulier';
    const nombre_employes = type === 'organisation' ? (req.body.nombre_employes || null) : null;

    const existing = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (existing) {
      return res.status(400).json({ message: 'Email ou nom d\'utilisateur déjà utilisé' });
    }
    const user = await User.create({
      username, email, password, nom, prenom,
      role,
      type,
      nombre_employes
    });
    logger.info(`Admin ${req.user.username} a créé l'utilisateur: ${username}`);
    res.status(201).json({ user: user.toJSON() });
  } catch (error) {
    logger.error('Erreur création utilisateur:', error);
    res.status(500).json({ message: 'Erreur création utilisateur' });
  }
});

router.get('/', auth, checkRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows: users, count: total } = await User.findAndCountAll({
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });
    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    logger.error('Erreur liste users:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id/role', auth, checkRole('admin'), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['admin', 'utilisateur', 'lecteur'].includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide' });
    }
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.role = role;
    await user.save();
    logger.info(`Rôle mis à jour: ${user.username} -> ${role}`);
    res.json({ user: user.toJSON() });
  } catch (error) {
    logger.error('Erreur update role:', error);
    res.status(500).json({ message: 'Erreur mise à jour rôle' });
  }
});

router.put('/:id/toggle-active', auth, checkRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    user.actif = !user.actif;
    await user.save();
    res.json({ user: user.toJSON() });
  } catch (error) {
    logger.error('Erreur toggle active:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', auth, checkRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    await user.destroy();
    logger.info(`Utilisateur supprimé: ${user.username}`);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    logger.error('Erreur delete user:', error);
    res.status(500).json({ message: 'Erreur suppression' });
  }
});

module.exports = router;
