const SettingsPage = {
  async render() {
    const u = Auth.user;
    const content = document.getElementById('pageContent');
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h1 data-i18n="settings.title">Paramètres</h1>
        </div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title" data-i18n="settings.theme">Thème</h3></div>
        <div class="card-body">
          <div class="flex gap-4">
            <button class="btn ${document.documentElement.dataset.theme === 'light' ? 'btn-primary' : 'btn-outline'}" id="themeLight"><i class="fas fa-sun"></i> <span data-i18n="settings.light">Clair</span></button>
            <button class="btn ${document.documentElement.dataset.theme === 'dark' ? 'btn-primary' : 'btn-outline'}" id="themeDark"><i class="fas fa-moon"></i> <span data-i18n="settings.dark">Sombre</span></button>
          </div>
        </div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title" data-i18n="settings.language">Langue</h3></div>
        <div class="card-body">
          <select class="form-control" id="settingsLang" style="max-width:300px">
            <option value="fr" ${u.langue === 'fr' ? 'selected' : ''}>🇫🇷 Français</option>
            <option value="en" ${u.langue === 'en' ? 'selected' : ''}>🇬🇧 English</option>
            <option value="es" ${u.langue === 'es' ? 'selected' : ''}>🇪🇸 Español</option>
            <option value="de" ${u.langue === 'de' ? 'selected' : ''}>🇩🇪 Deutsch</option>
            <option value="pt" ${u.langue === 'pt' ? 'selected' : ''}>🇧🇷 Português</option>
          </select>
        </div>
      </div>
      <div class="card mb-4">
        <div class="card-header"><h3 class="card-title">Notifications</h3></div>
        <div class="card-body">
          <div class="form-group">
            <label class="flex items-center gap-2" style="cursor:pointer">
              <input type="checkbox" ${u.preferences?.notifications_email !== false ? 'checked' : ''} id="notifEmail">
              <span data-i18n="settings.notifEmail">Notifications par email</span>
            </label>
          </div>
          <div class="form-group">
            <label class="flex items-center gap-2" style="cursor:pointer">
              <input type="checkbox" ${u.preferences?.notifications_push !== false ? 'checked' : ''} id="notifPush">
              <span data-i18n="settings.notifPush">Notifications push</span>
            </label>
          </div>
          <button class="btn btn-primary" id="saveSettings"><i class="fas fa-save"></i> <span data-i18n="common.save">Enregistrer</span></button>
        </div>
      </div>
    `;
    I18N.apply();

    document.getElementById('themeLight').onclick = () => App.setTheme('light');
    document.getElementById('themeDark').onclick = () => App.setTheme('dark');
    document.getElementById('settingsLang').onchange = async (e) => {
      I18N.setLang(e.target.value);
      try { await API.updateProfile({ langue: e.target.value }); } catch {}
    };
    document.getElementById('saveSettings').onclick = async () => {
      try {
        await API.updateProfile({
          preferences: {
            notifications_email: document.getElementById('notifEmail').checked,
            notifications_push: document.getElementById('notifPush').checked
          }
        });
        App.showToast('Paramètres enregistrés', 'success');
      } catch (err) { App.showToast(err.message, 'error'); }
    };
  }
};
