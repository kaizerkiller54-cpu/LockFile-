const SharedPage = {
  currentTab: 'received',
  page: 1,

  async render() {
    this.page = 1;
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="shared.title">Éléments partagés</h1>
        </div>
      </div>
      <div class="tabs mb-4">
        <button class="tab ${this.currentTab === 'received' ? 'active' : ''}" onclick="SharedPage.switchTab('received')" data-i18n="shared.received">Reçus</button>
        <button class="tab ${this.currentTab === 'sent' ? 'active' : ''}" onclick="SharedPage.switchTab('sent')" data-i18n="shared.sent">Envoyés</button>
      </div>
      <div id="sharedContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
      <div id="sharedPagination" class="pagination" style="display:none"></div>
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

  renderPagination(pagination) {
    const el = document.getElementById('sharedPagination');
    if (!pagination || pagination.pages <= 1) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = Array.from({ length: pagination.pages }, (_, i) =>
      `<button class="btn btn-sm ${i + 1 === pagination.page ? 'btn-primary' : 'btn-outline'}" onclick="SharedPage.goTo(${i + 1})">${i + 1}</button>`
    ).join('');
  },

  goTo(page) {
    this.page = page;
    this.load();
  },

  async loadReceived(container) {
    const data = await API.getSharedWithMe({ page: this.page, limit: 50 });
    const docs = data.documents || [];
    const folders = data.dossiers || [];
    if (!docs.length && !folders.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-share-alt"></i><h3 data-i18n="shared.empty">Aucun élément partagé avec vous</h3></div>';
      I18N.apply();
      return;
    }
    const rows = [];
    folders.forEach(d => rows.push({ type: 'folder', nom: d.element.nom, lien: `/documents?dossier=${d.element.id}`, partage_par: d.partage_par, permission: d.permission, date: d.date_partage }));
    docs.forEach(d => rows.push({ type: 'document', nom: d.document.titre, lien: null, partage_par: d.partage_par, permission: d.permission, date: d.date_partage }));
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th>Type</th><th data-i18n="common.name">Nom</th><th data-i18n="shared.sharedBy">Partagé par</th><th data-i18n="shared.permission">Permission</th><th data-i18n="shared.date">Date</th></tr></thead>
      <tbody>${rows.map(r => `
        <tr>
          <td><i class="fas ${r.type === 'folder' ? 'fa-folder' : 'fa-file'}" style="color:${r.type === 'folder' ? '#4f46e5' : '#3b82f6'}"></i></td>
          <td>${r.lien ? `<a href="#${r.lien}" class="text-primary fw-600">${r.nom}</a>` : `<strong>${r.nom}</strong>`}</td>
          <td>${r.partage_par?.prenom || ''} ${r.partage_par?.nom || ''}</td>
          <td><span class="tag" style="background:${r.permission === 'ecriture' ? '#10b98122' : '#3b82f622'};color:${r.permission === 'ecriture' ? '#10b981' : '#3b82f6'}">${r.permission === 'ecriture' ? 'Modification' : 'Lecture'}</span></td>
          <td>${new Date(r.date).toLocaleDateString()}</td>
        </tr>
      `).join('')}</tbody></table></div>`;
    this.renderPagination(data.pagination);
    I18N.apply();
  },

  async loadSent(container) {
    const data = await API.getSharedByMe({ page: this.page, limit: 50 });
    if (!data.items?.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-share-alt"></i><h3 data-i18n="shared.noSent">Vous n\'avez partagé aucun élément</h3></div>';
      I18N.apply();
      return;
    }
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th>Type</th><th data-i18n="common.name">Nom</th><th data-i18n="shared.with">Partagé avec</th><th data-i18n="shared.permission">Permission</th><th data-i18n="shared.date">Date</th><th data-i18n="common.actions">Actions</th></tr></thead>
      <tbody>${data.items.map(d => {
        const isDoc = d.type === 'document';
        const name = d.element?.titre || d.element?.nom || 'Supprimé';
        const recipient = d.utilisateur ? `${d.utilisateur.prenom} ${d.utilisateur.nom}` : '-';
        const revokeFn = isDoc
          ? `SharedPage.revokeDoc('${d.element?.id}','${d.permission_id}')`
          : `SharedPage.revokeFolder('${d.element?.id}','${d.permission_id}')`;
        return `
        <tr>
          <td><i class="fas ${isDoc ? 'fa-file' : 'fa-folder'}" style="color:${isDoc ? '#3b82f6' : '#4f46e5'}"></i></td>
          <td><strong>${name}</strong></td>
          <td>${recipient}</td>
          <td><span class="tag" style="background:${d.niveau === 'ecriture' ? '#10b98122' : '#3b82f622'};color:${d.niveau === 'ecriture' ? '#10b981' : '#3b82f6'}">${d.niveau === 'ecriture' ? 'Modification' : 'Lecture'}</span></td>
          <td>${new Date(d.date_partage).toLocaleDateString()}</td>
          <td><button class="btn btn-sm btn-danger" onclick="${revokeFn}"><i class="fas fa-ban"></i></button></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
    this.renderPagination(data.pagination);
    I18N.apply();
  },

  async revokeDoc(docId, permId) {
    if (!confirm('Révoquer ce partage ?')) return;
    try {
      await API.revokeShare(docId, permId);
      App.showToast('Partage révoqué', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async revokeFolder(folderId, permId) {
    if (!confirm('Révoquer ce partage ?')) return;
    try {
      await API.revokeFolderShare(folderId, permId);
      App.showToast('Partage révoqué', 'success');
      this.render();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
