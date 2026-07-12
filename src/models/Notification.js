const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  destinataire_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  type: {
    type: DataTypes.ENUM(
      'document_ajoute', 'document_modifie', 'document_supprime',
      'partage_recu', 'partage_expire', 'version_ajoutee',
      'commentaire', 'systeme'
    ),
    allowNull: false
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  lien: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  lu: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  email_envoye: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'notifications',
  timestamps: true,
  underscored: false
});

module.exports = Notification;
