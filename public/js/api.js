const API = {
  baseUrl: (window.API_BASE_URL || '') + '/api',
  token: localStorage.getItem('token'),

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('token', token);
    else localStorage.removeItem('token');
  },

  async request(endpoint, options = {}) {
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };
    if (this.token) {
      config.headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (config.body && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }
    if (config.body instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    // Add timeout
    const timeout = options.timeout || 30000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    config.signal = controller.signal;
    
    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, config);
      clearTimeout(timeoutId);
      
      if (res.status === 401 && !endpoint.startsWith('/auth/')) {
        API.setToken(null);
        localStorage.removeItem('user');
        Auth.user = null;
        window.location.reload();
        throw new Error('Session expirée');
      }
      
      if (res.status === 403) {
        throw new Error('Accès non autorisé');
      }
      
      if (res.status === 429) {
        throw new Error('Trop de requêtes, veuillez réessayer plus tard');
      }
      
      if (res.status === 413) {
        throw new Error('Fichier trop volumineux');
      }
      
      if (res.status === 415) {
        throw new Error('Type de fichier non supporté');
      }
      
      const data = await res.json();
      if (!res.ok) {
        const msg = data.message || (data.errors && data.errors.map(e => e.msg || e.message).join(', ')) || 'Erreur serveur';
        throw new Error(msg);
      }
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Délai d\'attente dépassé. Vérifiez votre connexion.');
      }
      if (error.message === 'Failed to fetch') {
        throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion internet.');
      }
      throw error;
    }
  },

  get(endpoint) { return this.request(endpoint); },
  post(endpoint, body) { return this.request(endpoint, { method: 'POST', body }); },
  put(endpoint, body) { return this.request(endpoint, { method: 'PUT', body }); },
  patch(endpoint, body) { return this.request(endpoint, { method: 'PATCH', body }); },
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); },

  upload(endpoint, formData) {
    return this.request(endpoint, { method: 'POST', body: formData });
  },
  uploadPut(endpoint, formData) {
    return this.request(endpoint, { method: 'PUT', body: formData });
  },

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); },
  register(data) { return this.post('/auth/register', data); },
  getMe() { return this.get('/auth/me'); },
  updateProfile(data) { return this.put('/auth/profile', data); },
  updatePassword(data) { return this.put('/auth/password', data); },

  // Documents
  getDocuments(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/documents${q ? '?' + q : ''}`);
  },
  getRecentDocuments() { return this.get('/documents/recent'); },
  getDocumentStats() { return this.get('/documents/stats'); },
  getDocument(id) { return this.get(`/documents/${id}`); },
  uploadDocument(formData) { return this.upload('/documents', formData); },
  updateDocument(id, formData) { return this.uploadPut(`/documents/${id}`, formData); },
  deleteDocument(id) { return this.delete(`/documents/${id}`); },
  emptyTrash() { return this.delete('/documents/trash/empty'); },
  restoreDocument(id) { return this.post(`/documents/${id}/restore`); },
  archiveDocument(id) { return this.post(`/documents/${id}/archive`); },
  unarchiveDocument(id) { return this.post(`/documents/${id}/unarchive`); },
  patchTags(id, tags) { return this.patch(`/documents/${id}/tags`, { tags }); },
  getVersions(id) { return this.get(`/documents/${id}/versions`); },
  restoreVersion(id, versionId) { return this.post(`/documents/${id}/restore-version/${versionId}`); },
  async downloadBlob(id) {
    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}/documents/download/${id}`, { headers });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Erreur de téléchargement');
    }
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : 'document' };
  },
  async downloadFile(id) {
    const { blob, filename } = await this.downloadBlob(id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },

  // Folders
  getFolders(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/folders${q ? '?' + q : ''}`);
  },
  getFolderTree() { return this.get('/folders/tree'); },
  createFolder(data) { return this.post('/folders', data); },
  updateFolder(id, data) { return this.put(`/folders/${id}`, data); },
  deleteFolder(id) { return this.delete(`/folders/${id}`); },

  // Tags
  getTags() { return this.get('/tags'); },
  createTag(data) { return this.post('/tags', data); },
  updateTag(id, data) { return this.put(`/tags/${id}`, data); },
  deleteTag(id) { return this.delete(`/tags/${id}`); },

  // Search
  search(params) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/search?${q}`);
  },
  searchSuggestions(query) {
    return this.get(`/search/suggestions?q=${encodeURIComponent(query)}`);
  },

  // Notifications
  getNotifications(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/notifications${q ? '?' + q : ''}`);
  },
  markNotificationRead(id) { return this.put(`/notifications/${id}/read`); },
  deleteAllNotifications() { return this.delete('/notifications/read-all'); },
  deleteNotification(id) { return this.delete(`/notifications/${id}`); },

  // Sharing
  shareDocument(id, data) { return this.post(`/sharing/documents/${id}/share`, data); },
  revokeShare(docId, permId) { return this.delete(`/sharing/documents/${docId}/share/${permId}`); },
  shareFolder(id, data) { return this.post(`/sharing/folders/${id}/share`, data); },
  revokeFolderShare(folderId, permId) { return this.delete(`/sharing/folders/${folderId}/share/${permId}`); },
  getSharedWithMe(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/sharing/shared-with-me${q ? '?' + q : ''}`);
  },
  getSharedByMe(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/sharing/shared-by-me${q ? '?' + q : ''}`);
  },
  createShareLink(id, data) { return this.post(`/sharing/documents/${id}/link`, data); },

  // Users (admin)
  getUsers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/users${q ? '?' + q : ''}`);
  },
  createUser(data) { return this.post('/users', data); },
  updateUserRole(id, role) { return this.put(`/users/${id}/role`, { role }); },
  toggleUserActive(id) { return this.put(`/users/${id}/toggle-active`); },
  deleteUser(id) { return this.delete(`/users/${id}`); },

  // Scan
  scanPreview(formData) { return this.upload('/scan/preview', formData); },
  scanConfirm(data) { return this.post('/scan/confirm', data); },
  scanStatus(jobId) { return this.get(`/scan/status/${jobId}`); },

  // Approvals
  createApproval(docId, data) { return this.post(`/approvals/documents/${docId}/approve`, data); },
  approvalDecision(id, data) { return this.post(`/approvals/${id}/decision`, data); },
  cancelApproval(id) { return this.post(`/approvals/${id}/cancel`); },
  getPendingApprovals(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/approvals/pending${q ? '?' + q : ''}`);
  },
  getMyApprovalRequests(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/approvals/my-requests${q ? '?' + q : ''}`);
  },

  // Activity
  getActivity(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/activity${q ? '?' + q : ''}`);
  },
  getDocumentActivity(docId, params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/activity/document/${docId}${q ? '?' + q : ''}`);
  },

  // Backup (admin)
  createBackup() { return this.post('/backup/export'); },
  getBackups() { return this.get('/backup/exports'); },
  restoreBackup(name) { return this.post(`/backup/restore/${encodeURIComponent(name)}`); },
  deleteBackup(name) { return this.delete(`/backup/exports/${encodeURIComponent(name)}`); }
};
