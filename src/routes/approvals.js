const express = require('express');
const { body, validationResult } = require('express-validator');
const { Document, Approval, User, Notification } = require('../models');
const { auth } = require('../middleware/auth');
const { logActivity } = require('../middleware/activityLogger');
const logger = require('../utils/logger');

const router = express.Router();

// Only organizations can use approvals
const requireOrg = (req, res, next) => {
  if (req.user.type !== 'organisation') {
    return res.status(403).json({ message: 'Approbations réservées aux organisations' });
  }
  next();
};

// Create approval request
router.post('/documents/:id/approve', auth, requireOrg, [
  body('approbateur_id').isInt().withMessage('Approbateur requis'),
  body('priorite').optional().isIn(['normale', 'haute', 'urgente']).withMessage('Priorité invalide'),
  body('commentaire').optional().trim().isLength({ max: 2000 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    if (parseInt(req.body.approbateur_id) === req.user.id) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous auto-approuver' });
    }

    const approbateur = await User.findByPk(req.body.approbateur_id, {
      attributes: ['id', 'nom', 'prenom', 'email', 'type', 'actif']
    });
    if (!approbateur || !approbateur.actif) return res.status(404).json({ message: 'Approbateur non trouvé' });
    if (approbateur.type !== 'organisation') {
      return res.status(400).json({ message: 'L\'approbateur doit appartenir à une organisation' });
    }

    const existing = await Approval.findOne({
      where: { document_id: doc.id, approbateur_id: req.body.approbateur_id, statut: 'en_attente' }
    });
    if (existing) return res.status(409).json({ message: 'Demande déjà en cours pour cet approbateur' });

    const approval = await Approval.create({
      document_id: doc.id,
      demandeur_id: req.user.id,
      approbateur_id: parseInt(req.body.approbateur_id),
      priorite: req.body.priorite || 'normale',
      commentaire: req.body.commentaire || '',
    });

    await Notification.create({
      destinataire_id: req.body.approbateur_id,
      type: 'partage_recu',
      titre: 'Demande d\'approbation',
      message: `${req.user.prenom} ${req.user.nom} vous demande d'approuver "${doc.titre}"`,
      lien: `/approvals`,
    });

    await logActivity({
      userId: req.user.id, action: 'document_partage', cibleType: 'document', cibleId: doc.id,
      description: `Demande d'approbation pour "${doc.titre}" → ${approbateur.prenom} ${approbateur.nom}`,
      req,
    });

    res.status(201).json({ approval });
  } catch (error) {
    logger.error('Erreur create approval:', error);
    res.status(500).json({ message: 'Erreur demande d\'approbation' });
  }
});

// Decision (approve/reject)
router.post('/:id/decision', auth, requireOrg, [
  body('decision').isIn(['approuve', 'refuse']).withMessage('Décision: approuve ou refuse'),
  body('commentaire').optional().trim().isLength({ max: 2000 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const approval = await Approval.findOne({
      where: { id: req.params.id, approbateur_id: req.user.id, statut: 'en_attente' },
      include: [{ model: Document, as: 'document', attributes: ['id', 'titre'] }]
    });
    if (!approval) return res.status(404).json({ message: 'Demande non trouvée ou déjà traitée' });

    approval.statut = req.body.decision;
    approval.commentaire = req.body.commentaire || '';
    approval.date_decision = new Date();
    await approval.save();

    const label = req.body.decision === 'approuve' ? 'approuvé' : 'refusé';
    await Notification.create({
      destinataire_id: approval.demandeur_id,
      type: 'document_modifie',
      titre: `Document ${label}`,
      message: `"${approval.document.titre}" a été ${label} par ${req.user.prenom} ${req.user.nom}${req.body.commentaire ? '. Note: ' + req.body.commentaire : ''}`,
      lien: `/documents/${approval.document.id}`,
    });

    await logActivity({
      userId: req.user.id,
      action: req.body.decision === 'approuve' ? 'document_approuve' : 'document_refuse',
      cibleType: 'document', cibleId: approval.document.id,
      description: `"${approval.document.titre}" ${label} par ${req.user.prenom} ${req.user.nom}`,
      req,
    });

    res.json({ approval });
  } catch (error) {
    logger.error('Erreur approval decision:', error);
    res.status(500).json({ message: 'Erreur traitement' });
  }
});

// Cancel approval request (by requester)
router.post('/:id/cancel', auth, requireOrg, async (req, res) => {
  try {
    const approval = await Approval.findOne({
      where: { id: req.params.id, demandeur_id: req.user.id, statut: 'en_attente' }
    });
    if (!approval) return res.status(404).json({ message: 'Demande non trouvée' });

    approval.statut = 'annule';
    await approval.save();
    res.json({ message: 'Demande annulée' });
  } catch (error) {
    logger.error('Erreur cancel approval:', error);
    res.status(500).json({ message: 'Erreur annulation' });
  }
});

// List pending approvals (for current user as approbateur)
router.get('/pending', auth, requireOrg, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await Approval.findAndCountAll({
      where: { approbateur_id: req.user.id, statut: 'en_attente' },
      include: [
        { model: Document, as: 'document', attributes: ['id', 'titre', 'type_fichier', 'taille', 'nom_original'] },
        { model: User, as: 'demandeur', attributes: ['id', 'nom', 'prenom', 'email'] }
      ],
      order: [
        ['priorite', 'ASC'],
        ['createdAt', 'DESC']
      ],
      offset,
      limit: parseInt(limit),
    });

    res.json({
      approvals: rows.map(a => ({
        id: a.id,
        document: a.document,
        demandeur: a.demandeur,
        priorite: a.priorite,
        commentaire: a.commentaire,
        date_demande: a.createdAt,
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    logger.error('Erreur pending approvals:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// List my requests (for current user as demandeur)
router.get('/my-requests', auth, requireOrg, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows, count } = await Approval.findAndCountAll({
      where: { demandeur_id: req.user.id },
      include: [
        { model: Document, as: 'document', attributes: ['id', 'titre', 'type_fichier'] },
        { model: User, as: 'approbateur', attributes: ['id', 'nom', 'prenom', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
    });

    res.json({
      approvals: rows.map(a => ({
        id: a.id,
        document: a.document,
        approbateur: a.approbateur,
        statut: a.statut,
        priorite: a.priorite,
        commentaire: a.commentaire,
        date_decision: a.date_decision,
        date_demande: a.createdAt,
      })),
      pagination: { page: parseInt(page), limit: parseInt(limit), total: count, pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    logger.error('Erreur my approvals:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
