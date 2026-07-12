const SearchPage = {
  currentPage: 1,
  query: '',

  async render() {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '');
    this.query = params.get('q') || '';
    this.currentPage = parseInt(params.get('page')) || 1;

    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1><i class="fas fa-search"></i> <span data-i18n="search.title">Recherche</span></h1>
          <p id="searchSummary" data-i18n="search.resultsFor">Résultats pour : <strong>${this.query}</strong></p>
        </div>
      </div>
      <div class="card mb-4">
        <div class="card-body">
          <div class="flex gap-2" style="display:flex;gap:8px">
            <input type="text" class="form-control" id="searchInput" value="${this.query}" placeholder="Rechercher documents, dossiers..." style="flex:1">
            <button class="btn btn-primary" id="searchBtn"><i class="fas fa-search"></i> Rechercher</button>
          </div>
          <div class="flex gap-2 mt-2" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
            <select class="form-control" id="searchType" style="max-width:180px">
              <option value="">Tous les types</option>
              <option value="pdf">PDF</option>
              <option value="word">Word</option>
              <option value="excel">Excel</option>
              <option value="image">Image</option>
              <option value="video">Vidéo</option>
            </select>
            <input type="date" class="form-control" id="searchDateDebut" style="max-width:160px" placeholder="Date début">
            <input type="date" class="form-control" id="searchDateFin" style="max-width:160px" placeholder="Date fin">
          </div>
        </div>
      </div>
      <div id="searchTabs" style="display:flex;gap:12px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:8px">
        <span class="tab-active" id="tabDocs" style="cursor:pointer;font-weight:600;color:var(--primary);padding:4px 12px;border-bottom:2px solid var(--primary);margin-bottom:-10px">
          <i class="fas fa-file-alt"></i> Documents
        </span>
        <span id="tabFolders" style="cursor:pointer;padding:4px 12px;color:var(--text-secondary)">
          <i class="fas fa-folder"></i> Dossiers
        </span>
      </div>
      <div id="searchResults"><p class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Recherche en cours...</p></div>
      <div class="pagination" id="searchPagination"></div>
    `;
    I18N.apply();

    document.getElementById('searchBtn').onclick = () => this.doSearch();
    document.getElementById('searchInput').onkeydown = (e) => { if (e.key === 'Enter') this.doSearch(); };
    document.getElementById('searchType').onchange = () => this.doSearch();
    document.getElementById('searchDateDebut').onchange = () => this.doSearch();
    document.getElementById('searchDateFin').onchange = () => this.doSearch();
    document.getElementById('tabFolders').onclick = () => this.searchFolders();
    document.getElementById('tabDocs').onclick = () => this.searchDocs();

    if (this.query) this.searchDocs();
    else document.getElementById('searchResults').innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Effectuez une recherche</h3><p>Saisissez un mot-clé pour trouver vos documents</p></div>';
  },

  doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    this.query = q;
    this.currentPage = 1;
    router.navigate(`#/search?q=${encodeURIComponent(q)}`);
  },

  async searchDocs() {
    const container = document.getElementById('searchResults');
    const pagination = document.getElementById('searchPagination');
    container.innerHTML = '<p class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Recherche...</p>';
    pagination.innerHTML = '';

    try {
      const params = { q: this.query, page: this.currentPage, limit: 20 };
      const type = document.getElementById('searchType')?.value;
      if (type) params.type = type;
      const dd = document.getElementById('searchDateDebut')?.value;
      const df = document.getElementById('searchDateFin')?.value;
      if (dd) params.dateDebut = dd;
      if (df) params.dateFin = df;

      const data = await API.search(params);
      document.getElementById('searchSummary').innerHTML = `Résultats pour : <strong>${this.query}</strong> (${data.total} trouvé(s))`;

      if (!data.documents?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Aucun résultat</h3><p>Aucun document ne correspond à votre recherche</p></div>';
        return;
      }

      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Type</th><th>Taille</th><th>Date</th><th>Dossier</th><th>Tags</th></tr></thead>
        <tbody>${data.documents.map(d => {
          const [icon, color] = DocumentsPage ? DocumentsPage.getFileIcon(d.type_fichier) : ['fa-file-alt', '#6b7280'];
          const tags = d.tags?.map(t => `<span class="tag" style="background:${t.couleur}22;color:${t.couleur};font-size:11px">${t.nom}</span>`).join('') || '';
          return `<tr onclick="App.previewDocument('${d.id}')" style="cursor:pointer">
            <td><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${d.titre}</td>
            <td>${d.type_fichier?.split('/')[1] || '-'}</td>
            <td>${App.formatSize(d.taille)}</td>
            <td>${new Date(d.createdAt).toLocaleDateString()}</td>
            <td>${d.dossier?.nom || '-'}</td>
            <td>${tags || '-'}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;

      this.renderPagination(data.page, data.pages);
    } catch {
      container.innerHTML = '<p class="text-center text-muted">Erreur de recherche</p>';
    }
  },

  async searchFolders() {
    const container = document.getElementById('searchResults');
    container.innerHTML = '<p class="text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Recherche...</p>';
    try {
      const data = await API.search({ q: this.query });
      if (!data.folders?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-folder"></i><h3>Aucun dossier</h3></div>';
        return;
      }
      container.innerHTML = `<div class="folder-grid">${data.folders.map(f => `
        <div class="folder-card" onclick="router.navigate('#/documents?dossier=${f.id}')">
          <i class="fas fa-folder" style="font-size:32px;color:#4f46e5"></i>
          <div class="folder-card-title">${f.nom}</div>
        </div>`).join('')}</div>`;
    } catch {
      container.innerHTML = '<p class="text-center text-muted">Erreur</p>';
    }
  },

  renderPagination(page, pages) {
    const el = document.getElementById('searchPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    let html = `<button onclick="SearchPage.goTo(${page - 1})" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="${i === page ? 'active' : ''}" onclick="SearchPage.goTo(${i})">${i}</button>`;
    }
    html += `<button onclick="SearchPage.goTo(${page + 1})" ${page >= pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
  },

  goTo(page) {
    this.currentPage = page;
    router.navigate(`#/search?q=${encodeURIComponent(this.query)}&page=${page}`);
  }
};
