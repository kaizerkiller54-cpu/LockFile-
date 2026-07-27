const ScanPage = {
  mediaStream: null,
  capturedImage: null,
  selectedFile: null,
  previewToken: null,

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

        <!-- Étape 1 : Configuration -->
        <div class="scan-form" id="scanForm" style="display:none">
          <h3><i class="fas fa-cog"></i> Configuration</h3>
          <div class="form-group">
            <label>Format de sortie</label>
            <select id="scanFormat" class="form-control">
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="scanOcr" checked>
              <span><strong>Extraire le texte (OCR)</strong> — tu pourras le modifier avant d'enregistrer</span>
            </label>
          </div>
          <button class="btn btn-primary" id="scanPreviewBtn"><i class="fas fa-search"></i> Analyser le document</button>
          <div class="scan-progress" id="scanProgress" style="display:none">
            <div class="progress-bar"><div class="progress-fill" id="scanProgressFill"></div></div>
            <span class="progress-text" id="scanProgressText">Analyse OCR...</span>
          </div>
        </div>

        <!-- Étape 2 : Révision du texte OCR -->
        <div class="scan-review" id="scanReview" style="display:none">
          <div class="review-header">
            <h3><i class="fas fa-file-alt"></i> Réviser et confirmer</h3>
            <p class="text-muted">Vérifie le texte extrait, modifie-le si nécessaire, puis confirme.</p>
          </div>
          <div class="form-group">
            <label>Titre du document</label>
            <input type="text" id="scanTitre" class="form-control" placeholder="Titre du document">
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
              <label>Étiquettes</label>
              <select id="scanTags" class="form-control" multiple></select>
            </div>
          </div>
          <div class="form-group">
            <label>Texte extrait <span class="text-muted">(modifiable)</span></label>
            <textarea id="scanOcrText" class="form-control" rows="8" style="font-family:monospace;font-size:13px;white-space:pre-wrap"></textarea>
          </div>
          <div class="scan-actions">
            <button class="btn btn-primary" id="scanConfirmBtn"><i class="fas fa-check"></i> Confirmer et enregistrer</button>
            <button class="btn btn-secondary" id="scanCancelBtn"><i class="fas fa-times"></i> Annuler</button>
          </div>
          <div class="scan-progress" id="scanConfirmProgress" style="display:none">
            <div class="progress-bar"><div class="progress-fill" id="scanConfirmProgressFill"></div></div>
            <span class="progress-text" id="scanConfirmProgressText">Enregistrement...</span>
          </div>
        </div>

        <!-- Étape 3 : Résultat final -->
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
    document.getElementById('scanPreviewBtn').onclick = () => this.analyze();
    document.getElementById('scanConfirmBtn').onclick = () => this.confirm();
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
    const showFallback = () => {
      const preview = document.getElementById('scanPreview');
      preview.style.display = 'block';
      preview.innerHTML = `
        <div style="padding:20px;text-align:center">
          <i class="fas fa-video-slash" style="font-size:48px;color:var(--gray-300);margin-bottom:12px"></i>
          <h3 style="margin-bottom:8px;color:var(--gray-600)">Caméra indisponible</h3>
          <p style="color:var(--gray-400);font-size:13px;margin-bottom:16px">
            La caméra n'est pas disponible ou l'accès a été refusé.<br>
            ${location.protocol !== 'https:' && location.hostname !== 'localhost' ? 'HTTPS est requis pour la caméra.' : 'Autorisez l\'accès dans les paramètres de votre navigateur.'}
          </p>
          <button class="btn btn-primary" onclick="document.getElementById('scanFileInput').click()">
            <i class="fas fa-file-upload"></i> Importer un fichier
          </button>
        </div>
      `;
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback();
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        showFallback();
        return;
      }
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        showFallback();
        return;
      }
    }

    const video = document.getElementById('scanVideo');
    video.srcObject = this.mediaStream;
    video.style.display = 'block';
    document.getElementById('scanPreview').style.display = 'block';
    document.getElementById('scanImage').style.display = 'none';
    document.getElementById('scanCanvas').style.display = 'none';

    const existing = document.getElementById('scanCaptureBtn');
    if (existing) existing.remove();
    const captureBtn = document.createElement('button');
    captureBtn.className = 'btn btn-primary';
    captureBtn.id = 'scanCaptureBtn';
    captureBtn.innerHTML = '<i class="fas fa-circle"></i> Capturer';
    captureBtn.onclick = () => this.capture();
    document.getElementById('scanPreview').appendChild(captureBtn);
    document.getElementById('scanForm').style.display = 'none';
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
    document.getElementById('scanTitre').value = `Scan-${new Date().toLocaleDateString()}`;
  },

  handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.selectedFile = file;
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
      document.getElementById('scanImage').src = '';
      document.getElementById('scanImage').style.display = 'none';
    }
    document.getElementById('scanForm').style.display = 'block';
    document.getElementById('scanTitre').value = file.name.replace(/\.[^/.]+$/, '');
  },

  async analyze() {
    const format = document.getElementById('scanFormat').value;
    const doOcr = document.getElementById('scanOcr').checked;

    const formData = new FormData();
    if (this.selectedFile) {
      formData.append('fichier', this.selectedFile);
    } else if (this.capturedImage) {
      const blob = await (await fetch(this.capturedImage)).blob();
      formData.append('fichier', blob, `scan-${Date.now()}.jpg`);
    } else {
      App.showToast('Aucune image à analyser', 'error');
      return;
    }
    formData.append('format', format);
    formData.append('ocr', doOcr);

    const btn = document.getElementById('scanPreviewBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyse en cours...';
    document.getElementById('scanProgress').style.display = 'flex';
    document.getElementById('scanProgressText').textContent = doOcr ? 'Analyse OCR en cours...' : 'Traitement...';

    try {
      const data = await API.scanPreview(formData);
      this.previewToken = data.token;

      document.getElementById('scanForm').style.display = 'none';
      document.getElementById('scanProgress').style.display = 'none';

      if (doOcr && data.ocr && data.ocr.text) {
        document.getElementById('scanOcrText').value = data.ocr.text;
      } else if (doOcr) {
        document.getElementById('scanOcrText').value = '(Aucun texte détecté)';
      } else {
        document.getElementById('scanOcrText').value = '(OCR désactivé)';
      }

      document.getElementById('scanTitre').value = this.selectedFile
        ? this.selectedFile.name.replace(/\.[^/.]+$/, '')
        : `Scan-${new Date().toLocaleDateString()}`;

      document.getElementById('scanReview').style.display = 'block';
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-search"></i> Analyser le document';
    }
  },

  async confirm() {
    const titre = document.getElementById('scanTitre').value.trim();
    const description = document.getElementById('scanDescription').value.trim();
    const dossier = document.getElementById('scanDossier').value;
    const tags = Array.from(document.getElementById('scanTags').selectedOptions).map(o => parseInt(o.value));
    const contenuOcr = document.getElementById('scanOcrText').value.trim();

    if (!titre) {
      App.showToast('Le titre est requis', 'error');
      return;
    }

    const btn = document.getElementById('scanConfirmBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
    document.getElementById('scanConfirmProgress').style.display = 'flex';

    try {
      const data = await API.scanConfirm({
        token: this.previewToken,
        titre,
        description,
        dossier: dossier || undefined,
        tags,
        contenu_ocr: contenuOcr,
      });

      document.getElementById('scanConfirmProgress').style.display = 'none';
      document.getElementById('scanReview').style.display = 'none';

      const resultDiv = document.getElementById('scanResult');
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `
        <div class="alert alert-success">
          <i class="fas fa-check-circle"></i> Document enregistré avec succès !
        </div>
        <p><strong>${data.document.titre}</strong></p>
        <p class="text-muted">Type: ${data.document.type_fichier} | Taille: ${(data.document.taille / 1024 / 1024).toFixed(2)} Mo</p>
        ${contenuOcr ? `<details class="ocr-result"><summary>Texte extrait (${contenuOcr.length} car.)</summary><p class="ocr-text">${contenuOcr.substring(0, 2000)}</p></details>` : ''}
        <div class="scan-actions" style="margin-top:16px">
          <a href="#/documents" class="btn btn-primary"><i class="fas fa-folder-open"></i> Voir les documents</a>
          <button class="btn btn-outline" onclick="ScanPage.reset()"><i class="fas fa-camera"></i> Scanner un autre</button>
        </div>
      `;
    } catch (err) {
      App.showToast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Confirmer et enregistrer';
    }
  },

  reset() {
    this.mediaStream?.getTracks().forEach(t => t.stop());
    this.mediaStream = null;
    this.capturedImage = null;
    this.selectedFile = null;
    this.previewToken = null;
    document.getElementById('scanPreview').style.display = 'none';
    document.getElementById('scanForm').style.display = 'none';
    document.getElementById('scanReview').style.display = 'none';
    document.getElementById('scanResult').style.display = 'none';
    document.getElementById('scanProgress').style.display = 'none';
    document.getElementById('scanConfirmProgress').style.display = 'none';
    document.getElementById('scanVideo').style.display = 'none';
    document.getElementById('scanImage').style.display = 'none';
    document.getElementById('scanCanvas').style.display = 'none';
    document.getElementById('scanFileInput').value = '';
  }
};
