const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');
const User = require('./User');
const Document = require('./Document');
const Folder = require('./Folder');
const Tag = require('./Tag');
const Permission = require('./Permission');
const Version = require('./Version');
const Notification = require('./Notification');

// Document -> Folder (N:1)
Document.belongsTo(Folder, { foreignKey: 'dossier_id', as: 'dossier' });
Folder.hasMany(Document, { foreignKey: 'dossier_id', as: 'documents' });

// Document -> User (N:1)
Document.belongsTo(User, { foreignKey: 'proprietaire_id', as: 'proprietaire' });
User.hasMany(Document, { foreignKey: 'proprietaire_id', as: 'documents' });

// Folder -> User (N:1)
Folder.belongsTo(User, { foreignKey: 'proprietaire_id', as: 'proprietaire' });
User.hasMany(Folder, { foreignKey: 'proprietaire_id', as: 'folders' });

// Folder self-referencing (N:1)
Folder.belongsTo(Folder, { foreignKey: 'parent_id', as: 'parent' });
Folder.hasMany(Folder, { foreignKey: 'parent_id', as: 'children' });

// Tag -> User (N:1)
Tag.belongsTo(User, { foreignKey: 'proprietaire_id', as: 'proprietaire' });
User.hasMany(Tag, { foreignKey: 'proprietaire_id', as: 'tags' });

// Document <-> Tag (N:N) via junction table
const DocumentTag = sequelize.define('DocumentTag', {
  document_id: { type: DataTypes.INTEGER, references: { model: 'documents', key: 'id' } },
  tag_id: { type: DataTypes.INTEGER, references: { model: 'tags', key: 'id' } }
}, { tableName: 'document_tags', timestamps: false });

Document.belongsToMany(Tag, { through: DocumentTag, foreignKey: 'document_id', otherKey: 'tag_id', as: 'tags' });
Tag.belongsToMany(Document, { through: DocumentTag, foreignKey: 'tag_id', otherKey: 'document_id', as: 'documents' });

// Permission -> Document (N:1)
Permission.belongsTo(Document, { foreignKey: 'document_id', as: 'document' });
Document.hasMany(Permission, { foreignKey: 'document_id', as: 'permissions' });

// Permission -> User (grantee)
Permission.belongsTo(User, { foreignKey: 'utilisateur_id', as: 'utilisateur' });

// Permission -> User (granter)
Permission.belongsTo(User, { foreignKey: 'accorde_par_id', as: 'accorde_par' });

// Version -> Document (N:1)
Version.belongsTo(Document, { foreignKey: 'document_id', as: 'document' });
Document.hasMany(Version, { foreignKey: 'document_id', as: 'versions' });

// Version -> User (modifier)
Version.belongsTo(User, { foreignKey: 'modifie_par_id', as: 'modifie_par' });

// Notification -> User
Notification.belongsTo(User, { foreignKey: 'destinataire_id', as: 'destinataire' });
User.hasMany(Notification, { foreignKey: 'destinataire_id', as: 'notifications' });

module.exports = {
  User, Document, Folder, Tag, Permission, Version, Notification, DocumentTag, sequelize
};
