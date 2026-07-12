const TrashPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="trash.title">Corbeille</h1>
          <p data-i18n="trash.empty">Documents supprimés</p>
        </div>
        <button class="btn btn-danger" id="emptyTrashBtn" onclick="TrashPage.emptyTrash()" style="display:none"><i class="fas fa-trash-alt"></i> Vider la corbeille</button>
      </div>
      <div id="trashContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
    `;
    I18N.apply();
    await this.load();
  },

  async load() {
    try {
      const data = await API.getDocuments({ statut: 'supprime', limit: 50 });
      const container = document.getElementById('trashContainer');
      document.getElementById('emptyTrashBtn').style.display = data.documents?.length ? 'inline-flex' : 'none';
      if (!data.documents?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-trash"></i><h3 data-i18n="trash.empty">La corbeille est vide</h3></div>';
        I18N.apply();
        return;
      }
      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Supprimé le</th><th>Taille</th><th>Actions</th></tr></thead>
        <tbody>${data.documents.map(d => `
          <tr>
            <td><strong>${d.titre}</strong></td>
            <td>${new Date(d.updatedAt).toLocaleDateString()}</td>
            <td>${App.formatSize(d.taille)}</td>
            <td>
              <button class="btn btn-sm btn-success" onclick="TrashPage.restore('${d.id}')"><i class="fas fa-undo"></i> Restaurer</button>
            </td>
          </tr>
        `).join('')}</tbody></table></div>`;
    } catch { document.getElementById('trashContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async restore(id) {
    try {
      await API.restoreDocument(id);
      App.showToast('Document restauré', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async emptyTrash() {
    if (!confirm('Vider définitivement la corbeille ? Cette action est irréversible.')) return;
    try {
      await API.emptyTrash();
      App.showToast('Corbeille vidée', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
