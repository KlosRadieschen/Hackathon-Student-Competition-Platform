// Minimal route matcher used by the dependency-light Node HTTP server.
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, handler) {
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { names.push(m.slice(1)); return '([^/]+)'; }) + '$');
    this.routes.push({ method, regex, names, handler });
  }
  async handle(req, res, url) {
    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = url.pathname.match(route.regex);
      if (!match) continue;
      const params = {};
      route.names.forEach((n, i) => { params[n] = decodeURIComponent(match[i + 1]); });
      await route.handler(req, res, params, url);
      return true;
    }
    return false;
  }
}
