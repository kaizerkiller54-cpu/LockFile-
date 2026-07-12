const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Folder = sequelize.define('Folder', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    defaultValue: ''
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'folders', key: 'id' }
  },
  proprietaire_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  couleur: {
    type: DataTypes.STRING(20),
    defaultValue: '#4f46e5'
  },
  icone: {
    type: DataTypes.STRING(50),
    defaultValue: 'folder'
  }
}, {
  tableName: 'folders',
  timestamps: true,
  underscored: false
});

module.exports = Folder;
