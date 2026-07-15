const ScanPage = {
  mediaStream: null,
  capturedImage: null,

  async render() {
    const container = document.getElementById('pageContent');
    container.innerHTML = `
      <div class="page-header">
        <h1><i class="fas fa-camera"></i> Scanner un document</h1>
        <p class="text-muted">Capturez un document via la caméra ou importez une image</p>
      </div>
      <div class="scan-container">
        <div class="scan-methods">
          <button class="btn btn-primary" id="scanCameraBtn"><i class="fas fa-camera"></i> Caméra</button>
          <button class="btn btn-outline" id="scanUploadBtn"><i class="fas fa-file-upload"></i> Importer un fichier</button>
        </div>
        <div class="scan-preview" id="scanPreview" style="display:none">
          <video id="scanVideo" autoplay playsinline style="display:none"></video>
          <canvas id="scanCanvas" style="display:none"></canvas>
          <img id="scanImage" style="display:none;max-width:100%;max-height:400px">
        </div>
        <input type="file" id="scanFileInput" accept="image/*,application/pdf" style="display:none">
        <div class="scan-form" id="scanForm" style="display:none">
          <div class="form-group">
            <label>Titre du document</label>
            <input type="text" id="scanTitre" class="form-control" placeholder="Titre">
          </div>
          <div class="form-group">
            <label>Description</label>
            <textarea id="scanDescription" class="form-control" rows="2" placeholder="Description optionnelle"></textarea>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Dossier</label>
              <select id="scanDossier" class="form-control">
                <option value="">Aucun dossier</option>
              </select>
            </div>
            <div class="form-group">
              <label>Format</label>
              <select id="scanFormat" class="form-control">
                <option value="jpeg">JPEG</option>
                <option value="png">PNG</option>
                <option value="pdf">PDF</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Étiquettes</label>
            <select id="scanTags" class="form-control" multiple></select>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="scanOcr">
              <span>Extraire le texte (OCR)</span>
            </label>
          </div>
          <div class="scan-actions">
            <button class="btn btn-primary" id="scanSubmitBtn"><i class="fas fa-upload"></i> Envoyer</button>
            <button class="btn btn-secondary" id="scanCancelBtn">Annuler</button>
          </div>
          <div class="scan-progress" id="scanProgress" style="display:none">
            <div class="progress-bar"><div class="progress-fill" id="scanProgressFill"></div></div>
            <span class="progress-text" id="scanProgressText">0%</span>
          </div>
        </div>
        <div class="scan-result" id="scanResult" style="display:none"></div>
      </div>
    `;

    this.bindEvents();
    this.loadFolders();
    this.loadTags();
  },

  bindEvents() {
    document.getElementById('scanCameraBtn').onclick = () => this.startCamera();
    document.getElementById('scanUploadBtn').onclick = () => document.getElementById('scanFileInput').click();
    document.getElementById('scanFileInput').onchange = (e) => this.handleFile(e);
    document.getElementById('scanSubmitBtn').onclick = () => this.submitScan();
    document.getElementById('scanCancelBtn').onclick = () => this.reset();
  },

  async loadFolders() {
    try {
      const data = await API.getFolders({ parent: 'null' });
      const select = document.getElementById('scanDossier');
      data.folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = f.nom;
        select.appendChild(opt);
      });
    } catch {}
  },

  async loadTags() {
    try {
      const data = await API.getTags();
      const select = document.getElementById('scanTags');
      data.tags.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.nom;
        select.appendChild(opt);
      });
    } catch {}
  },

  async startCamera() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
      const video = document.getElementById('scanVideo');
      video.srcObject = this.mediaStream;
      video.style.display = 'block';
      document.getElementById('scanPreview').style.display = 'block';
      document.getElementById('scanImage').style.display = 'none';
      document.getElementById('scanCanvas').style.display = 'none';

      const captureBtn = document.createElement('button');
      captureBtn.className = 'btn btn-primary';
      captureBtn.id = 'scanCaptureBtn';
      captureBtn.innerHTML = '<i class="fas fa-circle"></i> Capturer';
      captureBtn.onclick = () => this.capture();
      const existing = document.getElementById('scanCaptureBtn');
      if (existing) existing.remove();
      document.getElementById('scanPreview').appendChild(captureBtn);
      document.getElementById('scanForm').style.display = 'none';
    } catch (err) {
      App.showToast('Erreur caméra: ' + err.message, 'error');
    }
  },

  capture() {
    const video = document.getElementById('scanVideo');
    const canvas = document.getElementById('scanCanvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    this.capturedImage = canvas.toDataURL('image/jpeg', 0.85);
    const img = document.getElementById('scanImage');
    img.src = this.capturedImage;
    img.style.display = 'block';
    video.style.display = 'none';
    video.srcObject?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    document.getElementById('scanCaptureBtn')?.remove();
    document.getElementById('scanForm').style.display = 'block';
  },

  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const preview = document.getElementById('scanPreview');
    preview.style.display = 'block';
    document.getElementById('scanVideo').style.display = 'none';
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = document.getElementById('scanImage');
        img.src = ev.target.result;
        img.style.display = 'block';
        this.capturedImage = ev.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      const img = document.getElementById('scanImage');
      img.src = '';
      img.style.display = 'none';
      this.capturedImage = null;
    }
    this.selectedFile = file;
    document.getElementById('scanForm').style.display = 'block';
    document.getElementById('scanTitre').value = file.name.replace(/\.[^/.]+$/, '');
  },

  async submitScan() {
    const titre = document.getElementById('scanTitre').value.trim();
    const description = document.getElementById('scanDescription').value.trim();
    const dossier = document.getElementById('scanDossier').value;
    const format = document.getElementById('scanFormat').value;
    const doOcr = document.getElementById('scanOcr').checked;
    const tags = Array.from(document.getElementById('scanTags').selectedOptions).map(o => parseInt(o.value));

    const formData = new FormData();
    if (this.selectedFile) {
      formData.append('fichier', this.selectedFile);
    } else if (this.capturedImage) {
      const blob = await (await fetch(this.capturedImage)).blob();
      formData.append('fichier', blob, `scan-${Date.now()}.jpg`);
    } else {
      App.showToast('Aucune image à envoyer', 'error');
      return;
    }

    if (titre) formData.append('titre', titre);
    if (description) formData.append('description', description);
    if (dossier) formData.append('dossier', dossier);
    formData.append('format', format);
    formData.append('ocr', doOcr);
    if (tags.length > 0) formData.append('tags', JSON.stringify(tags));

    const btn = document.getElementById('scanSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
    document.getElementById('scanProgress').style.display = 'flex';

    try {
      const data = await API.scanUpload(formData);
      document.getElementById('scanProgress').style.display = 'none';
      const resultDiv = document.getElementById('scanResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div class="alert alert-success">
          <i class="fas fa-check-circle"></i> Document importé avec succès !
        </div>
        <p><strong>${data.document.titre}</strong></p>
        <p class="text-muted">Type: ${data.document.type_fichier} | Taille: ${(data.document.taille / 1024).toFixed(1)} Ko</p>
        ${data.ocr && data.ocr.text ? `<div class="ocr-result"><h4>Texte extrait (OCR):</h4><p class="ocr-text">${data.ocr.text.substring(0, 500)}</p></div>` : ''}
        <a href="#/documents" class="btn btn-primary"><i class="fas fa-folder-open"></i> Voir les documents</a>
        <button class="btn btn-outline" onclick="ScanPage.reset()"><i class="fas fa-camera"></i> Scanner un autre</button>
      `;
    } catch (err) {
      App.showToast(err.message, 'error');
      document.getElementById('scanProgress').style.display = 'none';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-upload"></i> Envoyer';
    }
  },

  reset() {
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.capturedImage = null;
    this.selectedFile = null;
    document.getElementById('scanPreview').style.display = 'none';
    document.getElementById('scanForm').style.display = 'none';
    document.getElementById('scanResult').style.display = 'none';
    document.getElementById('scanProgress').style.display = 'none';
    document.getElementById('scanVideo').style.display = 'none';
    document.getElementById('scanImage').style.display = 'none';
    document.getElementById('scanCanvas').style.display = 'none';
    document.getElementById('scanFileInput').value = '';
  }
};
