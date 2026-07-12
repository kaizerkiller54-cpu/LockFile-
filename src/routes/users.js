const express = require('express');
const { Op } = require('sequelize');
const { User } = require('../models');
const { auth, checkRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/', auth, checkRole('admin'), async (req, res) => {
  try {
    const { username, email, password, nom, prenom, role, type, nombre_employes } = req.body;
    if (!username || !email || !password || !nom || !prenom) {
      return res.status(400).json({ message: 'Champs requis manquants' });
    }
    const existing = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (existing) {
      return res.status(400).json({ message: 'Email ou nom d\'utilisateur déjà utilisé' });
    }
    const user = await User.create({
      username, email, password, nom, prenom,
      role: role || 'utilisateur',
      type: type || 'particulier',
      nombre_employes: type === 'organisation' ? (nombre_employes || null) : null
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
