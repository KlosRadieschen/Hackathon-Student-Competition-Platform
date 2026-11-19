// Top-level browser shell that restores login state and selects the correct role dashboard.
import { api, session } from './api.js';
import './components/login-view.js';
import './components/participant-view.js';
import './components/judge-view.js';
import './components/organizer-view.js';
class AppShell extends HTMLElement {
    user = null;
    connectedCallback() { this.addEventListener('logged-in', (e) => { this.user = e.detail; this.render(); }); this.restore(); }
    async restore() { if (!session.token) {
        this.render();
        return;
    } try {
        this.user = (await api('/api/me')).user;
    }
    catch {
        session.clear();
        this.user = null;
    } this.render(); }
    render() {
        if (!this.user) {
            this.innerHTML = '<main class="center"><login-view></login-view></main>';
            return;
        }
        const view = this.user.role === 'participant' ? '<participant-view></participant-view>' : this.user.role === 'judge' ? '<judge-view></judge-view>' : '<organizer-view></organizer-view>';
        this.innerHTML = `<header class="topbar"><div><strong>Hackathon Platform</strong><span class="role">${this.user.role}</span></div><div>${this.user.name} <button id="logout" class="small">Log out</button></div></header><main class="container">${view}</main>`;
        this.querySelector('#logout').addEventListener('click', () => { session.clear(); this.user = null; this.render(); });
    }
}
customElements.define('app-shell', AppShell);
