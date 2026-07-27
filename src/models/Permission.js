const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Permission = sequelize.define('Permission', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  document_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'documents', key: 'id' }
  },
  utilisateur_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  dossier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'folders', key: 'id' }
  },
  niveau: {
    type: DataTypes.ENUM('lecture', 'ecriture', 'suppression', 'partage'),
    allowNull: false
  },
  accorde_par_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  lien_partage: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  expiration: {
    type: DataTypes.DATE,
    allowNull: true
  },
  mot_de_passe: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'permissions',
  timestamps: true,
  underscored: false,
  indexes: [
    { name: 'idx_perm_document', fields: ['document_id'] },
    { name: 'idx_perm_dossier', fields: ['dossier_id'] },
    { name: 'idx_perm_utilisateur', fields: ['utilisateur_id'] },
    { name: 'idx_perm_accorde_par', fields: ['accorde_par_id'] },
    { name: 'idx_perm_lien_partage', fields: ['lien_partage'] }
  ]
});

module.exports = Permission;
