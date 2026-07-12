const DashboardPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="dashboard.title">Tableau de bord</h1>
          <p data-i18n="dashboard.subtitle">Bienvenue sur votre espace d'archivage</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="dashUploadBtn">
            <i class="fas fa-cloud-upload-alt"></i> <span data-i18n="documents.new">Nouveau document</span>
          </button>
        </div>
      </div>
      <div class="stat-grid" id="statGrid">
        <div class="stat-card"><div class="stat-icon" style="background:var(--primary-bg);color:var(--primary)"><i class="fas fa-file-alt"></i></div><div class="stat-info"><div class="stat-value" id="statTotal">-</div><div class="stat-label" data-i18n="dashboard.totalDocs">Total documents</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#fef3c7;color:#d97706"><i class="fas fa-clock"></i></div><div class="stat-info"><div class="stat-value" id="statRecent">-</div><div class="stat-label" data-i18n="dashboard.recent">Ajoutés cette semaine</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#fce7f3;color:#db2777"><i class="fas fa-star"></i></div><div class="stat-info"><div class="stat-value" id="statFav">-</div><div class="stat-label" data-i18n="dashboard.favorites">Favoris</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:#d1fae5;color:#059669"><i class="fas fa-share-alt"></i></div><div class="stat-info"><div class="stat-value" id="statShared">-</div><div class="stat-label" data-i18n="dashboard.shared">Partagés</div></div></div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title" data-i18n="dashboard.recentDocs">Documents récents</h3><a href="#/documents" class="btn btn-sm btn-text">Voir tout</a></div>
        <div class="card-body" id="recentDocs"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
      </div>
    `;
    I18N.apply();
    document.getElementById('dashUploadBtn').onclick = () => App.showUploadModal();
    await this.loadStats();
    await this.loadRecent();
  },

  async loadStats() {
    try {
      if (!document.getElementById('statTotal')) return;
      const data = await API.getDocumentStats();
      document.getElementById('statTotal').textContent = data.total;
      document.getElementById('statRecent').textContent = data.recents;
      document.getElementById('statFav').textContent = data.favoris;
      document.getElementById('statShared').textContent = data.partages;
    } catch (e) { document.querySelectorAll('.stat-value').forEach(el => el.textContent = '0'); console.error('Stats:', e); }
  },

  async loadRecent() {
    try {
      const container = document.getElementById('recentDocs');
      if (!container) return;
      const data = await API.getRecentDocuments();
      if (!data.documents?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><h3>Aucun document</h3><p>Commencez par uploader vos premiers documents</p></div>';
        return;
      }
      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Type</th><th>Taille</th><th>Date</th><th>Dossier</th></tr></thead>
        <tbody>${data.documents.map(d => {
          const icon = d.type_fichier?.startsWith('image/') ? 'fa-file-image' : d.type_fichier?.includes('pdf') ? 'fa-file-pdf' : d.type_fichier?.includes('word') ? 'fa-file-word' : 'fa-file-alt';
          const color = d.type_fichier?.startsWith('image/') ? '#f59e0b' : d.type_fichier?.includes('pdf') ? '#ef4444' : d.type_fichier?.includes('word') ? '#3b82f6' : '#6b7280';
          return `<tr onclick="App.previewDocument('${d.id}')" style="cursor:pointer">
            <td><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${d.titre}</td>
            <td>${d.type_fichier?.split('/')[1] || '-'}</td>
            <td>${App.formatSize(d.taille)}</td>
            <td>${new Date(d.createdAt).toLocaleDateString()}</td>
            <td>${d.dossier?.nom || '-'}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
    } catch (e) { container.innerHTML = '<p class="text-center text-muted">Erreur: ' + (e.message || 'inconnue') + '</p>'; }
  }
};
