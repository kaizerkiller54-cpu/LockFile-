const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const { getClient, getAuthClient } = require('../config/supabase');
const logger = require('../utils/logger');

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );
};

router.post('/register', [
  body('username').trim().isLength({ min: 3 }).withMessage('Username doit contenir au moins 3 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 6 }).withMessage('Mot de passe doit contenir au moins 6 caractères'),
  body('nom').trim().notEmpty().withMessage('Nom requis'),
  body('prenom').trim().notEmpty().withMessage('Prénom requis'),
  body('type').isIn(['particulier', 'organisation']).withMessage('Type invalide'),
  body('nombre_employes').if(body('type').equals('organisation')).isInt({ min: 1 }).withMessage('Nombre d\'employés requis pour une organisation')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { username, email, password, nom, prenom, type, nombre_employes } = req.body;
    const existingUser = await User.findOne({
      where: { [Op.or]: [{ email }, { username }] }
    });
    if (existingUser) {
      return res.status(400).json({ message: 'Email ou username déjà utilisé' });
    }

    const supabase = getClient();
    const { data: sbData, error: sbError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { nom, prenom, username }
    });
    if (sbError) {
      logger.error('Erreur création Supabase Auth:', sbError);
      return res.status(500).json({ message: 'Erreur création compte' });
    }

    const user = await User.create({
      username, email,
      supabase_id: sbData.user.id,
      nom, prenom,
      type: type || 'particulier',
      nombre_employes: type === 'organisation' ? nombre_employes : null
    });
    const token = generateToken(user);
    logger.info(`Nouvel utilisateur créé: ${username} (Supabase Auth)`);
    res.status(201).json({ token, user: user.toJSON() });
  } catch (error) {
    logger.error('Erreur register:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Mot de passe requis')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    if (!user.actif) return res.status(403).json({ message: 'Compte désactivé' });

    let authenticated = false;

    if (user.supabase_id) {
      const authClient = getAuthClient();
      if (authClient) {
        const { error: sbError } = await authClient.auth.signInWithPassword({ email, password });
        authenticated = !sbError;
        if (sbError) logger.warn('Supabase Auth login échec:', sbError.message);
      }
    }

    if (!authenticated && user.password) {
      authenticated = await user.comparePassword(password);
      if (authenticated) {
        try {
          const supabase = getClient();
          const { data: sbData, error: sbError } = await supabase.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { nom: user.nom, prenom: user.prenom, username: user.username }
          });
          if (!sbError) {
            user.supabase_id = sbData.user.id;
            await user.save();
            logger.info(`Utilisateur migré vers Supabase Auth: ${user.username}`);
          }
        } catch (e) { logger.warn('Migration Supabase échouée:', e.message); }
      }
    }

    if (!authenticated) return res.status(401).json({ message: 'Email ou mot de passe incorrect' });

    user.derniere_connexion = new Date();
    await user.save();
    const token = generateToken(user);
    logger.info(`Connexion: ${user.username}`);
    res.json({ token, user: user.toJSON() });
  } catch (error) {
    logger.error('Erreur login:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/me', auth, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

router.put('/profile', auth, async (req, res) => {
  try {
    const updates = ['nom', 'prenom', 'telephone', 'poste', 'langue', 'type', 'nombre_employes', 'preferences'];
    updates.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'preferences') {
          req.user.preferences = { ...req.user.preferences, ...req.body.preferences };
        } else {
          req.user[field] = req.body[field];
        }
      }
    });
    await req.user.save();
    res.json({ user: req.user.toJSON() });
  } catch (error) {
    logger.error('Erreur profile:', error);
    res.status(500).json({ message: 'Erreur mise à jour profil' });
  }
});

router.put('/password', auth, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { currentPassword, newPassword } = req.body;

    if (req.user.supabase_id) {
      const authClient = getAuthClient();
      if (authClient) {
        const { error: signInError } = await authClient.auth.signInWithPassword({
          email: req.user.email, password: currentPassword
        });
        if (signInError) return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }
      const supabase = getClient();
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        req.user.supabase_id, { password: newPassword }
      );
      if (updateError) return res.status(500).json({ message: 'Erreur mise à jour mot de passe' });
    } else {
      if (!(await req.user.comparePassword(currentPassword))) {
        return res.status(400).json({ message: 'Mot de passe actuel incorrect' });
      }
      req.user.password = newPassword;
      await req.user.save();
    }

    res.json({ message: 'Mot de passe mis à jour' });
  } catch (error) {
    logger.error('Erreur password:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
