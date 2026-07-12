const ArchivePage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="archive.title">Archives</h1>
          <p data-i18n="archive.subtitle">Documents archivés</p>
        </div>
      </div>
      <div id="archiveContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
    `;
    I18N.apply();
    await this.load();
  },

  async load() {
    try {
      const data = await API.getDocuments({ statut: 'archive', limit: 50 });
      const container = document.getElementById('archiveContainer');
      if (!data.documents?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-archive"></i><h3 data-i18n="archive.empty">Aucun document archivé</h3></div>';
        I18N.apply();
        return;
      }
      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Archivé le</th><th>Taille</th><th>Actions</th></tr></thead>
        <tbody>${data.documents.map(d => `
          <tr>
            <td><strong>${d.titre}</strong></td>
            <td>${new Date(d.updatedAt).toLocaleDateString()}</td>
            <td>${App.formatSize(d.taille)}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="App.downloadDocument('${d.id}')"><i class="fas fa-download"></i></button>
              <button class="btn btn-sm btn-success" onclick="ArchivePage.unarchive('${d.id}')"><i class="fas fa-undo"></i> <span class="i18n-trigger" data-i18n="archive.restore">Restaurer</span></button>
              <button class="btn btn-sm btn-danger" onclick="App.confirmDelete('${d.id}')"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}</tbody></table></div>`;
      I18N.apply();
    } catch { document.getElementById('archiveContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async unarchive(id) {
    try {
      await API.unarchiveDocument(id);
      App.showToast('Document restauré des archives', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};