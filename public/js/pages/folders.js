const FoldersPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="folders.title">Dossiers</h1>
          <p>Organisez vos documents dans des dossiers</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="newFolderBtn"><i class="fas fa-folder-plus"></i> <span data-i18n="folders.new">Nouveau dossier</span></button>
        </div>
      </div>
      <div id="foldersContainer">${Skeleton.card(6)}</div>
    `;
    I18N.apply();
    document.getElementById('newFolderBtn').onclick = () => this.showFolderModal();
    await this.loadFolders();
  },

  async loadFolders() {
    try {
      const data = await API.getFolders();
      const container = document.getElementById('foldersContainer');
      if (!data.folders?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><h3>Aucun dossier</h3><p>Créez des dossiers pour organiser vos documents</p></div>';
        return;
      }
      container.innerHTML = `<div class="doc-grid">${data.folders.map(f => {
        const safeNom = (f.nom || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
        <div class="doc-card" style="cursor:pointer">
          <div onclick="router.navigate('/documents?dossier=${f.id}')">
            <div class="doc-card-icon" style="background:${f.couleur}15;color:${f.couleur}"><i class="fas fa-folder"></i></div>
            <div class="doc-card-title">${f.nom}</div>
            <div class="doc-card-meta">${f.documentCount || 0} document(s)</div>
          </div>
          <div class="doc-card-actions" style="opacity:1;position:static;margin-top:12px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();FoldersPage.addToFolder('${f.id}')"><i class="fas fa-cloud-upload-alt"></i> Uploader</button>
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();App.shareFolder('${f.id}','${safeNom}')"><i class="fas fa-share-alt"></i></button>
            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();FoldersPage.editFolder('${f.id}','${safeNom}','${f.couleur}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();FoldersPage.deleteFolder('${f.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
      }).join('')}</div>`;
    } catch { document.getElementById('foldersContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async showFolderModal(folder = null) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${folder ? 'Modifier le dossier' : 'Nouveau dossier'}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="folderForm">
            <div class="form-group">
              <label>Nom du dossier</label>
              <input type="text" class="form-control" id="folderName" value="${folder ? folder.nom : ''}" required>
            </div>
            <div class="form-group">
              <label>Couleur</label>
              <input type="color" class="form-control" id="folderColor" value="${folder ? folder.couleur : '#4f46e5'}" style="height:44px;padding:4px">
            </div>
            <div class="modal-footer-actions">
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
              <button type="submit" class="btn btn-primary">${folder ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('folderForm').onsubmit = async (e) => {
      e.preventDefault();
      const nom = document.getElementById('folderName').value;
      const couleur = document.getElementById('folderColor').value;
      try {
        if (folder) await API.updateFolder(folder.id, { nom, couleur });
        else await API.createFolder({ nom, couleur });
        overlay.remove();
        App.showToast(folder ? 'Dossier modifié' : 'Dossier créé', 'success');
        this.loadFolders();
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  },

  editFolder(id, nom, couleur) { this.showFolderModal({ id, nom, couleur }); },

  addToFolder(id) {
    App.showUploadModal(null, id);
  },

  async deleteFolder(id) {
    if (!confirm('Supprimer ce dossier ? Les documents ne seront pas supprimés.')) return;
    try {
      await API.deleteFolder(id);
      App.showToast('Dossier supprimé', 'success');
      this.loadFolders();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
