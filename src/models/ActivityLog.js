const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  utilisateur_id: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  action: {
    type: DataTypes.ENUM(
      'document_cree', 'document_modifie', 'document_supprime', 'document_telecharge',
      'document_partage', 'document_approuve', 'document_refuse',
      'dossier_cree', 'dossier_modifie', 'dossier_supprime',
      'connexion', 'deconnexion', 'inscription',
      'permission_creee', 'permission_supprimee',
      'tag_cree', 'tag_modifie', 'tag_supprime',
      'version_creee', 'version_restored',
      'scan_effectue', 'recherche_effectuee', 'lien_cree', 'lien_accede',
      'autre'
    ),
    allowNull: false
  },
  cible_type: {
    type: DataTypes.ENUM('document', 'dossier', 'tag', 'utilisateur', 'permission', 'systeme'),
    allowNull: true
  },
  cible_id: { type: DataTypes.INTEGER, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: false },
  details: { type: DataTypes.JSONB, allowNull: true },
  ip_address: { type: DataTypes.STRING(45), allowNull: true },
  user_agent: { type: DataTypes.STRING(500), allowNull: true }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  underscored: false,
  updatedAt: false,
  indexes: [
    { fields: ['utilisateur_id'] },
    { fields: ['action'] },
    { fields: ['cible_type', 'cible_id'] },
    { fields: ['createdAt'] }
  ]
});

module.exports = ActivityLog;
