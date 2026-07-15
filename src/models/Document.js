const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Document = sequelize.define('Document', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  titre: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  nom_fichier: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  nom_original: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  type_fichier: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  taille: {
    type: DataTypes.BIGINT,
    allowNull: false
  },
  chemin: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  dossier_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'folders', key: 'id' }
  },
  proprietaire_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  statut: {
    type: DataTypes.ENUM('actif', 'archive', 'supprime'),
    defaultValue: 'actif'
  },
  favori: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  version_actuelle: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  est_partage: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  url: {
    type: DataTypes.STRING(1024),
    allowNull: true
  },
  firebase_path: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  contenu_ocr: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'documents',
  timestamps: true,
  underscored: false
});

module.exports = Document;
