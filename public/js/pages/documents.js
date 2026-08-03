const DocumentsPage = {
  currentPage: 1,
  currentView: localStorage.getItem('viewMode') || 'grille',
  filters: {},

  parseUrlParams() {
    const path = window.location.hash.slice(1);
    const params = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
    if (params.has('dossier')) this.filters.dossier = params.get('dossier');
    else delete this.filters.dossier;
    if (params.has('tag')) this.filters.tag = params.get('tag');
    else delete this.filters.tag;
  },

  async render() {
    this.parseUrlParams();
    this.filters.sort = this.filters.sort || localStorage.getItem('docSort') || 'date';
    const content = document.getElementById('pageContent');
    const folderFilter = this.filters.dossier;
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="documents.title">Documents</h1>
          <p>${folderFilter ? '' : (App.formatSize ? 'Gérez et organisez vos documents' : '')}</p>
        </div>
        <div class="page-actions">
          <div class="btn-group">
            <button class="btn btn-icon-sm ${this.currentView === 'grille' ? 'active' : ''}" id="viewGrid" title="Grille"><i class="fas fa-th-large"></i></button>
            <button class="btn btn-icon-sm ${this.currentView === 'liste' ? 'active' : ''}" id="viewList" title="Liste"><i class="fas fa-list"></i></button>
          </div>
          <button class="btn btn-primary" id="docUploadBtn"><i class="fas fa-cloud-upload-alt"></i> <span data-i18n="documents.new">Nouveau document</span></button>
        </div>
      </div>
      ${folderFilter ? `<div class="card" style="display:flex;align-items:center;gap:12px;padding:12px 16px;flex-wrap:wrap">
        <i class="fas fa-folder" style="color:#4f46e5;font-size:18px"></i>
        <span style="font-weight:600" id="folderContextName">Dossier #${folderFilter}</span>
        <button class="btn btn-sm btn-primary" onclick="DocumentsPage.uploadToFolder()"><i class="fas fa-cloud-upload-alt"></i> Uploader dans ce dossier</button>
        <button class="btn btn-sm btn-outline" onclick="DocumentsPage.clearFolderFilter()"><i class="fas fa-times"></i> Voir tout</button>
      </div>` : ''}
      <div class="flex items-center gap-2 mb-4" id="docFilters">
        <select class="form-control" id="filterFolder" style="max-width:200px"><option value="">Tous les dossiers</option></select>
        <select class="form-control" id="filterTag" style="max-width:200px"><option value="">Toutes les étiquettes</option></select>
        <button class="btn btn-sm btn-outline" id="filterFav"><i class="fas fa-star"></i> Favoris</button>
        <input type="text" class="form-control" id="filterSearch" placeholder="Rechercher..." style="max-width:200px">
        <select class="form-control" id="filterSort" style="max-width:240px" title="Trier">
          <option value="date">Date d'ajout (récent → ancien)</option>
          <option value="recent">Récents (dernière modif)</option>
          <option value="type">Type (Z → A)</option>
          <option value="taille">Taille (grande → petite)</option>
        </select>
        <span class="text-muted dnd-hint" style="font-size:12px;margin-left:auto" title="Glisser-déposer"><i class="fas fa-hand-pointer"></i> Double-clic pour déplacer vers un dossier</span>
      </div>
      <div id="documentsContainer">${this.currentView === 'grille' ? Skeleton.card(6) : Skeleton.table(6, 8)}</div>
      <div class="pagination" id="docPagination"></div>
    `;
    I18N.apply();
    document.getElementById('docUploadBtn').onclick = () => App.showUploadModal();
    document.getElementById('viewGrid').onclick = () => { this.currentView = 'grille'; localStorage.setItem('viewMode', 'grille'); this.render(); };
    document.getElementById('viewList').onclick = () => { this.currentView = 'liste'; localStorage.setItem('viewMode', 'liste'); this.render(); };
    document.getElementById('filterFolder').onchange = (e) => { this.filters.dossier = e.target.value; this.currentPage = 1; this.loadDocs(); };
    document.getElementById('filterTag').onchange = (e) => { this.filters.tag = e.target.value; this.currentPage = 1; this.loadDocs(); };
    document.getElementById('filterFav').onclick = () => {
      this.filters.favori = this.filters.favori === 'true' ? '' : 'true';
      document.getElementById('filterFav').classList.toggle('btn-primary');
      this.currentPage = 1; this.loadDocs();
    };
    let searchTimer;
    document.getElementById('filterSearch').oninput = (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { this.filters.q = e.target.value; this.currentPage = 1; this.loadDocs(); }, 300);
    };
    const sortSel = document.getElementById('filterSort');
    sortSel.value = this.filters.sort;
    sortSel.onchange = (e) => {
      this.filters.sort = e.target.value;
      localStorage.setItem('docSort', e.target.value);
      this.currentPage = 1;
      this.loadDocs();
    };
    await this.loadFolders();
    await this.loadTags();
    await this.loadDocs();
  },

  async loadFolders() {
    try {
      const data = await API.getFolders();
      const sel = document.getElementById('filterFolder');
      data.folders.forEach(f => {
        sel.innerHTML += `<option value="${f.id}">${f.nom}</option>`;
        if (this.filters.dossier == f.id) {
          const ctx = document.getElementById('folderContextName');
          if (ctx) ctx.textContent = f.nom;
        }
      });
      if (this.filters.dossier) sel.value = this.filters.dossier;
    } catch {}
  },

  async loadTags() {
    try {
      const data = await API.getTags();
      const sel = document.getElementById('filterTag');
      data.tags.forEach(t => {
        sel.innerHTML += `<option value="${t.id}" ${this.filters.tag == t.id ? 'selected' : ''}>${t.nom}</option>`;
      });
    } catch {}
  },

  async loadDocs() {
    try {
      const params = { page: this.currentPage, limit: 20, vue: this.currentView };
      if (this.filters.dossier) params.dossier = this.filters.dossier;
      if (this.filters.tag) params.tag = this.filters.tag;
      if (this.filters.favori) params.favori = this.filters.favori;
      if (this.filters.q) params.q = this.filters.q;
      if (this.filters.sort) params.sort = this.filters.sort;

      const data = await API.getDocuments(params);
      const container = document.getElementById('documentsContainer');
      const pagination = document.getElementById('docPagination');

      if (!data.documents?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-file-alt"></i><h3>Aucun document</h3><p>Commencez par uploader vos documents</p><button class="btn btn-primary" onclick="App.showUploadModal()"><i class="fas fa-cloud-upload-alt"></i> Uploader un document</button></div>';
        pagination.innerHTML = '';
        return;
      }

      container.innerHTML = this.currentView === 'grille' ? this.renderGrid(data.documents) : this.renderList(data.documents);
      this._bindDocContainer(container);
      this.renderPagination(data.page, data.pages);
    } catch (err) { document.getElementById('documentsContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p><p class="text-center text-danger" style="font-size:0.8em">' + (err.message || '') + '</p>'; }
  },

  getFileIcon(type) {
    if (!type) return ['fa-file-alt', '#6b7280'];
    if (type.startsWith('image/')) return ['fa-file-image', '#f59e0b'];
    if (type.includes('pdf')) return ['fa-file-pdf', '#ef4444'];
    if (type.includes('word') || type.includes('document')) return ['fa-file-word', '#3b82f6'];
    if (type.includes('sheet') || type.includes('excel')) return ['fa-file-excel', '#10b981'];
    if (type.includes('presentation') || type.includes('powerpoint')) return ['fa-file-powerpoint', '#f97316'];
    if (type.includes('zip') || type.includes('rar')) return ['fa-file-archive', '#6366f1'];
    if (type.startsWith('video/')) return ['fa-file-video', '#8b5cf6'];
    if (type.startsWith('audio/')) return ['fa-file-audio', '#ec4899'];
    return ['fa-file-alt', '#6b7280'];
  },

  renderGrid(docs) {
    return `<div class="doc-grid">${docs.map(d => {
      const [icon, color] = this.getFileIcon(d.type_fichier);
      const tags = d.tags?.map(t => `<span class="tag" style="background:${t.couleur}22;color:${t.couleur};cursor:pointer" onclick="event.stopPropagation();DocumentsPage.filterByTag('${t.id}')">${t.nom}</span>`).join('') || '';
      return `<div class="doc-card" data-id="${d.id}" data-type="${d.type_fichier}">
        <div onclick="DocumentsPage.onCardClick('${d.id}', event)">
          <div class="doc-card-icon" style="background:${color}15;color:${color}"><i class="fas ${icon}"></i></div>
          <div class="doc-card-title">${d.titre}</div>
          <div class="doc-card-meta">${App.formatSize(d.taille)} · ${new Date(d.createdAt).toLocaleDateString()}</div>
          ${tags ? `<div class="doc-card-tags">${tags}</div>` : ''}
        </div>
        <div class="doc-card-actions" style="opacity:1;position:static;margin-top:8px;display:flex;gap:4px">
          <i class="fas fa-folder-plus btn-icon-sm" onclick="event.stopPropagation();DocumentsPage.openFolderMenu('${d.id}', this)" title="Ajouter à un dossier"></i>
          <i class="fas fa-download btn-icon-sm" onclick="event.stopPropagation();App.downloadDocument('${d.id}')" title="Télécharger"></i>
          <i class="fas fa-archive btn-icon-sm text-muted" onclick="event.stopPropagation();App.archiveDocument('${d.id}')" title="Archiver"></i>
          <i class="fas fa-trash btn-icon-sm text-danger" onclick="event.stopPropagation();App.confirmDelete('${d.id}')" title="Supprimer"></i>
          ${d.favori ? '<i class="fas fa-star" style="color:#f59e0b"></i>' : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
  },

  renderList(docs) {
    return `<div class="table-container"><table class="data-table">
      <thead><tr><th></th><th>Nom</th><th>Type</th><th>Taille</th><th>Date</th><th>Dossier</th><th>Étiquettes</th><th>Actions</th></tr></thead>
      <tbody>${docs.map(d => {
        const [icon, color] = this.getFileIcon(d.type_fichier);
        const tags = d.tags?.map(t => `<span class="tag" style="background:${t.couleur}22;color:${t.couleur};cursor:pointer" onclick="event.stopPropagation();DocumentsPage.filterByTag('${t.id}')">${t.nom}</span>`).join(' ') || '';
        return `<tr data-id="${d.id}" data-type="${d.type_fichier}" onclick="DocumentsPage.onCardClick('${d.id}', event)" style="cursor:pointer">
          <td><i class="fas ${icon}" style="color:${color};font-size:18px"></i></td>
          <td><strong>${d.titre}</strong></td>
          <td>${d.type_fichier?.split('/')[1] || '-'}</td>
          <td>${App.formatSize(d.taille)}</td>
          <td>${new Date(d.createdAt).toLocaleDateString()}</td>
          <td>${d.dossier?.nom || '-'}</td>
          <td>${tags || '<span class="text-muted" style="font-size:11px">—</span>'}</td>
          <td><span class="doc-card-actions" style="position:static;opacity:1">
            <i class="fas fa-folder-plus btn-icon-sm" onclick="event.stopPropagation();DocumentsPage.openFolderMenu('${d.id}', this)" title="Ajouter à un dossier"></i>
            <i class="fas fa-download btn-icon-sm" onclick="event.stopPropagation();App.downloadDocument('${d.id}')" title="Télécharger"></i>
            <i class="fas fa-archive btn-icon-sm text-muted" onclick="event.stopPropagation();App.archiveDocument('${d.id}')" title="Archiver"></i>
            <i class="fas fa-trash btn-icon-sm text-danger" onclick="event.stopPropagation();App.confirmDelete('${d.id}')" title="Supprimer"></i>
          </span></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  },

  renderPagination(page, pages) {
    const el = document.getElementById('docPagination');
    if (pages <= 1) { el.innerHTML = ''; return; }
    let html = `<button onclick="DocumentsPage.goTo(${page - 1})" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="${i === page ? 'active' : ''}" onclick="DocumentsPage.goTo(${i})">${i}</button>`;
    }
    html += `<button onclick="DocumentsPage.goTo(${page + 1})" ${page >= pages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
  },

  uploadToFolder() {
    App.showUploadModal(null, this.filters.dossier);
  },

  clearFolderFilter() {
    delete this.filters.dossier;
    this.currentPage = 1;
    router.navigate('/documents');
  },

  goTo(page) {
    this.currentPage = page;
    this.loadDocs();
  },

  onCardClick(id) {
    clearTimeout(this._singleClickTimer);
    this._singleClickTimer = setTimeout(() => {
      if (this._dragTriggered) {
        this._dragTriggered = false;
        return;
      }
      App.previewDocument(id);
    }, 220);
  },

  openFolderMenu(docId, anchor) {
    App.showFolderPicker(docId, anchor);
  },

  _bindDocContainer(container) {
    if (!container) return;
    container.addEventListener('dblclick', (e) => {
      if (e.button !== 0 && e.type === 'mousedown') return;
      const card = e.target.closest('.doc-card') || e.target.closest('tr[data-id]');
      if (!card || e.target.closest('.doc-card-actions, button, a, select, input, .folder-picker')) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof DragDrop === 'undefined') return;
      clearTimeout(this._singleClickTimer);
      this._dragTriggered = true;
      DragDrop.grab(card.dataset.id, card, e);
    });
  },

  filterByTag(tagId) {
    this.filters.tag = tagId;
    this.currentPage = 1;
    router.navigate(`/documents?tag=${tagId}`);
  }
};
