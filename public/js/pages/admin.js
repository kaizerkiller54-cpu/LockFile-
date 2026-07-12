const AdminPage = {
  async render() {
    if (Auth.user?.role !== 'admin') {
      router.navigate('#/dashboard');
      return;
    }
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="admin.title">Administration</h1>
          <p data-i18n="admin.subtitle">Gestion des utilisateurs</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="createUserBtn"><i class="fas fa-user-plus"></i> Créer un utilisateur</button>
        </div>
      </div>
      <div id="adminContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
    `;
    I18N.apply();
    document.getElementById('createUserBtn').onclick = () => this.showCreateModal();
    await this.load();
  },

  async load() {
    try {
      const data = await API.getUsers();
      const container = document.getElementById('adminContainer');
      if (!data.users?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>Aucun utilisateur</h3></div>';
        return;
      }
      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Inscrit le</th><th>Actions</th></tr></thead>
        <tbody>${data.users.map(u => `
          <tr>
            <td><strong>${u.prenom} ${u.nom}</strong></td>
            <td>${u.email}</td>
            <td><span class="tag" style="background:${u.role === 'admin' ? '#8b5cf622' : u.role === 'lecteur' ? '#f59e0b22' : '#3b82f622'};color:${u.role === 'admin' ? '#8b5cf6' : u.role === 'lecteur' ? '#f59e0b' : '#3b82f6'}">${u.role}</span></td>
            <td>${u.actif ? '<span class="tag" style="background:#10b98122;color:#10b981">Actif</span>' : '<span class="tag" style="background:#ef444422;color:#ef4444">Inactif</span>'}</td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="AdminPage.toggleRole('${u.id}','${u.role}')" title="Changer rôle"><i class="fas fa-user-shield"></i></button>
              <button class="btn btn-sm ${u.actif ? 'btn-warning' : 'btn-success'}" onclick="AdminPage.toggleActive('${u.id}')"><i class="fas ${u.actif ? 'fa-ban' : 'fa-check'}"></i></button>
              <button class="btn btn-sm btn-danger" onclick="AdminPage.deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        `).join('')}</tbody></table></div>`;
    } catch { document.getElementById('adminContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  showCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>Créer un utilisateur</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="createUserForm">
            <div class="form-row">
              <div class="form-group">
                <label>Prénom</label>
                <input type="text" class="form-control" id="cuPrenom" required>
              </div>
              <div class="form-group">
                <label>Nom</label>
                <input type="text" class="form-control" id="cuNom" required>
              </div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" id="cuEmail" placeholder="email@exemple.com" required>
            </div>
            <div class="form-group">
              <label>Nom d'utilisateur</label>
              <input type="text" class="form-control" id="cuUsername" required>
            </div>
            <div class="form-group">
              <label>Mot de passe (min. 6 caractères)</label>
              <input type="password" class="form-control" id="cuPassword" required minlength="6">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Rôle</label>
                <select class="form-control" id="cuRole">
                  <option value="utilisateur">Utilisateur</option>
                  <option value="admin">Administrateur</option>
                  <option value="lecteur">Lecteur</option>
                </select>
              </div>
              <div class="form-group">
                <label>Type de compte</label>
                <select class="form-control" id="cuType">
                  <option value="particulier">Particulier</option>
                  <option value="organisation"> Organisation</option>
                </select>
              </div>
            </div>
            <div class="form-group" id="cuEmployesGroup" style="display:none">
              <label>Nombre d'employés</label>
              <input type="number" class="form-control" id="cuEmployes" min="1">
            </div>
            <div class="modal-footer-actions">
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
              <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i> Créer</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('cuType').onchange = () => {
      document.getElementById('cuEmployesGroup').style.display =
        document.getElementById('cuType').value === 'organisation' ? 'block' : 'none';
    };

    document.getElementById('createUserForm').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
      try {
        await API.createUser({
          prenom: document.getElementById('cuPrenom').value,
          nom: document.getElementById('cuNom').value,
          email: document.getElementById('cuEmail').value,
          username: document.getElementById('cuUsername').value,
          password: document.getElementById('cuPassword').value,
          role: document.getElementById('cuRole').value,
          type: document.getElementById('cuType').value,
          nombre_employes: document.getElementById('cuType').value === 'organisation'
            ? parseInt(document.getElementById('cuEmployes').value) : null
        });
        overlay.remove();
        App.showToast('Utilisateur créé avec succès', 'success');
        this.load();
      } catch (err) { App.showToast(err.message, 'error'); btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer'; }
    };
  },

  async toggleRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'utilisateur' : currentRole === 'utilisateur' ? 'lecteur' : 'admin';
    if (!confirm(`Changer le rôle en "${newRole}" ?`)) return;
    try {
      await API.updateUserRole(id, newRole);
      App.showToast('Rôle mis à jour', 'success');
      this.load();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async toggleActive(id) {
    if (!confirm('Activer/Désactiver cet utilisateur ?')) return;
    try {
      await API.toggleUserActive(id);
      App.showToast('Statut mis à jour', 'success');
      this.load();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async deleteUser(id) {
    if (!confirm('Supprimer définitivement cet utilisateur ?')) return;
    try {
      await API.deleteUser(id);
      App.showToast('Utilisateur supprimé', 'success');
      this.load();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};