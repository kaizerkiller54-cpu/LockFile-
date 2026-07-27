const ActivityPage = {
  page: 1,

  async render() {
    this.page = 1;
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="menu.activity">Journal d'activité</h1>
        </div>
      </div>
      <div id="activityContainer"><p class="text-center text-muted">Chargement...</p></div>
      <div id="activityPagination" class="pagination" style="display:none"></div>
    `;
    I18N.apply();
    await this.load();
  },

  async load() {
    try {
      const container = document.getElementById('activityContainer');
      const data = await API.getActivity({ page: this.page, limit: 50 });

      if (!data.activities?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><h3>Aucune activité enregistrée</h3></div>';
        return;
      }

      const actionIcons = {
        document_cree: ['fa-file-plus', '#10b981'],
        document_modifie: ['fa-pen', '#3b82f6'],
        document_supprime: ['fa-trash', '#ef4444'],
        document_telecharge: ['fa-download', '#8b5cf6'],
        document_partage: ['fa-share', '#f59e0b'],
        document_approuve: ['fa-check-circle', '#10b981'],
        document_refuse: ['fa-times-circle', '#ef4444'],
        dossier_cree: ['fa-folder-plus', '#4f46e5'],
        dossier_modifie: ['fa-folder', '#4f46e5'],
        dossier_supprime: ['fa-folder-minus', '#ef4444'],
        connexion: ['fa-sign-in-alt', '#06b6d4'],
        deconnexion: ['fa-sign-out-alt', '#6b7280'],
        inscription: ['fa-user-plus', '#10b981'],
        permission_creee: ['fa-shield-alt', '#f59e0b'],
        permission_supprimee: ['fa-shield-alt', '#ef4444'],
        scan_effectue: ['fa-camera', '#8b5cf6'],
        recherche_effectuee: ['fa-search', '#6b7280'],
        lien_cree: ['fa-link', '#f59e0b'],
        lien_accede: ['fa-external-link-alt', '#06b6d4'],
        autre: ['fa-circle', '#6b7280']
      };

      container.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th style="width:40px"></th><th>Action</th><th>Utilisateur</th><th>Date</th><th>IP</th></tr></thead>
        <tbody>${data.activities.map(a => {
          const [icon, color] = actionIcons[a.action] || actionIcons.autre;
          const actionLabel = a.action.replace(/_/g, ' ');
          return `<tr>
            <td><i class="fas ${icon}" style="color:${color};font-size:16px"></i></td>
            <td>
              <strong>${actionLabel}</strong>
              ${a.description ? `<br><small class="text-muted">${a.description.substring(0, 120)}</small>` : ''}
            </td>
            <td>${a.utilisateur?.prenom || ''} ${a.utilisateur?.nom || ''}</td>
            <td>${new Date(a.createdAt).toLocaleString('fr')}</td>
            <td><small class="text-muted">${a.ip_address || '-'}</small></td>
          </tr>`;
        }).join('')}</tbody></table></div>`;
      this.renderPagination(data.pagination);
    } catch (err) {
      document.getElementById('activityContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>';
    }
  },

  renderPagination(p) {
    const el = document.getElementById('activityPagination');
    if (!p || p.pages <= 1) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = Array.from({ length: p.pages }, (_, i) =>
      `<button class="btn btn-sm ${i + 1 === p.page ? 'btn-primary' : 'btn-outline'}" onclick="ActivityPage.goTo(${i + 1})">${i + 1}</button>`
    ).join('');
  },

  goTo(page) { this.page = page; this.load(); }
};
