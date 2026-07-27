const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Approval = sequelize.define('Approval', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  document_id: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'documents', key: 'id' }
  },
  demandeur_id: {
    type: DataTypes.INTEGER, allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  approbateur_id: {
    type: DataTypes.INTEGER, allowNull: true,
    references: { model: 'users', key: 'id' }
  },
  statut: {
    type: DataTypes.ENUM('en_attente', 'approuve', 'refuse', 'annule'),
    defaultValue: 'en_attente'
  },
  commentaire: { type: DataTypes.TEXT, defaultValue: '' },
  date_decision: { type: DataTypes.DATE, allowNull: true },
  priorite: {
    type: DataTypes.ENUM('normale', 'haute', 'urgente'),
    defaultValue: 'normale'
  }
}, {
  tableName: 'approvals',
  timestamps: true,
  underscored: false,
  indexes: [
    { fields: ['document_id'] },
    { fields: ['demandeur_id'] },
    { fields: ['approbateur_id'] },
    { fields: ['statut'] }
  ]
});

module.exports = Approval;
