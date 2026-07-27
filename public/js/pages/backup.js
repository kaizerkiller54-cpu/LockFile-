const BackupPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1><i class="fas fa-database"></i> <span data-i18n="backup.title">Sauvegarde & Restauration</span></h1>
          <p data-i18n="backup.subtitle">Exportez et importez vos documents et métadonnées</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="createBackupBtn"><i class="fas fa-save"></i> Créer une sauvegarde</button>
        </div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-info-circle"></i> <span data-i18n="backup.info">Informations</span></h3></div>
        <div class="card-body" style="display:flex;gap:20px;flex-wrap:wrap">
          <div class="stat-card" style="flex:1;min-width:150px"><div class="stat-info"><div class="stat-value" id="backupCount">-</div><div class="stat-label">Sauvegardes</div></div></div>
          <div class="stat-card" style="flex:1;min-width:150px"><div class="stat-info"><div class="stat-value" id="backupLatest">-</div><div class="stat-label">Dernière sauvegarde</div></div></div>
          <div class="stat-card" style="flex:1;min-width:150px"><div class="stat-info"><div class="stat-value" id="backupTotalSize">-</div><div class="stat-label">Taille totale</div></div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title"><i class="fas fa-history"></i> <span data-i18n="backup.history">Historique des sauvegardes</span></h3></div>
        <div class="card-body" id="backupList"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
      </div>
    `;
    I18N.apply();
    document.getElementById('createBackupBtn').onclick = () => this.createBackup();
    await this.loadBackups();
  },

  async loadBackups() {
    try {
      const data = await API.getBackups();
      const list = document.getElementById('backupList');
      const backups = data.backups || [];
      document.getElementById('backupCount').textContent = backups.length;

      if (!backups.length) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-database"></i><h3>Aucune sauvegarde</h3><p>Créez votre première sauvegarde pour protéger vos données</p></div>';
        document.getElementById('backupLatest').textContent = '-';
        document.getElementById('backupTotalSize').textContent = '-';
        return;
      }

      const latest = backups[0];
      document.getElementById('backupLatest').textContent = new Date(latest.date).toLocaleDateString();
      document.getElementById('backupTotalSize').textContent = App.formatSize(backups.reduce((s, b) => s + b.size, 0));

      list.innerHTML = `<div class="table-container"><table class="data-table">
        <thead><tr><th>Nom</th><th>Taille</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>${backups.map(b => `
          <tr>
            <td><i class="fas fa-archive" style="color:#6366f1;margin-right:8px"></i>${b.name}</td>
            <td>${App.formatSize(b.size)}</td>
            <td>${new Date(b.date).toLocaleString()}</td>
            <td>
              <button class="btn btn-sm btn-outline" onclick="BackupPage.restoreBackup('${b.name}', event)"><i class="fas fa-undo"></i> Restaurer</button>
              <button class="btn btn-sm btn-danger" onclick="BackupPage.deleteBackup('${b.name}')"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`).join('')}</tbody></table></div>`;
    } catch { document.getElementById('backupList').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async createBackup() {
    const btn = document.getElementById('createBackupBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
    try {
      const data = await API.createBackup();
      App.showToast(`Sauvegarde créée (${App.formatSize(data.size)})`, 'success');
      await this.loadBackups();
    } catch (err) { App.showToast(err.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Créer une sauvegarde';
  },

  async restoreBackup(name, e) {
    if (!confirm(`Restaurer la sauvegarde "${name}" ? Cela remplacera les fichiers actuels.`)) return;
    const btn = e?.target || document.querySelector(`[onclick*="${name}"]`);
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';
    try {
      await API.restoreBackup(name);
      App.showToast('Restauration terminée', 'success');
    } catch (err) { App.showToast(err.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-undo"></i> Restaurer';
  },

  async deleteBackup(name) {
    if (!confirm(`Supprimer la sauvegarde "${name}" ?`)) return;
    try {
      await API.deleteBackup(name);
      App.showToast('Sauvegarde supprimée', 'success');
      await this.loadBackups();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
