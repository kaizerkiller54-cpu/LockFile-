const TagsPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="tags.title">Étiquettes</h1>
          <p>Classez vos documents avec des étiquettes</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" id="newTagBtn"><i class="fas fa-tag"></i> <span data-i18n="tags.new">Nouvelle étiquette</span></button>
        </div>
      </div>
      <div id="tagsContainer"><p class="text-center text-muted" data-i18n="common.loading">Chargement...</p></div>
    `;
    I18N.apply();
    document.getElementById('newTagBtn').onclick = () => this.showTagModal();
    await this.loadTags();
  },

  async loadTags() {
    try {
      const data = await API.getTags();
      const container = document.getElementById('tagsContainer');
      if (!data.tags?.length) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-tags"></i><h3>Aucune étiquette</h3><p>Créez des étiquettes pour mieux classer vos documents</p></div>';
        return;
      }
      container.innerHTML = `<div class="doc-grid">${data.tags.map(t => `
        <div class="doc-card">
          <div class="doc-card-icon" style="background:${t.couleur}15;color:${t.couleur}"><i class="fas fa-tag"></i></div>
          <div class="doc-card-title">${t.nom}</div>
          <div class="doc-card-meta">
            <span class="tag" style="background:${t.couleur}22;color:${t.couleur}">${t.nom}</span>
          </div>
          <div class="doc-card-actions" style="opacity:1;position:static;margin-top:12px">
            <button class="btn btn-sm btn-outline" onclick="TagsPage.editTag('${t.id}','${t.nom}','${t.couleur}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger" onclick="TagsPage.deleteTag('${t.id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `).join('')}</div>`;
    } catch { document.getElementById('tagsContainer').innerHTML = '<p class="text-center text-muted">Erreur de chargement</p>'; }
  },

  async showTagModal(tag = null) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${tag ? 'Modifier l\'étiquette' : 'Nouvelle étiquette'}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="tagForm">
            <div class="form-group">
              <label>Nom de l'étiquette</label>
              <input type="text" class="form-control" id="tagName" value="${tag ? tag.nom : ''}" required>
            </div>
            <div class="form-group">
              <label>Couleur</label>
              <input type="color" class="form-control" id="tagColor" value="${tag ? tag.couleur : '#6366f1'}" style="height:44px;padding:4px">
            </div>
            <div class="modal-footer-actions">
              <button type="button" class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
              <button type="submit" class="btn btn-primary">${tag ? 'Modifier' : 'Créer'}</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('tagForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const nom = document.getElementById('tagName').value;
        const couleur = document.getElementById('tagColor').value;
        if (tag) await API.updateTag(tag.id, { nom, couleur });
        else await API.createTag({ nom, couleur });
        overlay.remove();
        App.showToast(tag ? 'Étiquette modifiée' : 'Étiquette créée', 'success');
        this.loadTags();
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  },

  editTag(id, nom, couleur) { this.showTagModal({ id, nom, couleur }); },

  async deleteTag(id) {
    if (!confirm('Supprimer cette étiquette ?')) return;
    try {
      await API.deleteTag(id);
      App.showToast('Étiquette supprimée', 'success');
      this.loadTags();
    } catch (err) { App.showToast(err.message, 'error'); }
  }
};
