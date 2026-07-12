class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  add(path, handler) {
    this.routes[path] = handler;
    return this;
  }

  navigate(path) {
    window.location.hash = path;
  }

  resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const route = hash.split('?')[0];
    this.currentRoute = route;

    if (this.routes[route]) {
      this.routes[route]();
    } else {
      this.routes['/dashboard']();
    }
  }

  start() {
    this.resolve();
  }
}

const router = new Router();
