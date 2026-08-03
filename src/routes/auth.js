const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const { ISSUER, AUDIENCE } = require('../config/jwt');
const { getClient, getAuthClient } = require('../config/supabase');
const logger = require('../utils/logger');
const { sanitizeString } = require('../utils/sanitize');
const { passwordPolicy } = require('../middleware/security');
const { logActivity } = require('../middleware/activityLogger');

const router = express.Router();

const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h', issuer: ISSUER, audience: AUDIENCE }
  );
};

router.post('/register', [
  body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username: 3-30 caractères'),
  body('email').isEmail().normalizeEmail().withMessage('Email invalide'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Mot de passe: 8-128 caractères'),
  body('nom').trim().notEmpty().isLength({ max: 100 }).withMessage('Nom requis (max 100)'),
  body('prenom').trim().notEmpty().isLength({ max: 100 }).withMessage('Prénom requis (max 100)'),
  body('type').isIn(['particulier', 'organisation']).withMessage('Type invalide'),
  body('nombre_employes').if(body('type').equals('organisation')).isInt({ min: 1 }).withMessage('Nombre d\'employés requis'),
  body('telephone').optional().trim().isLength({ max: 20 }).withMessage('Téléphone trop long'),
  body('poste').optional().trim().isLength({ max: 100 }).withMessage('Poste trop long'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const pwErrors = passwordPolicy(req.body.password);
    if (pwErrors.length) {
      return res.status(400).json({ errors: pwErrors.map(e => ({ msg: e })) });
    }
    const { email, password, type, nombre_employes } = req.body;
    const username = sanitizeString(req.body.username);
    const nom = sanitizeString(req.body.nom);
    const prenom = sanitizeString(req.body.prenom);
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
    
    logActivity({
      userId: user.id,
      action: 'inscription',
      cibleType: 'user',
      cibleId: user.id,
      description: `Nouvel utilisateur créé: ${username}`,
      req
    });
    
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
    
    logActivity({
      userId: user.id,
      action: 'connexion',
      cibleType: 'user',
      cibleId: user.id,
      description: `Connexion réussie: ${user.username}`,
      req
    });
    
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

router.put('/profile', auth, [
  body('nom').optional().trim().isLength({ max: 100 }).withMessage('Nom trop long'),
  body('prenom').optional().trim().isLength({ max: 100 }).withMessage('Prénom trop long'),
  body('telephone').optional().trim().isLength({ max: 20 }).withMessage('Téléphone trop long'),
  body('poste').optional().trim().isLength({ max: 100 }).withMessage('Poste trop long'),
  body('langue').optional().isIn(['fr', 'en', 'es', 'de', 'pt']).withMessage('Langue invalide'),
  body('type').optional().isIn(['particulier', 'organisation']).withMessage('Type invalide'),
  body('nombre_employes').optional().isInt({ min: 1 }).withMessage('Nombre d\'employés invalide'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const sanitized = {};
    ['nom', 'prenom', 'telephone', 'poste'].forEach(f => {
      if (req.body[f] !== undefined) sanitized[f] = sanitizeString(req.body[f]);
    });
    ['langue', 'type', 'nombre_employes'].forEach(f => {
      if (req.body[f] !== undefined) sanitized[f] = req.body[f];
    });
    Object.keys(sanitized).forEach(field => {
      req.user[field] = sanitized[field];
    });
    if (req.body.preferences) {
      req.user.preferences = { ...req.user.preferences, ...req.body.preferences };
    }
    await req.user.save();
    res.json({ user: req.user.toJSON() });
  } catch (error) {
    logger.error('Erreur profile:', error);
    res.status(500).json({ message: 'Erreur mise à jour profil' });
  }
});

router.put('/password', auth, [
  body('currentPassword').notEmpty().withMessage('Mot de passe actuel requis'),
  body('newPassword').isLength({ min: 8, max: 128 }).withMessage('Nouveau mot de passe: 8-128 caractères'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const pwErrors = passwordPolicy(req.body.newPassword);
    if (pwErrors.length) {
      return res.status(400).json({ errors: pwErrors.map(e => ({ msg: e })) });
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
