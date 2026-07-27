const { Op } = require('sequelize');
const { Document, User, Notification } = require('../models');
const logger = require('../utils/logger');

let intervalId = null;
const CHECK_INTERVAL = 60 * 60 * 1000; // every hour

async function checkExpirations() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiringDocs = await Document.findAll({
      where: {
        statut: 'actif',
        date_expiration: { [Op.ne]: null },
        alerte_expiration: true,
      },
      include: [{ model: User, as: 'proprietaire', attributes: ['id'] }],
    });

    let alerted = 0;
    for (const doc of expiringDocs) {
      if (!doc.proprietaire) continue;

      const expDate = new Date(doc.date_expiration);
      expDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        // Already expired
        const existing = await Notification.findOne({
          where: {
            destinataire_id: doc.proprietaire_id,
            type: 'document_expiré',
            lien: `/documents/${doc.id}`,
          }
        });
        if (!existing) {
          await Notification.create({
            destinataire_id: doc.proprietaire_id,
            type: 'document_expiré',
            titre: 'Document expiré',
            message: `"${doc.titre}" a expiré le ${doc.date_expiration}`,
            lien: `/documents/${doc.id}`,
          });
          alerted++;
        }
      } else if (daysUntil <= doc.jours_alerte) {
        // Expiring soon — check if we already alerted today
        const todayStr = today.toISOString().split('T')[0];
        const existing = await Notification.findOne({
          where: {
            destinataire_id: doc.proprietaire_id,
            lien: `/documents/${doc.id}`,
            createdAt: { [Op.gte]: new Date(todayStr) },
          }
        });
        if (!existing) {
          const label = daysUntil === 0 ? "expire aujourd'hui" : `expire dans ${daysUntil} jour(s)`;
          await Notification.create({
            destinataire_id: doc.proprietaire_id,
            type: 'document_expiré',
            titre: 'Document bientôt expiré',
            message: `"${doc.titre}" ${label} (${doc.date_expiration})`,
            lien: `/documents/${doc.id}`,
          });
          alerted++;
        }
      }
    }

    if (alerted > 0) {
      logger.info(`Alertes expiration: ${alerted} notification(s) créée(s)`);
    }
  } catch (error) {
    logger.error('Erreur vérification expirations:', error);
  }
}

function startExpirationChecker() {
  checkExpirations(); // run immediately
  intervalId = setInterval(checkExpirations, CHECK_INTERVAL);
  logger.info('Vérification des expirations démarrée (interval: 1h)');
}

function stopExpirationChecker() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = { startExpirationChecker, stopExpirationChecker, checkExpirations };
