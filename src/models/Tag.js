const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Tag = sequelize.define('Tag', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nom: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  couleur: {
    type: DataTypes.STRING(20),
    defaultValue: '#6366f1'
  },
  proprietaire_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  }
}, {
  tableName: 'tags',
  timestamps: true,
  underscored: false,
  indexes: [
    { unique: true, fields: ['nom', 'proprietaire_id'] }
  ]
});

module.exports = Tag;
