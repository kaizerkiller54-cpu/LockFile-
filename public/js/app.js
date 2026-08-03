const App = {
  _assignDocAfterUpload: null,

  async init() {
    const authenticated = await Auth.init();
    if (authenticated) {
      this.initApp();
    } else {
      this.showAuthPage();
    }
  },

  initApp() {
    document.getElementById('loadingScreen').classList.add('hide');
    document.querySelector('#app > .sidebar').style.display = 'flex';
    document.querySelector('#app > .main-content').style.display = 'block';
    document.querySelector('.auth-page')?.remove();

    const navApprovals = document.getElementById('navApprovals');
    if (navApprovals) {
      navApprovals.style.display = Auth.user?.type === 'organisation' ? 'flex' : 'none';
    }

    router.setContentEl(document.getElementById('pageContent'));

    this.updateUI();
    this.initEventListeners();
    this.registerRoutes();
    if (typeof DragDrop !== 'undefined' && DragDrop.init) DragDrop.init();
    router.start();
    this.updateNotifBadge();
    setInterval(() => this.updateNotifBadge(), 30000);
  },

  updateUI() {
    const u = Auth.user;
    if (!u) return;
    document.getElementById('sidebarName').textContent = `${u.prenom} ${u.nom}`;
    document.getElementById('sidebarRole').textContent = u.role;
    document.getElementById('headerName').textContent = u.prenom;
    document.getElementById('headerAvatar').src = u.photo || '/assets/avatar-default.svg';
    document.getElementById('sidebarAvatar').src = u.photo || '/assets/avatar-default.svg';
    I18N.setLang(u.langue || 'fr');
    document.getElementById('langSelector').value = u.langue || 'fr';
    const adminSection = document.getElementById('adminNavSection');
    if (adminSection) adminSection.style.display = u.role === 'admin' ? 'block' : 'none';
    const navApprovals = document.getElementById('navApprovals');
    if (navApprovals) navApprovals.style.display = u.type === 'organisation' ? 'flex' : 'none';
    this.applyTheme();
  },

  registerRoutes() {
    router.add('/login', () => {
      if (Auth.isAuthenticated()) {
        window.location.hash = '/dashboard';
        return;
      }
      App.showAuthPage();
    });
    router.add('/dashboard', () => DashboardPage.render());
    router.add('/documents', () => DocumentsPage.render());
    router.add('/folders', () => FoldersPage.render());
    router.add('/tags', () => TagsPage.render());
    router.add('/notifications', () => NotificationsPage.render());
    router.add('/shared', () => SharedPage.render());
    router.add('/archive', () => ArchivePage.render());
    router.add('/trash', () => TrashPage.render());
    router.add('/admin', () => AdminPage.render());
    router.add('/backup', () => BackupPage.render());
    router.add('/scan', () => ScanPage.render());
    router.add('/search', () => SearchPage.render());
    router.add('/profile', () => ProfilePage.render());
    router.add('/settings', () => SettingsPage.render());
    router.add('/approvals', () => ApprovalsPage.render());
    router.add('/activity', () => ActivityPage.render());
  },

  initEventListeners() {
    document.getElementById('sidebarToggle').onclick = () => {
      document.getElementById('sidebar').classList.toggle('open');
    };
    document.getElementById('sidebarClose').onclick = () => {
      document.getElementById('sidebar').classList.remove('open');
    };
    document.getElementById('logoutBtn').onclick = () => this.logout();
    document.getElementById('logoutBtn2').onclick = () => this.logout();

    document.getElementById('themeToggle').onclick = () => {
      const current = document.documentElement.dataset.theme;
      this.setTheme(current === 'dark' ? 'light' : 'dark');
    };

    document.getElementById('langSelector').onchange = (e) => {
      I18N.setLang(e.target.value);
      API.updateProfile({ langue: e.target.value }).catch(() => {});
    };

    document.getElementById('userDropdownBtn').onclick = () => {
      document.getElementById('dropdownMenu').classList.toggle('show');
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-dropdown')) {
        document.getElementById('dropdownMenu').classList.remove('show');
      }
    });

    document.getElementById('uploadBtn').onclick = () => this.showUploadModal();

    document.getElementById('notifBtn').onclick = () => {
      document.getElementById('notifPanel').classList.toggle('active');
      if (document.getElementById('notifPanel').classList.contains('active')) {
        this.loadNotifPanel();
      }
    };
    document.getElementById('markAllRead').onclick = async () => {
      try { await API.deleteAllNotifications(); this.updateNotifBadge(); this.loadNotifPanel(); } catch {}
    };

    document.getElementById('uploadModalClose').onclick = () => this.hideUploadModal();
    document.getElementById('uploadCancel').onclick = () => this.hideUploadModal();
    document.getElementById('uploadModal').onclick = (e) => {
      if (e.target === document.getElementById('uploadModal')) this.hideUploadModal();
    };

    const uploadZone = document.getElementById('uploadZone');
    uploadZone.onclick = () => document.getElementById('fileInput').click();
    uploadZone.ondragover = (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); };
    uploadZone.ondragleave = () => uploadZone.classList.remove('dragover');
    uploadZone.ondrop = (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); this.handleFiles(e.dataTransfer.files); };
    document.getElementById('fileInput').onchange = (e) => this.handleFiles(e.target.files);

    document.getElementById('uploadForm').onsubmit = (e) => {
      e.preventDefault();
      this.uploadFile();
    };

    document.getElementById('notifPanel').onclick = (e) => {
      const item = e.target.closest('.notif-item');
      if (item) {
        const id = item.dataset.id;
        const link = item.dataset.link;
        if (id) {
          API.markNotificationRead(id).then(() => this.updateNotifBadge());
        }
        if (link) {
          document.getElementById('notifPanel').classList.remove('active');
          router.navigate(link);
        }
      }
    };

    let searchTimeout;
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
      searchInput.oninput = (e) => {
        clearTimeout(searchTimeout);
        const val = e.target.value;
        if (!val.trim()) {
          this.closeSearchDropdown();
          return;
        }
        searchTimeout = setTimeout(() => this.showLiveSearchSuggestions(val), 300);
      };
      searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.closeSearchDropdown();
          this.globalSearch(searchInput.value);
        } else if (e.key === 'Escape') {
          this.closeSearchDropdown();
        }
      };
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar')) {
          this.closeSearchDropdown();
        }
      });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'k') {
          e.preventDefault();
          const searchInput = document.getElementById('globalSearch');
          if (searchInput) searchInput.focus();
        }
        if (e.key === 'u') {
          e.preventDefault();
          this.showUploadModal();
        }
      }
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => modal.remove());
        document.getElementById('notifPanel')?.classList.remove('active');
      }
    });
  },

  showAuthPage() {
    document.querySelector('.auth-page')?.remove();
    document.getElementById('loadingScreen').classList.add('hide');
    document.querySelector('#app > .sidebar').style.display = 'none';
    document.querySelector('#app > .main-content').style.display = 'none';

    const authPage = document.createElement('div');
    authPage.className = 'auth-page';
    authPage.innerHTML = `
      <div class="auth-card" id="authCard">
        <div class="logo">
          <i class="fas fa-lock"></i>
          <span>LockFile</span>
        </div>
        <p class="auth-title">Application d'archivage de documents</p>
        <div id="authContent">
          <form id="loginForm">
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" id="loginEmail" placeholder="votre@email.com" required>
            </div>
            <div class="form-group">
              <label>Mot de passe</label>
              <input type="password" class="form-control" id="loginPassword" placeholder="••••••" required>
            </div>
            <button type="submit" class="btn btn-primary">
              <i class="fas fa-sign-in-alt"></i> Se connecter
            </button>
          </form>
          <p class="auth-footer">
            Pas encore de compte ? <a href="#" id="showRegister">Créer un compte</a>
          </p>
        </div>
      </div>
    `;
    document.getElementById('app').appendChild(authPage);

    document.getElementById('loginForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connexion...';
      try {
        await Auth.login(
          document.getElementById('loginEmail').value,
          document.getElementById('loginPassword').value
        );
        window.location.hash = '/dashboard';
        this.initApp();
      } catch (err) {
        App.showToast(err.message, 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Se connecter';
      }
    };

    document.getElementById('showRegister').onclick = (e) => {
      e.preventDefault();
      this.showRegisterForm();
    };
  },

  showRegisterForm() {
    const content = document.getElementById('authContent');
    content.innerHTML = `
      <form id="registerForm">
        <div class="form-row">
          <div class="form-group">
            <label>Prénom</label>
            <input type="text" class="form-control" id="regPrenom" required>
          </div>
          <div class="form-group">
            <label>Nom</label>
            <input type="text" class="form-control" id="regNom" required>
          </div>
        </div>
        <div class="form-group">
          <label>Email</label>
          <input type="email" class="form-control" id="regEmail" placeholder="votre@email.com" required>
        </div>
        <div class="form-group">
          <label>Nom d'utilisateur</label>
          <input type="text" class="form-control" id="regUsername" required>
        </div>
        <div class="form-group">
          <label>Type de compte</label>
          <select class="form-control" id="regType">
            <option value="particulier">Particulier</option>
            <option value="organisation">Organisation / Entreprise</option>
          </select>
        </div>
        <div class="form-group" id="regEmployesGroup" style="display:none">
          <label>Nombre d'employés</label>
          <input type="number" class="form-control" id="regEmployes" min="1" placeholder="Ex: 50">
        </div>
        <div class="form-group">
          <label>Mot de passe (min. 6 caractères)</label>
          <input type="password" class="form-control" id="regPassword" required minlength="6">
        </div>
        <button type="submit" class="btn btn-primary">
          <i class="fas fa-user-plus"></i> Créer mon compte
        </button>
      </form>
      <p class="auth-footer">
        Déjà un compte ? <a href="#" id="showLogin">Se connecter</a>
      </p>
    `;

    document.getElementById('regType').onchange = () => {
      const isOrg = document.getElementById('regType').value === 'organisation';
      document.getElementById('regEmployesGroup').style.display = isOrg ? 'block' : 'none';
      document.getElementById('regEmployes').required = isOrg;
    };

    document.getElementById('registerForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
      try {
        await Auth.register({
          prenom: document.getElementById('regPrenom').value,
          nom: document.getElementById('regNom').value,
          email: document.getElementById('regEmail').value,
          username: document.getElementById('regUsername').value,
          password: document.getElementById('regPassword').value,
          type: document.getElementById('regType').value,
          nombre_employes: document.getElementById('regType').value === 'organisation'
            ? parseInt(document.getElementById('regEmployes').value) : null
        });
        window.location.hash = '/dashboard';
        this.initApp();
      } catch (err) {
        App.showToast(err.message, 'error');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer mon compte';
      }
    };

    document.getElementById('showLogin').onclick = (e) => {
      e.preventDefault();
      this.showAuthPage();
    };
  },

  async showUploadModal(docId = null, preselectFolder = null) {
    const modal = document.getElementById('uploadModal');
    modal.classList.add('active');
    document.getElementById('uploadProgress').style.display = 'none';
    document.getElementById('uploadForm').reset();
    document.getElementById('fileInput').value = '';
    document.getElementById('fileInfo').textContent = '';

    const form = document.getElementById('uploadForm');
    let banner = document.getElementById('uploadAssignBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'uploadAssignBanner';
      banner.className = 'upload-assign-banner';
      form.insertBefore(banner, form.firstChild);
    }
    if (this._assignDocAfterUpload && !docId) {
      banner.style.display = 'block';
      banner.innerHTML = '<i class="fas fa-info-circle"></i> Choisissez un <strong>dossier</strong> ci-dessous, puis uploadez un document. Le document d’origine sera automatiquement rangé dans ce dossier.';
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }

    if (docId) {
      document.getElementById('uploadForm').dataset.docId = docId;
      document.querySelector('#uploadForm .modal-footer-actions').innerHTML = `
        <button type="button" class="btn btn-secondary" id="uploadCancel" onclick="App.hideUploadModal()">${I18N.t('common.cancel')}</button>
        <button type="submit" class="btn btn-primary" id="uploadSubmit"><i class="fas fa-cloud-upload-alt"></i> ${I18N.t('upload.newVersion')}</button>
      `;
      try {
        const data = await API.getDocument(docId);
        const doc = data.document;
        document.getElementById('fileInfo').textContent = `Nouvelle version pour: ${doc.titre}`;
      } catch {}
    } else {
      delete document.getElementById('uploadForm').dataset.docId;
    }

    try {
      const folders = await API.getFolders();
      const sel = document.getElementById('docFolder');
      sel.innerHTML = '<option value="">Aucun dossier</option>';
      folders.folders.forEach(f => {
        sel.innerHTML += `<option value="${f.id}">${f.nom}</option>`;
      });
      if (preselectFolder && !docId) sel.value = preselectFolder;
    } catch {}

    try {
      const tags = await API.getTags();
      const sel = document.getElementById('docTags');
      sel.innerHTML = '';
      tags.tags.forEach(t => {
        sel.innerHTML += `<option value="${t.id}" style="color:${t.couleur}">${t.nom}</option>`;
      });
    } catch {}
  },

  hideUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
    document.getElementById('uploadForm').dataset.docId = '';
    this._assignDocAfterUpload = null;
    const banner = document.getElementById('uploadAssignBanner');
    if (banner) { banner.style.display = 'none'; banner.innerHTML = ''; }
    document.querySelector('#uploadForm .modal-footer-actions').innerHTML = `
      <button type="button" class="btn btn-secondary" id="uploadCancel" onclick="App.hideUploadModal()">${I18N.t('common.cancel')}</button>
      <button type="submit" class="btn btn-primary" id="uploadSubmit"><i class="fas fa-upload"></i> ${I18N.t('upload.submit')}</button>
    `;
  },

  async showEditModal(id) {
    try {
      const data = await API.getDocument(id);
      const doc = data.document;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay active';
      overlay.innerHTML = `
        <div class="modal">
          <div class="modal-header">
            <h3>Modifier le document</h3>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="editForm">
              <div class="form-group">
                <label>Titre</label>
                <input type="text" class="form-control" id="editTitle" value="${doc.titre}" required>
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea class="form-control" id="editDesc" rows="2">${doc.description || ''}</textarea>
              </div>
              <div class="form-group">
                <label>Dossier</label>
                <select class="form-control" id="editFolder"></select>
              </div>
              <div class="form-group">
                <label>Étiquettes</label>
                <select class="form-control" id="editTags" multiple></select>
              </div>
              <div class="modal-footer-actions">
                <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
                <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const folders = await API.getFolders();
      const folderSel = document.getElementById('editFolder');
      folderSel.innerHTML = '<option value="">Aucun dossier</option>';
      folders.folders.forEach(f => {
        folderSel.innerHTML += `<option value="${f.id}" ${doc.dossier_id == f.id ? 'selected' : ''}>${f.nom}</option>`;
      });

      const tags = await API.getTags();
      const tagSel = document.getElementById('editTags');
      tagSel.innerHTML = '';
      const docTagIds = doc.tags?.map(t => t.id) || [];
      tags.tags.forEach(t => {
        tagSel.innerHTML += `<option value="${t.id}" ${docTagIds.includes(t.id) ? 'selected' : ''} style="color:${t.couleur}">${t.nom}</option>`;
      });

      document.getElementById('editForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';
        try {
          const fd = new FormData();
          fd.append('titre', document.getElementById('editTitle').value);
          fd.append('description', document.getElementById('editDesc').value);
          fd.append('dossier', document.getElementById('editFolder').value);
          const tagVals = Array.from(document.getElementById('editTags').selectedOptions).map(o => o.value);
          if (tagVals.length) fd.append('tags', JSON.stringify(tagVals));
          await API.updateDocument(id, fd);
          overlay.remove();
          document.querySelector('.preview-overlay')?.remove();
          this.showToast('Document modifié', 'success');
          if (router.currentRoute === '/documents') DocumentsPage.loadDocs();
        } catch (err) { this.showToast(err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; }
      };
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  handleFiles(files) {
    if (!files.length) return;
    const file = files[0];
    document.getElementById('fileInfo').textContent = `${file.name} (${this.formatSize(file.size)})`;
    const title = document.getElementById('docTitle');
    if (!title.value) title.value = file.name.replace(/\.[^/.]+$/, '');
  },

  async uploadFile() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput.files.length) {
      App.showToast('Veuillez sélectionner un fichier', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('fichier', fileInput.files[0]);
    formData.append('titre', document.getElementById('docTitle').value || fileInput.files[0].name);
    formData.append('description', document.getElementById('docDesc').value);
    const folderVal = document.getElementById('docFolder').value;
    formData.append('dossier', folderVal);
    const tags = Array.from(document.getElementById('docTags').selectedOptions).map(o => o.value);
    if (tags.length) formData.append('tags', JSON.stringify(tags));

    const docId = document.getElementById('uploadForm').dataset.docId;
    const assignDocId = this._assignDocAfterUpload;
    if (assignDocId && !docId && !folderVal) {
      App.showToast('Sélectionnez un dossier pour y placer le document d’origine', 'warning');
      return;
    }

    const progress = document.getElementById('uploadProgress');
    progress.style.display = 'block';
    document.getElementById('uploadSubmit').disabled = true;

    // Simulate progress
    let p = 0;
    const interval = setInterval(() => {
      p = Math.min(p + Math.random() * 15, 90);
      document.getElementById('progressFill').style.width = p + '%';
      document.getElementById('progressText').textContent = Math.round(p) + '%';
    }, 200);

    try {
      if (docId) {
        await API.updateDocument(docId, formData);
      } else {
        await API.uploadDocument(formData);
        if (assignDocId) {
          const fd = new FormData();
          fd.append('dossier', folderVal);
          await API.updateDocument(assignDocId, fd);
          this._assignDocAfterUpload = null;
        }
      }
      clearInterval(interval);
      document.getElementById('progressFill').style.width = '100%';
      document.getElementById('progressText').textContent = '100%';
      setTimeout(() => {
        this.hideUploadModal();
        document.querySelector('.preview-overlay')?.remove();
        const msg = docId ? 'Nouvelle version uploadée' : (assignDocId ? 'Documents rangés dans le dossier' : 'Document uploadé avec succès');
        App.showToast(msg, 'success');
        if (router.currentRoute === '/dashboard') DashboardPage.render();
        else if (router.currentRoute === '/documents') DocumentsPage.loadDocs();
      }, 500);
    } catch (err) {
      clearInterval(interval);
      progress.style.display = 'none';
      App.showToast(err.message, 'error');
    }
    document.getElementById('uploadSubmit').disabled = false;
  },

  async previewDocument(id) {
    try {
      const data = await API.getDocument(id);
      const doc = data.document;
      const versions = await API.getVersions(id);
      const [icon, color] = DocumentsPage.getFileIcon(doc.type_fichier);

      const overlay = document.createElement('div');
      overlay.className = 'preview-overlay active';
      overlay.innerHTML = `
        <div class="preview-modal">
          <div class="preview-header">
            <h2><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${doc.titre}</h2>
            <button class="modal-close" onclick="this.closest('.preview-overlay').remove()">&times;</button>
          </div>
          <div class="preview-body">
            <div class="preview-info">
              <div class="preview-field"><label>Type</label><span>${doc.type_fichier}</span></div>
              <div class="preview-field"><label>Taille</label><span>${this.formatSize(doc.taille)}</span></div>
              <div class="preview-field"><label>Date d'ajout</label><span>${new Date(doc.createdAt).toLocaleString()}</span></div>
              <div class="preview-field"><label>Version</label><span>${doc.version_actuelle}</span></div>
              <div class="preview-field"><label>Dossier</label><span>${doc.dossier?.nom || '-'}</span></div>
              <div class="preview-field"><label>Favori</label><span>${doc.favori ? '⭐ Oui' : 'Non'}</span></div>
              ${doc.url ? '<div class="preview-field"><label>Stockage</label><span>☁️ Firebase Cloud</span></div>' : '<div class="preview-field"><label>Stockage</label><span>💻 Local</span></div>'}
            </div>
            ${doc.description ? `<p style="margin-bottom:16px;color:var(--gray-500)">${doc.description}</p>` : ''}
            ${doc.tags?.length ? `<div style="margin-bottom:16px">${doc.tags.map(t => `<span class="tag" style="background:${t.couleur}22;color:${t.couleur};margin-right:4px">${t.nom}</span>`).join('')}</div>` : ''}
            <div class="flex gap-2 mb-4" style="flex-wrap:wrap">
              <button class="btn btn-outline" onclick="App.downloadDocument('${id}')"><i class="fas fa-download"></i> Télécharger</button>
              <button class="btn btn-outline" onclick="App.showFolderPicker('${id}')"><i class="fas fa-folder-plus"></i> Ajouter à un dossier</button>
              <button class="btn btn-outline" onclick="App.shareDocument('${id}')"><i class="fas fa-share-alt"></i> Partager</button>
              <button class="btn btn-outline ${doc.favori ? 'text-warning' : ''}" onclick="App.toggleFav('${id}', ${!doc.favori})">
                <i class="fas fa-star"></i> ${doc.favori ? 'Retirer favori' : 'Ajouter favori'}
              </button>
              <button class="btn btn-outline" onclick="App.showEditModal('${id}')"><i class="fas fa-pen"></i> Modifier</button>
              <button class="btn btn-outline" onclick="App.showUploadModal('${id}')"><i class="fas fa-cloud-upload-alt"></i> Nouvelle version</button>
              ${doc.statut === 'actif' ? `<button class="btn btn-outline text-muted" onclick="App.archiveDocument('${id}')"><i class="fas fa-archive"></i> Archiver</button>` : ''}
              <button class="btn btn-danger" onclick="App.confirmDelete('${id}')"><i class="fas fa-trash"></i> Supprimer</button>
            </div>
            <div class="preview-versions">
              <h4>Historique des versions</h4>
              ${versions.versions?.length ? versions.versions.map(v => `
                <div class="version-item">
                  <div>
                    <div class="version-number">v${v.numero_version}</div>
                    <div class="version-date">${new Date(v.createdAt).toLocaleString()} · ${v.modifie_par?.prenom || 'Inconnu'} ${v.modifie_par?.nom || ''}</div>
                    <div style="font-size:12px;color:var(--gray-400)">${v.commentaire || ''}</div>
                  </div>
                  <div class="version-actions">
                    <button class="btn btn-sm btn-outline" onclick="App.restoreVersion('${id}','${v.id}')"><i class="fas fa-undo"></i> Restaurer</button>
                  </div>
                </div>
              `).join('') : '<p style="color:var(--gray-400);font-size:13px">Aucune version précédente</p>'}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async toggleFav(id, fav) {
    try {
      const formData = new FormData();
      formData.append('favori', fav);
      await API.updateDocument(id, formData);
      this.showToast(fav ? 'Ajouté aux favoris' : 'Retiré des favoris', 'success');
      document.querySelector('.preview-overlay')?.remove();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async archiveDocument(id) {
    if (!confirm('Archiver ce document ? Le fichier sera compressé et stocké dans le cloud.')) return;
    try {
      await API.archiveDocument(id);
      this.showToast('Document archivé avec compression', 'success');
      document.querySelector('.preview-overlay')?.remove();
      if (router.currentRoute === '/documents') DocumentsPage.loadDocs();
      else if (router.currentRoute === '/dashboard') DashboardPage.render();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async restoreVersion(docId, versionId) {
    try {
      await API.restoreVersion(docId, versionId);
      this.showToast('Version restaurée', 'success');
      document.querySelector('.preview-overlay')?.remove();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async shareDialog(id, type, name) {
    const isFolder = type === 'folder';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Partager ${isFolder ? 'le dossier' : 'le document'}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="shareForm">
            <p class="text-muted" style="margin-bottom:16px">${name}</p>
            <div class="form-group">
              <label>Nom d'utilisateur ou email du destinataire</label>
              <input type="text" class="form-control" id="shareRecipient" placeholder="username ou email@exemple.com">
            </div>
            <div class="form-group">
              <label>Permission</label>
              <select class="form-control" id="sharePermission">
                <option value="lecture">Lecture seule</option>
                <option value="ecriture">Modification</option>
              </select>
            </div>
            <div class="modal-footer-actions">
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
              <button type="submit" class="btn btn-primary"><i class="fas fa-share"></i> Partager</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('shareForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const recipient = document.getElementById('shareRecipient').value.trim();
        const niveau = document.getElementById('sharePermission').value;
        const payload = { niveau };
        if (recipient.includes('@')) payload.email = recipient;
        else payload.username = recipient;

        if (isFolder) await API.shareFolder(id, payload);
        else await API.shareDocument(id, payload);
        overlay.remove();
        App.showToast(`${isFolder ? 'Dossier' : 'Document'} partagé avec succès`, 'success');
      } catch (err) { this.showToast(err.message, 'error'); }
    };
  },

  async shareDocument(id) {
    try {
      const data = await API.getDocument(id);
      this.shareDialog(id, 'document', data.document?.titre || 'Document');
    } catch { this.shareDialog(id, 'document', 'Document'); }
  },
  shareFolder(id, name) { this.shareDialog(id, 'folder', name); },

  async downloadDocument(id) {
    try {
      await API.downloadFile(id);
      this.showToast('Téléchargement lancé', 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async showFolderPicker(docId) {
    document.getElementById('folderPickerOverlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'folderPickerOverlay';
    overlay.innerHTML = `
      <div class="modal folder-picker-modal">
        <div class="modal-header">
          <h3><i class="fas fa-folder-plus" style="color:var(--primary);margin-right:6px"></i>Ajouter à un dossier</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body" id="folderPickerBody">${typeof Skeleton !== 'undefined' && Skeleton.list ? Skeleton.list(4) : ''}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    try {
      const data = await API.getFolders();
      const body = document.getElementById('folderPickerBody');
      const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      let items = `<div class="folder-picker-item" data-doc="${docId}" data-folder="">
        <i class="fas fa-folder-open" style="color:#6b7280"></i><span>Racine (sans dossier)</span>
      </div>`;
      items += (data.folders || []).map(f =>
        `<div class="folder-picker-item" data-doc="${docId}" data-folder="${f.id}" data-name="${esc(f.nom)}">
          <i class="fas fa-folder" style="color:${f.couleur || '#4f46e5'}"></i><span>${esc(f.nom)}</span>
        </div>`
      ).join('');
      body.innerHTML = (items || '') +
        `<div class="folder-picker-item folder-picker-new" data-action="new-doc-folder" data-doc="${docId}">
          <i class="fas fa-plus"></i><span>Nouveau dossier</span>
        </div>`;
      body.querySelectorAll('.folder-picker-item[data-folder]').forEach(el => {
        el.onclick = () => {
          const id = el.dataset.doc;
          const folderId = el.dataset.folder;
          const name = el.dataset.name || 'Racine';
          App.moveDocumentToFolder(id, folderId, name);
        };
      });
      body.querySelector('[data-action="new-doc-folder"]')?.addEventListener('click', () => {
        App.createFolderForDocument(docId);
      });
    } catch (err) {
      document.getElementById('folderPickerBody').innerHTML = '<div class="folder-picker-empty">Erreur de chargement</div>';
    }
  },

  async moveDocumentToFolder(docId, folderId, folderName) {
    document.getElementById('folderPickerOverlay')?.remove();
    try {
      const fd = new FormData();
      fd.append('dossier', folderId);
      await API.updateDocument(docId, fd);
      this.showToast(`Document ajouté au dossier « ${folderName || 'Racine'} »`, 'success');
      document.querySelector('.preview-overlay')?.remove();
      if (typeof router !== 'undefined' && router.currentRoute === '/documents') DocumentsPage.loadDocs();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  createFolderForDocument(docId) {
    document.getElementById('folderPickerOverlay')?.remove();
    if (typeof FoldersPage !== 'undefined' && FoldersPage.showFolderModal) {
      FoldersPage.showFolderModal(null, async (folder) => {
        if (!folder) return;
        await this.moveDocumentToFolder(docId, folder.id, folder.nom);
      });
      return;
    }
    this.showToast('Impossible d’ouvrir la création de dossier', 'error');
  },

  async confirmDelete(id) {
    if (!confirm('Supprimer ce document ?')) return;
    try {
      await API.deleteDocument(id);
      this.showToast('Document supprimé', 'success');
      document.querySelector('.preview-overlay')?.remove();
      if (router.currentRoute === '/dashboard') await DashboardPage.render();
      else if (router.currentRoute === '/documents') DocumentsPage.loadDocs();
      else if (router.currentRoute === '/archive') ArchivePage.load();
      else if (router.currentRoute === '/trash') TrashPage.load();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async globalSearch(q) {
    if (!q || !q.trim()) return;
    this.closeSearchDropdown();
    router.navigate('/search?q=' + encodeURIComponent(q.trim()));
  },

  async showLiveSearchSuggestions(query) {
    const q = (query || '').trim();
    if (!q) {
      this.closeSearchDropdown();
      return;
    }

    try {
      const data = await API.searchSuggestions(q);
      const searchBar = document.querySelector('.search-bar');
      if (!searchBar) return;

      this.closeSearchDropdown();

      const hasDocs = data.documents && data.documents.length > 0;
      const hasFolders = data.folders && data.folders.length > 0;

      if (!hasDocs && !hasFolders) {
        const emptyDropdown = document.createElement('div');
        emptyDropdown.className = 'search-dropdown';
        emptyDropdown.id = 'searchDropdown';
        emptyDropdown.innerHTML = `
          <div class="search-dropdown-header">Aucun résultat instantané</div>
          <div class="search-suggestion-item" style="cursor:default">
            <div class="search-suggestion-content">
              <div class="search-suggestion-title text-muted">Aucun document ne correspond à "${q}"</div>
            </div>
          </div>
          <div class="search-dropdown-footer" onclick="App.globalSearch('${q.replace(/'/g, "\\'")}')">
            Lancer la recherche complète &rarr;
          </div>
        `;
        searchBar.appendChild(emptyDropdown);
        return;
      }

      const dropdown = document.createElement('div');
      dropdown.className = 'search-dropdown';
      dropdown.id = 'searchDropdown';

      let html = '';

      if (hasDocs) {
        html += `<div class="search-dropdown-header">Documents (${data.documents.length})</div>`;
        data.documents.forEach(doc => {
          const [icon, color] = typeof DocumentsPage !== 'undefined' && DocumentsPage.getFileIcon ? DocumentsPage.getFileIcon(doc.type_fichier) : ['fa-file-alt', '#6b7280'];
          const titleHighlighted = this.highlightMatch(doc.titre, q);
          const folderName = doc.dossier?.nom ? ` &middot; Dossier: ${doc.dossier.nom}` : '';
          html += `
            <div class="search-suggestion-item" onclick="App.previewDocument('${doc.id}'); App.closeSearchDropdown();">
              <i class="fas ${icon} search-suggestion-icon" style="color:${color}"></i>
              <div class="search-suggestion-content">
                <div class="search-suggestion-title">${titleHighlighted}</div>
                <div class="search-suggestion-meta">${this.formatSize(doc.taille)}${folderName}</div>
              </div>
            </div>
          `;
        });
      }

      if (hasFolders) {
        html += `<div class="search-dropdown-header">Dossiers (${data.folders.length})</div>`;
        data.folders.forEach(f => {
          const nameHighlighted = this.highlightMatch(f.nom, q);
          html += `
            <div class="search-suggestion-item" onclick="router.navigate('/documents?dossier=${f.id}'); App.closeSearchDropdown();">
              <i class="fas fa-folder search-suggestion-icon" style="color:#4f46e5"></i>
              <div class="search-suggestion-content">
                <div class="search-suggestion-title">${nameHighlighted}</div>
                <div class="search-suggestion-meta">Dossier</div>
              </div>
            </div>
          `;
        });
      }

      html += `
        <div class="search-dropdown-footer" onclick="App.globalSearch('${q.replace(/'/g, "\\'")}')">
          Voir tous les résultats pour "${q}" &rarr;
        </div>
      `;

      dropdown.innerHTML = html;
      searchBar.appendChild(dropdown);
    } catch (err) {
      console.error('Erreur autocomplétion:', err);
    }
  },

  closeSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.remove();
  },

  highlightMatch(text, query) {
    if (!text || !query) return text || '';
    const tokens = query.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return text;
    const escaped = tokens.map(t => t.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return (text || '').replace(regex, '<mark class="search-highlight">$1</mark>');
  },

  async loadNotifPanel() {
    try {
      const data = await API.getNotifications({ limit: 20 });
      const list = document.getElementById('notifList');
      if (!data.notifications?.length) {
        list.innerHTML = '<div class="notif-empty" data-i18n="notifications.empty">Aucune notification</div>';
        I18N.apply();
        return;
      }
      list.innerHTML = data.notifications.map(n => {
        const iconMap = { document_ajoute: ['fa-file-plus', '#10b981'], document_modifie: ['fa-pen', '#3b82f6'], document_supprime: ['fa-trash', '#ef4444'], partage_recu: ['fa-share', '#8b5cf6'], version_ajoutee: ['fa-code-branch', '#f59e0b'], systeme: ['fa-cog', '#6b7280'] };
        const [icon, color] = iconMap[n.type] || ['fa-bell', '#6b7280'];
        return `<div class="notif-item ${n.lu ? '' : 'unread'}" data-id="${n.id}" data-link="${n.lien || ''}">
          <div class="notif-icon" style="background:${color}15;color:${color}"><i class="fas ${icon}"></i></div>
          <div class="notif-content">
            <div class="notif-title">${n.titre}</div>
            <div class="notif-message">${n.message}</div>
            <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
          </div>
        </div>`;
      }).join('');
    } catch {}
  },

  async updateNotifBadge() {
    try {
      const data = await API.getNotifications({ limit: 1 });
      const badge = document.getElementById('notifBadge');
      const dot = document.getElementById('notifDot');
      if (data.nonLu > 0) {
        badge.textContent = data.nonLu > 99 ? '99+' : data.nonLu;
        badge.style.display = 'inline';
        dot.style.display = 'block';
      } else {
        badge.style.display = 'none';
        dot.style.display = 'none';
      }
    } catch {}
  },

  setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    const icon = document.getElementById('themeToggle').querySelector('i');
    icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  },

  applyTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    this.setTheme(saved);
  },

  logout() {
    Auth.logout();
    document.querySelector('.auth-page')?.remove();
    this.showAuthPage();
  },

  formatSize(bytes) {
    const num = Number(bytes);
    if (!num || isNaN(num)) return '0 o';
    const units = ['o', 'Ko', 'Mo', 'Go'];
    let i = 0;
    let size = num;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  },

  showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span><i class="fas fa-times toast-close" onclick="this.parentElement.remove()"></i>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all .3s'; setTimeout(() => toast.remove(), 300); }, 4000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
