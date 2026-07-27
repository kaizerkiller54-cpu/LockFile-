const Auth = {
  user: null,

  async init() {
    if (API.token) {
      try {
        const data = await API.getMe();
        this.user = data.user;
        return true;
      } catch {
        API.setToken(null);
        return false;
      }
    }
    return false;
  },

  async login(email, password) {
    const data = await API.login(email, password);
    API.setToken(data.token);
    this.user = data.user;
    return data.user;
  },

  async register(userData) {
    const data = await API.register(userData);
    API.setToken(data.token);
    this.user = data.user;
    return data.user;
  },

  logout() {
    API.setToken(null);
    this.user = null;
    window.location.hash = '/login';
  },

  isAuthenticated() {
    return !!API.token;
  },

  isAdmin() {
    return this.user?.role === 'admin';
  },

  updateUser(user) {
    this.user = user;
  }
};
