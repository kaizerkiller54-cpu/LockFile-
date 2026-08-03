const DragDrop = {
  active: false,
  docId: null,
  ghost: null,
  panel: null,
  panelVisible: false,
  folders: null,
  _sourceEl: null,
  _moveHandler: null,
  _upHandler: null,
  _keyHandler: null,

  init() {},

  grab(docId, el, evt) {
    if (this.active) this.cancel();
    this.active = true;
    this.docId = docId;
    this._sourceEl = el;
    el.classList.add('dnd-source');

    const type = el.dataset.type || '';
    const [icon, color] = (typeof DocumentsPage !== 'undefined' && DocumentsPage.getFileIcon) ? DocumentsPage.getFileIcon(type) : ['fa-file-alt', '#6b7280'];
    const title = (el.querySelector('.doc-card-title')?.textContent || el.querySelector('td strong')?.textContent || 'Document').trim();

    this.ghost = document.createElement('div');
    this.ghost.className = 'dnd-ghost';
    this.ghost.innerHTML = `
      <div class="dnd-ghost-card">
        <div class="dnd-ghost-icon" style="background:${color}1a;color:${color}"><i class="fas ${icon}"></i></div>
        <div class="dnd-ghost-body">
          <div class="dnd-ghost-title"></div>
          <div class="dnd-ghost-hint"><i class="fas fa-arrows-alt"></i> Déplacer vers un dossier</div>
        </div>
      </div>
    `;
    this.ghost.querySelector('.dnd-ghost-title').textContent = title;
    document.body.appendChild(this.ghost);

    const startX = evt?.clientX ?? window.innerWidth / 2;
    const startY = evt?.clientY ?? window.innerHeight / 2;
    this.ghost.style.transform = `translate3d(${startX + 16}px, ${startY - 12}px, 0)`;

    document.body.style.userSelect = 'none';

    this._moveHandler = (e) => this.onMove(e);
    this._upHandler = (e) => this.onUp(e);
    this._keyHandler = (e) => { if (e.key === 'Escape') this.cancel(); };
    document.addEventListener('mousemove', this._moveHandler);
    document.addEventListener('mouseup', this._upHandler);
    document.addEventListener('touchmove', this._moveHandler, { passive: false });
    document.addEventListener('touchend', this._upHandler);
    document.addEventListener('keydown', this._keyHandler);

    if (typeof App !== 'undefined') App.showToast('Document attrapé — survolez « Dossiers » pour le déplacer', 'info');
  },

  onMove(e) {
    if (!this.active) return;
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    if (this.ghost) this.ghost.style.transform = `translate3d(${x + 16}px, ${y - 12}px, 0)`;

    const nav = document.getElementById('navFolders');
    if (!nav) return;
    const r = nav.getBoundingClientRect();
    let over = x >= r.left - 24 && x <= r.right + 24 && y >= r.top - 24 && y <= r.bottom + 24;
    if (this.panel) {
      const pr = this.panel.getBoundingClientRect();
      over = over || (x >= pr.left - 8 && x <= pr.right + 8 && y >= pr.top - 8 && y <= pr.bottom + 8);
    }
    if (over && !this.panelVisible) this.showPanel(nav);
    if (!over && this.panelVisible) this.hidePanel();
  },

  async showPanel(nav) {
    this.panelVisible = true;
    if (nav) nav.classList.add('dnd-highlight');
    if (!this.folders) {
      try {
        const data = await API.getFolderTree();
        this.folders = this.flattenTree(data.tree || []);
      } catch {
        this.folders = [];
      }
    }
    if (!this.panel) {
      this.panel = document.createElement('div');
      this.panel.className = 'dnd-panel';
      this.panel.innerHTML = this.renderPanel();
      document.body.appendChild(this.panel);
      requestAnimationFrame(() => this.panel.classList.add('dnd-panel-in'));
    }
    const r = nav ? nav.getBoundingClientRect() : { left: 0, top: 0 };
    const w = 264;
    let left = r.right + 10;
    if (left + w > window.innerWidth - 12) left = r.left - w - 10;
    this.panel.style.left = left + 'px';
    this.panel.style.top = Math.max(8, r.top) + 'px';
  },

  flattenTree(nodes, depth, out) {
    depth = depth || 0;
    out = out || [];
    (nodes || []).forEach(n => {
      out.push({ id: n.id, nom: n.nom, depth });
      this.flattenTree(n.children || [], depth + 1, out);
    });
    return out;
  },

  renderPanel() {
    let items = '';
    if (!this.folders || !this.folders.length) {
      items = `<div class="dnd-panel-empty">Aucun dossier disponible.<br><span class="dnd-panel-link" onclick="router.navigate('/folders');DragDrop.cancel()">Créer un dossier</span></div>`;
    } else {
      items = `<div class="dnd-folder-item dnd-panel-root" onclick="DragDrop.moveToFolder('')">
        <i class="fas fa-folder-open" style="color:#6b7280"></i>
        <span>Racine (sans dossier)</span>
        <i class="fas fa-chevron-right dnd-panel-arrow"></i>
      </div>`;
      items += this.folders.map((f, i) => {
        const style = `padding-left:${10 + f.depth * 18}px;animation-delay:${i * 28}ms`;
        return `<div class="dnd-folder-item" style="${style}" onclick="DragDrop.moveToFolder('${f.id}')">
          <i class="fas ${f.depth ? 'fa-folder-open' : 'fa-folder'}" style="color:#4f46e5"></i>
          <span>${DragDrop.escapeHtml(f.nom)}</span>
          <i class="fas fa-chevron-right dnd-panel-arrow"></i>
        </div>`;
      }).join('');
    }
    return `
      <div class="dnd-panel-header"><i class="fas fa-folder"></i> Choisir le dossier</div>
      ${items}
    `;
  },

  escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  hidePanel() {
    this.panelVisible = false;
    const nav = document.getElementById('navFolders');
    if (nav) nav.classList.remove('dnd-highlight');
    if (this.panel) { this.panel.remove(); this.panel = null; }
  },

  onUp(e) {
    if (!this.active) return;
    if (this.panelVisible) {
      const inPanel = e.target.closest && e.target.closest('.dnd-panel');
      const nav = document.getElementById('navFolders');
      const inNav = nav && nav.contains(e.target);
      if (inPanel || inNav) return;
    }
    this.cancel();
  },

  async moveToFolder(folderId) {
    if (!this.active) return;
    const docId = this.docId;
    const folderName = folderId ? (this.folders?.find(f => String(f.id) === String(folderId))?.nom || 'Dossier') : 'Racine';
    this.active = false;
    this._cleanupListeners();

    const g = this.ghost;
    if (g) {
      const gRect = g.getBoundingClientRect();
      let tx = gRect.left, ty = gRect.top;
      if (this.panel) {
        const pr = this.panel.getBoundingClientRect();
        tx = pr.left + pr.width / 2;
        ty = pr.top + pr.height / 2;
      }
      g.style.transition = 'transform .38s cubic-bezier(.5,-.25,.72,.5), opacity .38s ease';
      g.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(.22)`;
      g.style.opacity = '0';
      setTimeout(() => g.remove(), 380);
    }
    this.hidePanel();
    if (this._sourceEl) { this._sourceEl.classList.remove('dnd-source'); this._sourceEl = null; }

    try {
      const fd = new FormData();
      fd.append('dossier', folderId);
      await API.updateDocument(docId, fd);
      if (typeof App !== 'undefined') App.showToast(`Document déplacé vers « ${folderName} »`, 'success');
      this._refresh();
    } catch (err) {
      if (typeof App !== 'undefined') App.showToast(err.message || 'Erreur lors du déplacement', 'error');
    }
  },

  _refresh() {
    if (typeof router !== 'undefined' && router.currentRoute === '/documents') {
      if (typeof DocumentsPage !== 'undefined' && DocumentsPage.loadDocs) DocumentsPage.loadDocs();
    } else if (typeof router !== 'undefined' && router.currentRoute === '/folders') {
      if (typeof FoldersPage !== 'undefined' && FoldersPage.render) FoldersPage.render();
    }
  },

  cancel() {
    if (!this.active && !this.ghost) return;
    this.active = false;
    this._cleanupListeners();
    if (this.ghost) { this.ghost.remove(); this.ghost = null; }
    if (this._sourceEl) { this._sourceEl.classList.remove('dnd-source'); this._sourceEl = null; }
    this.hidePanel();
  },

  _cleanupListeners() {
    document.removeEventListener('mousemove', this._moveHandler);
    document.removeEventListener('mouseup', this._upHandler);
    document.removeEventListener('touchmove', this._moveHandler);
    document.removeEventListener('touchend', this._upHandler);
    document.removeEventListener('keydown', this._keyHandler);
    this._moveHandler = this._upHandler = this._keyHandler = null;
    document.body.style.userSelect = '';
  }
};
