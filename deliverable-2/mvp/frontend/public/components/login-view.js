// Login and participant sign-up forms.
import { api, session } from '../api.js';
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
          <p class="muted">New participant? <button type="button" class="link-button" data-show="signup-form">Create an account</button></p>
          <p class="error"></p>
        </form>
        <form id="signup-form" class="stack" hidden>
          <label>Name<input name="name" required minlength="2"></label>
          <label>Email<input name="email" type="email" required></label>
          <label>Password<input name="password" type="password" required minlength="8" placeholder="At least 8 characters, a letter and a number"></label>
          <button class="primary" type="submit">Create participant account</button>
          <p class="muted">Already registered? <button type="button" class="link-button" data-show="login-form">Sign in</button></p>
          <p class="error"></p>
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
        // Switch between the sign-in and sign-up forms.
        this.querySelectorAll('[data-show]').forEach((button) => button.addEventListener('click', () => {
            const target = button.dataset.show;
            this.querySelectorAll('form').forEach((form) => { form.hidden = form.id !== target; });
        }));
        this.bindForm('#login-form', '/api/auth/login', (form) => ({ email: form.get('email'), password: form.get('password') }));
        this.bindForm('#signup-form', '/api/auth/register', (form) => ({ name: form.get('name'), email: form.get('email'), password: form.get('password') }));
    }
    // Both forms return a token and user, so they share one submit handler.
    bindForm(selector, path, body) {
        const element = this.querySelector(selector);
        element.addEventListener('submit', async (event) => {
            event.preventDefault();
            const error = element.querySelector('.error');
            error.textContent = '';
            try {
                const result = await api(path, { method: 'POST', body: JSON.stringify(body(new FormData(element))) });
                session.token = result.token;
                this.dispatchEvent(new CustomEvent('logged-in', { bubbles: true, detail: result.user }));
            }
            catch (e) {
                error.textContent = e.message;
            }
        });
    }
}
customElements.define('login-view', LoginView);
