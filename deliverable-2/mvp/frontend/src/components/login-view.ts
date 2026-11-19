// Login form component for all seeded demo roles.
import { api, session, User } from '../api.js';

export class LoginView extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <section class="auth-card">
        <div class="brand-mark">H</div>
        <h1>Hackathon Platform</h1>
        <p class="muted">Deliverable 2 MVP</p>
        <form id="login-form" class="stack">
          <label>Email<input name="email" type="email" value="participant@example.com" required></label>
          <label>Password<input name="password" type="password" value="Pass123!" required></label>
          <button class="primary" type="submit">Sign in</button>
          <p id="error" class="error"></p>
        </form>
        <details><summary>Demo accounts</summary>
          <div class="demo-accounts">
            <code>participant@example.com</code><br>
            <code>organizer@example.com</code><br>
            <code>judge@example.com</code><br>
            <code>admin@example.com</code><br>
            Password: <code>Pass123!</code>
          </div>
        </details>
      </section>`;
    this.querySelector('form')!.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target as HTMLFormElement);
      const error = this.querySelector('#error') as HTMLElement;
      error.textContent = '';
      try {
        const result = await api<{token:string; user:User}>('/api/auth/login', {
          method:'POST', body:JSON.stringify({ email:form.get('email'), password:form.get('password') })
        });
        session.token = result.token;
        this.dispatchEvent(new CustomEvent('logged-in', { bubbles:true, detail:result.user }));
      } catch (e:any) { error.textContent = e.message; }
    });
  }
}
customElements.define('login-view', LoginView);
