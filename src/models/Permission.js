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
    allowNull: false,
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
  }
}, {
  tableName: 'permissions',
  timestamps: true,
  underscored: false
});

module.exports = Permission;
