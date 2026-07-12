const express = require('express');
const { Notification } = require('../models');
const { auth } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { rows: notifications, count: total } = await Notification.findAndCountAll({
      where: { destinataire_id: req.user.id },
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit)
    });

    const nonLu = await Notification.count({
      where: { destinataire_id: req.user.id, lu: false }
    });

    res.json({ notifications, total, nonLu, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    logger.error('Erreur notifications:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.put('/:id/read', auth, async (req, res) => {
  try {
    const notif = await Notification.findOne({
      where: { id: req.params.id, destinataire_id: req.user.id }
    });
    if (!notif) return res.status(404).json({ message: 'Notification non trouvée' });
    notif.lu = true;
    await notif.save();
    res.json({ notification: notif });
  } catch (error) {
    logger.error('Erreur mark read:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/read-all', auth, async (req, res) => {
  try {
    await Notification.destroy({
      where: { destinataire_id: req.user.id }
    });
    res.json({ message: 'Toutes les notifications supprimées' });
  } catch (error) {
    logger.error('Erreur delete all:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Notification.destroy({
      where: { id: req.params.id, destinataire_id: req.user.id }
    });
    res.json({ message: 'Notification supprimée' });
  } catch (error) {
    logger.error('Erreur delete notif:', error);
    res.status(500).json({ message: 'Erreur suppression' });
  }
});

module.exports = router;
