const ApprovalsPage = {
  currentTab: 'pending',

  async render() {
    if (Auth.user?.type !== 'organisation') {
      router.navigate('/dashboard');
      return;
    }
    this.page = 1;
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="approvals.title">Approbations</h1>
        </div>
      </div>
      <div class="tabs mb-4">
        <button class="tab ${this.currentTab === 'pending' ? 'active' : ''}" onclick="ApprovalsPage.switchTab('pending')"><span data-i18n="approvals.pending">En attente</span> <span class="badge" id="pendingCount"></span></button>
        <button class="tab ${this.currentTab === 'myrequests' ? 'active' : ''}" onclick="ApprovalsPage.switchTab('myrequests')"><span data-i18n="approvals.myRequests">Mes demandes</span></button>
      </div>
      <div id="approvalsContainer"><p class="text-center text-muted">Chargement...</p></div>
      <div id="approvalsPagination" class="pagination" style="display:none"></div>
    `;
    I18N.apply();
    await this.load();
  },

  switchTab(tab) { this.currentTab = tab; this.render(); },

  async load() {
    const container = document.getElementById('approvalsContainer');
    try {
      if (this.currentTab === 'pending') await this.loadPending(container);
      else await this.loadMyRequests(container);
    } catch { container.innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async loadPending(container) {
    const data = await API.getPendingApprovals({ page: this.page, limit: 20 });
    document.getElementById('pendingCount').textContent = data.pagination?.total || 0;
    if (!data.approvals?.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>Aucune demande en attente</h3></div>';
      return;
    }
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th>Priorité</th><th>Document</th><th>Demandeur</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${data.approvals.map(a => {
        const prioColor = a.priorite === 'urgente' ? '#ef4444' : a.priorite === 'haute' ? '#f59e0b' : '#6b7280';
        return `<tr>
          <td><span class="tag" style="background:${prioColor}22;color:${prioColor}">${a.priorite}</span></td>
          <td><strong>${a.document?.titre || 'N/A'}</strong><br><small class="text-muted">${a.document?.type_fichier || ''}</small></td>
          <td>${a.demandeur?.prenom || ''} ${a.demandeur?.nom || ''}</td>
          <td>${new Date(a.date_demande).toLocaleDateString()}</td>
          <td>
            <button class="btn btn-sm btn-primary" onclick="ApprovalsPage.decide(${a.id},'approuve')"><i class="fas fa-check"></i></button>
            <button class="btn btn-sm btn-danger" onclick="ApprovalsPage.decide(${a.id},'refuse')"><i class="fas fa-times"></i></button>
          </td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
    this.renderPagination(data.pagination);
  },

  async loadMyRequests(container) {
    const data = await API.getMyApprovalRequests({ page: this.page, limit: 20 });
    if (!data.approvals?.length) {
      container.innerHTML = '<div class="empty-state"><i class="fas fa-paper-plane"></i><h3>Aucune demande envoyée</h3></div>';
      return;
    }
    container.innerHTML = `<div class="table-container"><table class="data-table">
      <thead><tr><th>Document</th><th>Approbateur</th><th>Statut</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${data.approvals.map(a => {
        const statutColor = { en_attente: '#f59e0b', approuve: '#10b981', refuse: '#ef4444', annule: '#6b7280' }[a.statut] || '#6b7280';
        const statutLabel = { en_attente: 'En attente', approuve: 'Approuvé', refuse: 'Refusé', annule: 'Annulé' }[a.statut] || a.statut;
        return `<tr>
          <td><strong>${a.document?.titre || 'N/A'}</strong></td>
          <td>${a.approbateur?.prenom || ''} ${a.approbateur?.nom || ''}</td>
          <td><span class="tag" style="background:${statutColor}22;color:${statutColor}">${statutLabel}</span></td>
          <td>${new Date(a.date_demande).toLocaleDateString()}</td>
          <td>${a.statut === 'en_attente' ? `<button class="btn btn-sm btn-danger" onclick="ApprovalsPage.cancel(${a.id})"><i class="fas fa-ban"></i></button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
    this.renderPagination(data.pagination);
  },

  renderPagination(p) {
    const el = document.getElementById('approvalsPagination');
    if (!p || p.pages <= 1) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = Array.from({ length: p.pages }, (_, i) =>
      `<button class="btn btn-sm ${i + 1 === p.page ? 'btn-primary' : 'btn-outline'}" onclick="ApprovalsPage.goTo(${i + 1})">${i + 1}</button>`
    ).join('');
  },

  goTo(page) { this.page = page; this.load(); },

  async decide(id, decision) {
    const commentaire = prompt(decision === 'approuve' ? 'Commentaire (optionnel):' : 'Motif du refus:');
    if (commentaire === null) return;
    try {
      await API.approvalDecision(id, { decision, commentaire });
      App.showToast(decision === 'approuve' ? 'Document approuvé' : 'Document refusé', 'success');
      this.load();
    } catch (err) { App.showToast(err.message, 'error'); }
  },

  async cancel(id) {
    if (!confirm('Annuler cette demande ?')) return;
    try {
      await API.cancelApproval(id);
      App.showToast('Demande annulée', 'success');
      this.load();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
