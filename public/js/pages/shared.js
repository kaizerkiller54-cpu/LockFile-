const SharedPage = {
  currentTab: 'received',

  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="shared.title">Documents partagés</h1>
        </div>
      </div>
      <div class="tabs mb-4">
        <button class="tab ${this.currentTab === 'received' ? 'active' : ''}" onclick="SharedPage.switchTab('received')" data-i18n="shared.received">Reçus</button>
        <button class="tab ${this.currentTab === 'sent' ? 'active' : ''}" onclick="SharedPage.switchTab('sent')" data-i18n="shared.sent">Envoyés</button>
      </div>
      <div id="sharedContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
    `;
    I18N.apply();
    await this.load();
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  async load() {
    try {
      const container = document.getElementById('sharedContainer');
      if (this.currentTab === 'received') {
        await this.loadReceived(container);
      } else {
        await this.loadSent(container);
      }
    } catch { document.getElementById('sharedContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async loadReceived(container) {
    const data = await API.getSharedWithMe();
    if (!data.documents?.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-share-alt"></i><h3 data-i18n="shared.empty">Aucun document partagé avec vous</h3></div>';
      I18N.apply();
      return;
    }
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th data-i18n="common.name">Nom</th><th data-i18n="shared.sharedBy">Partagé par</th><th data-i18n="shared.permission">Permission</th><th data-i18n="shared.date">Date</th><th data-i18n="common.actions">Actions</th></tr></thead>
      <tbody>${data.documents.map(d => `
        <tr>
          <td><strong>${d.document.titre}</strong></td>
          <td>${d.partage_par?.prenom || ''} ${d.partage_par?.nom || ''}</td>
          <td><span class="tag" style="background:${d.permission === 'ecriture' ? '#10b98122' : '#3b82f622'};color:${d.permission === 'ecriture' ? '#10b981' : '#3b82f6'}">${d.permission === 'ecriture' ? 'Modification' : 'Lecture'}</span></td>
          <td>${new Date(d.date_partage).toLocaleDateString()}</td>
          <td><button class="btn btn-sm btn-primary" onclick="window.open('${API.getDownloadUrl(d.document.id)}','_blank')"><i class="fas fa-download"></i></button></td>
        </tr>
      `).join('')}</tbody></table></div>`;
    I18N.apply();
  },

  async loadSent(container) {
    const data = await API.getSharedByMe();
    if (!data.documents?.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-share-alt"></i><h3 data-i18n="shared.noSent">Vous n\'avez partagé aucun document</h3></div>';
      I18N.apply();
      return;
    }
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th data-i18n="common.name">Nom</th><th data-i18n="shared.with">Partagé avec</th><th data-i18n="shared.permission">Permission</th><th data-i18n="shared.date">Date</th><th data-i18n="common.actions">Actions</th></tr></thead>
      <tbody>${data.documents.map(d => `
        <tr>
          <td><strong>${d.document?.titre || 'Document supprimé'}</strong></td>
          <td>${d.utilisateur ? `${d.utilisateur.prenom} ${d.utilisateur.nom} (${d.utilisateur.email})` : d.lien_partage ? `<span class="tag" style="background:#8b5cf622;color:#8b5cf6">Lien public</span>` : '-'}</td>
          <td><span class="tag" style="background:${d.niveau === 'ecriture' ? '#10b98122' : '#3b82f622'};color:${d.niveau === 'ecriture' ? '#10b981' : '#3b82f6'}">${d.niveau === 'ecriture' ? 'Modification' : 'Lecture'}</span></td>
          <td>${new Date(d.date_partage).toLocaleDateString()}</td>
          <td><button class="btn btn-sm btn-danger" onclick="SharedPage.revoke('${d.document?.id}','${d.permission_id}')"><i class="fas fa-ban"></i> <span class="i18n-trigger" data-i18n="shared.revoke">Révoquer</span></button></td>
        </tr>
      `).join('')}</tbody></table></div>`;
    I18N.apply();
  },

  async revoke(docId, permId) {
    if (!confirm('Révoquer ce partage ?')) return;
    try {
      await API.revokeShare(docId, permId);
      App.showToast('Partage révoqué', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};