const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Version = sequelize.define('Version', {
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
  numero_version: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  nom_fichier: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  chemin: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  taille: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  modifie_par_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  commentaire: {
    type: DataTypes.TEXT,
    defaultValue: ''
  }
}, {
  tableName: 'versions',
  timestamps: true,
  underscored: false
});

module.exports = Version;
