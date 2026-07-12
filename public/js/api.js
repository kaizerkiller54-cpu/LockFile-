const API = {
  baseUrl: '/api',
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
    const res = await fetch(`${this.baseUrl}${endpoint}`, config);
    if (res.status === 401 && !endpoint.startsWith('/auth/')) {
      API.setToken(null);
      window.location.hash = '#/login';
      throw new Error('Session expirée');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erreur serveur');
    return data;
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
  getDownloadUrl(id) { return `${this.baseUrl}/documents/download/${id}?token=${this.token}`; },

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
  getSharedWithMe() { return this.get('/sharing/shared-with-me'); },
  getSharedByMe() { return this.get('/sharing/shared-by-me'); },
  revokeShare(docId, permId) { return this.delete(`/sharing/documents/${docId}/share/${permId}`); },

  // Users (admin)
  getUsers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/users${q ? '?' + q : ''}`);
  },
  createUser(data) { return this.post('/users', data); },
  updateUserRole(id, role) { return this.put(`/users/${id}/role`, { role }); },
  toggleUserActive(id) { return this.put(`/users/${id}/toggle-active`); },
  deleteUser(id) { return this.delete(`/users/${id}`); },

  // Backup (admin)
  createBackup() { return this.post('/backup/export'); },
  getBackups() { return this.get('/backup/exports'); },
  restoreBackup(name) { return this.post(`/backup/restore/${encodeURIComponent(name)}`); },
  deleteBackup(name) { return this.delete(`/backup/exports/${encodeURIComponent(name)}`); }
};
