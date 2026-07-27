class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.currentHash = '';
    this.previousRoute = null;
    this.isTransitioning = false;
    this.contentEl = null;
    this.preloaded = new Set();
    window.addEventListener('hashchange', () => this.resolve());
  }

  setContentEl(el) {
    this.contentEl = el;
  }

  add(path, handler, opts = {}) {
    this.routes[path] = { handler, preload: opts.preload || null };
    return this;
  }

  navigate(path) {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const target = path.split('?')[0];
    if (hash.split('?')[0] === target && hash === path) return;
    window.location.hash = path;
  }

  forceNavigate(path) {
    window.location.hash = path;
  }

  preload(path) {
    if (this.preloaded.has(path) || !this.routes[path]?.preload) return;
    this.preloaded.add(path);
    this.routes[path].preload();
  }

  _updateSidebar(path) {
    const route = path.replace('/', '');
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.route === route);
    });
  }

  async resolve() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const fullPath = hash;
    const path = fullPath.split('?')[0];

    if (this.currentHash === fullPath && this.currentRoute === path) return;

    this.previousRoute = this.currentRoute;
    this.currentRoute = path;
    this.currentHash = fullPath;
    this._updateSidebar(path);

    const content = this.contentEl || document.getElementById('pageContent');
    if (!content) return;

    const handler = this.routes[path]?.handler || this.routes['/dashboard']?.handler;
    if (!handler) return;

    if (this.isTransitioning) {
      await new Promise(r => setTimeout(r, 150));
    }
    this.isTransitioning = true;

    try {
      content.classList.add('page-leaving');
      await new Promise(r => setTimeout(r, 120));
      content.classList.remove('page-leaving');
      content.classList.add('page-entering');

      await handler();

      content.classList.remove('page-entering');
      content.classList.add('page-visible');
      requestAnimationFrame(() => content.classList.remove('page-visible'));
    } finally {
      this.isTransitioning = false;
    }

    this._preloadAdjacent(path);
  }

  _preloadAdjacent(path) {
    const routeOrder = ['/dashboard','/documents','/folders','/tags','/shared','/approvals','/notifications','/archive','/trash','/activity','/admin','/backup','/profile','/settings','/scan','/search'];
    const idx = routeOrder.indexOf(path);
    if (idx >= 0 && idx < routeOrder.length - 1) this.preload(routeOrder[idx + 1]);
    if (idx > 0) this.preload(routeOrder[idx - 1]);
  }

  start() {
    this.resolve();
  }
}

const router = new Router();
