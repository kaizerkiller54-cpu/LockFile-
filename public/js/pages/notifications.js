const NotificationsPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="notifications.title">Notifications</h1>
        </div>
        <div class="page-actions">
          <button class="btn btn-sm btn-text" id="markAllPage"><i class="fas fa-trash"></i> <span data-i18n="notifications.markAll">Tout supprimer</span></button>
        </div>
      </div>
      <div id="notifsContainer" class="card"><div class="card-body text-center text-muted" data-i18n="common.loading">Chargement...</div></div>
    `;
    I18N.apply();
    document.getElementById('markAllPage').onclick = async () => {
      try { await API.deleteAllNotifications(); this.render(); App.showToast('Notifications supprimées', 'success'); } catch {}
    };
    await this.load();
  },

  async load() {
    try {
      const data = await API.getNotifications({ limit: 50 });
      const container = document.getElementById('notifsContainer');
      if (!data.notifications?.length) {
        container.innerHTML = '<div class="card"><div class="card-body"><div class="empty-state"><i class="fas fa-bell"></i><h3 data-i18n="notifications.empty">Aucune notification</h3></div></div></div>';
        I18N.apply();
        return;
      }
      container.innerHTML = `<div class="card">${data.notifications.map(n => {
        const iconMap = { document_ajoute: ['fa-file-plus', '#10b981'], document_modifie: ['fa-pen', '#3b82f6'], document_supprime: ['fa-trash', '#ef4444'], partage_recu: ['fa-share', '#8b5cf6'], version_ajoutee: ['fa-code-branch', '#f59e0b'], systeme: ['fa-cog', '#6b7280'] };
        const [icon, color] = iconMap[n.type] || ['fa-bell', '#6b7280'];
        return `<div class="notif-item ${n.lu ? '' : 'unread'}" onclick="NotificationsPage.markRead('${n.id}')" style="cursor:pointer;border-bottom:1px solid var(--gray-100)">
          <div class="notif-icon" style="background:${color}15;color:${color}"><i class="fas ${icon}"></i></div>
          <div class="notif-content">
            <div class="notif-title">${n.titre}</div>
            <div class="notif-message">${n.message}</div>
            <div class="notif-time">${new Date(n.createdAt).toLocaleString()}</div>
          </div>
        </div>`;
      }).join('')}</div>`;
    } catch {}
  },

  async markRead(id) {
    try { await API.markNotificationRead(id); this.load(); App.updateNotifBadge(); } catch {}
  }
};
