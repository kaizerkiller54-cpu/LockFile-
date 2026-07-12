const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { Document, Permission, Notification, User } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.post('/documents/:id/share', auth, async (req, res) => {
  try {
    const doc = await Document.findOne({
      where: { id: req.params.id, proprietaire_id: req.user.id }
    });
    if (!doc) return res.status(404).json({ message: 'Document non trouvé' });

    const { email, niveau, expiration } = req.body;
    if (!['lecture', 'ecriture'].includes(niveau)) {
      return res.status(400).json({ message: 'Niveau de permission invalide' });
    }

    let targetUser = null;
    const permData = {
      document_id: doc.id,
      niveau,
      accorde_par_id: req.user.id
    };

    if (email) {
      targetUser = await User.findOne({ where: { email } });
      if (!targetUser) return res.status(404).json({ message: 'Utilisateur non trouvé' });
      permData.utilisateur_id = targetUser.id;

      await Notification.create({
        destinataire_id: targetUser.id,
        type: 'partage_recu',
        titre: 'Document partagé',
        message: `${req.user.nom} ${req.user.prenom} a partagé "${doc.titre}" avec vous`,
        lien: `/documents/${doc.id}`
      });
    } else {
      permData.lien_partage = uuidv4();
      permData.expiration = expiration ? new Date(expiration) : null;
    }

    const permission = await Permission.create(permData);

    doc.est_partage = true;
    await doc.save();

    logger.info(`Document partagé: ${doc.titre} par ${req.user.username} ${email ? 'avec ' + email : '(lien public)'}`);

    res.status(201).json({
      permission,
      lien: permission.lien_partage ? `${req.protocol}://${req.get('host')}/api/sharing/access/${permission.lien_partage}` : null
    });
  } catch (error) {
    logger.error('Erreur share:', error);
    res.status(500).json({ message: 'Erreur partage' });
  }
});

router.get('/shared-with-me', auth, async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      where: { utilisateur_id: req.user.id },
      include: [
        { model: Document, as: 'document' },
        { model: User, as: 'accorde_par', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    const documents = permissions
      .filter(p => p.document && p.document.statut === 'actif')
      .map(p => ({
        document: p.document,
        permission: p.niveau,
        partage_par: p.accorde_par,
        date_partage: p.createdAt
      }));

    res.json({ documents });
  } catch (error) {
    logger.error('Erreur shared with me:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/access/:link', async (req, res) => {
  try {
    const permission = await Permission.findOne({
      where: {
        lien_partage: req.params.link,
        [Op.or]: [
          { expiration: null },
          { expiration: { [Op.gte]: new Date() } }
        ]
      },
      include: [{ model: Document, as: 'document' }]
    });
    if (!permission || !permission.document) {
      return res.status(404).json({ message: 'Lien invalide ou expiré' });
    }
    res.json({ document: permission.document, niveau: permission.niveau });
  } catch (error) {
    logger.error('Erreur access link:', error);
    res.status(500).json({ message: 'Erreur accès' });
  }
});

router.get('/shared-by-me', auth, async (req, res) => {
  try {
    const permissions = await Permission.findAll({
      where: { accorde_par_id: req.user.id },
      include: [
        { model: Document, as: 'document' },
        { model: User, as: 'utilisateur', attributes: ['id', 'nom', 'prenom', 'email'] }
      ]
    });

    const documents = permissions.map(p => ({
      permission_id: p.id,
      document: p.document,
      utilisateur: p.utilisateur,
      lien_partage: p.lien_partage,
      niveau: p.niveau,
      date_partage: p.createdAt,
      expiration: p.expiration
    }));

    res.json({ documents });
  } catch (error) {
    logger.error('Erreur shared by me:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/documents/:id/share/:permissionId', auth, async (req, res) => {
  try {
    const permission = await Permission.findOne({
      where: { id: req.params.permissionId, document_id: req.params.id }
    });
    if (!permission) return res.status(404).json({ message: 'Permission non trouvée' });

    await permission.destroy();

    const remaining = await Permission.count({ where: { document_id: req.params.id } });
    if (remaining === 0) {
      await Document.update({ est_partage: false }, { where: { id: req.params.id } });
    }

    res.json({ message: 'Partage révoqué' });
  } catch (error) {
    logger.error('Erreur revoke share:', error);
    res.status(500).json({ message: 'Erreur révocation' });
  }
});

module.exports = router;
