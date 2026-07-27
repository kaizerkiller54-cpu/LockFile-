const ProfilePage = {
  async render() {
    const content = document.getElementById('pageContent');
    const u = Auth.user;
    if (!u) { content.innerHTML = '<div class="empty-state"><p>Veuillez vous reconnecter</p></div>'; return; }
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="profile.title">Mon profil</h1>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="profileForm">
            <div class="form-row">
              <div class="form-group">
                <label>Prénom</label>
                <input type="text" class="form-control" id="prenom" value="${u.prenom}">
              </div>
              <div class="form-group">
                <label>Nom</label>
                <input type="text" class="form-control" id="nom" value="${u.nom}">
              </div>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" class="form-control" value="${u.email}" disabled style="opacity:.6">
            </div>
            <div class="form-group">
              <label>Type de compte</label>
              <div style="display:flex;gap:12px;padding:8px 0">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="profileType" value="particulier" ${u.type !== 'organisation' ? 'checked' : ''} onchange="document.getElementById('profileEmployesGroup').style.display='none'">
                  <span>Particulier</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="profileType" value="organisation" ${u.type === 'organisation' ? 'checked' : ''} onchange="document.getElementById('profileEmployesGroup').style.display='block'">
                  <span>Organisation / Entreprise</span>
                </label>
              </div>
            </div>
            <div class="form-group" id="profileEmployesGroup" style="display:${u.type === 'organisation' ? 'block' : 'none'}">
              <label>Nombre d'employés</label>
              <input type="number" class="form-control" id="profileEmployes" min="1" value="${u.nombre_employes || ''}">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Téléphone</label>
                <input type="text" class="form-control" id="telephone" value="${u.telephone || ''}">
              </div>
              <div class="form-group">
                <label>Poste</label>
                <input type="text" class="form-control" id="poste" value="${u.poste || ''}">
              </div>
            </div>
            <div class="form-group">
              <label>Langue</label>
              <select class="form-control" id="langue">
                <option value="fr" ${u.langue === 'fr' ? 'selected' : ''}>Français</option>
                <option value="en" ${u.langue === 'en' ? 'selected' : ''}>English</option>
                <option value="es" ${u.langue === 'es' ? 'selected' : ''}>Español</option>
                <option value="de" ${u.langue === 'de' ? 'selected' : ''}>Deutsch</option>
                <option value="pt" ${u.langue === 'pt' ? 'selected' : ''}>Português</option>
              </select>
            </div>
            <div class="modal-footer-actions">
              <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> <span data-i18n="common.save">Enregistrer</span></button>
            </div>
          </form>
        </div>
      </div>
      <div class="card mt-4">
        <div class="card-header"><h3 class="card-title">Changer le mot de passe</h3></div>
        <div class="card-body">
          <form id="passwordForm">
            <div class="form-group">
              <label>Mot de passe actuel</label>
              <input type="password" class="form-control" id="currentPassword" required>
            </div>
            <div class="form-group">
              <label>Nouveau mot de passe (min. 6 caractères)</label>
              <input type="password" class="form-control" id="newPassword" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary"><i class="fas fa-key"></i> Mettre à jour</button>
          </form>
        </div>
      </div>
    `;
    I18N.apply();
    document.getElementById('profileForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const isOrg = document.querySelector('input[name="profileType"]:checked').value === 'organisation';
        const data = await API.updateProfile({
          prenom: document.getElementById('prenom').value,
          nom: document.getElementById('nom').value,
          telephone: document.getElementById('telephone').value,
          poste: document.getElementById('poste').value,
          langue: document.getElementById('langue').value,
          type: isOrg ? 'organisation' : 'particulier',
          nombre_employes: isOrg ? parseInt(document.getElementById('profileEmployes').value) : null
        });
        Auth.updateUser(data.user);
        I18N.setLang(data.user.langue);
        App.updateUI();
        App.showToast('Profil mis à jour', 'success');
      } catch (err) { App.showToast(err.message, 'error'); }
    };
    document.getElementById('passwordForm').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await API.updatePassword({
          currentPassword: document.getElementById('currentPassword').value,
          newPassword: document.getElementById('newPassword').value
        });
        App.showToast('Mot de passe mis à jour', 'success');
        document.getElementById('passwordForm').reset();
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  }
};
