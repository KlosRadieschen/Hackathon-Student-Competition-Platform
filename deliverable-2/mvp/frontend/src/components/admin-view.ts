// Platform-admin dashboard: account roles and resets, failed-upload log, and backups.
// The organizer dashboard is rendered below it because admins can manage every challenge.
import { api, escapeHtml, User } from '../api.js';

// One failed submission attempt recorded by the backend as an UPLOAD_FAILED audit event.
type UploadError = {
  id:number;
  createdAt:string;
  userEmail?:string;
  entityId?:string;
  details:{code:string;message:string;artifactName?:string|null;artifactBytes?:number|null};
};

// One stored backup of the database and uploaded artifacts.
type Backup = { name:string; createdAt:string; reason:string; artifactCount:number };

const ROLES=['participant','organizer','judge','admin'];

export class AdminView extends HTMLElement {
  connectedCallback(){ this.load(); }

  // Fetch accounts, upload failures, and backups, then render the dashboard.
  async load(){
    try{
      const [meResult,userResult,errorResult,backupResult]=await Promise.all([
        api<{user:User}>('/api/me'),
        api<{users:User[]}>('/api/admin/users'),
        api<{errors:UploadError[]}>('/api/admin/upload-errors'),
        api<{backups:Backup[]}>('/api/admin/backups')
      ]);
      const me=meResult.user;

      this.innerHTML=`<section>
        <h2>Platform admin</h2>
        <p class="muted">Manage accounts and roles, help teams whose uploads failed, and check backups.</p>

        <h3>Accounts</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>${userResult.users.map((user)=>{
              const self=user.id===me.id?'disabled':'';
              return `<tr>
                <td>${escapeHtml(user.name)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td><select data-role-select="${user.id}" ${self}>${ROLES.map((role)=>`<option ${role===user.role?'selected':''}>${role}</option>`).join('')}</select></td>
                <td><div class="row">
                  <button data-save-role="${user.id}" ${self}>Save role</button>
                  <button data-reset="${user.id}" data-email="${escapeHtml(user.email)}">Reset password</button>
                </div></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>
        <p id="admin-msg" class="notice"></p>

        <h3>Failed uploads</h3>
        ${errorResult.errors.length?`<div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>User</th><th>Registration</th><th>Error</th><th>File</th></tr></thead>
            <tbody>${errorResult.errors.map((event)=>`<tr>
              <td>${new Date(event.createdAt).toLocaleString()}</td>
              <td>${escapeHtml(event.userEmail||'-')}</td>
              <td>${escapeHtml(event.entityId||'-')}</td>
              <td><code>${escapeHtml(event.details.code)}</code> ${escapeHtml(event.details.message)}</td>
              <td>${event.details.artifactName?`${escapeHtml(event.details.artifactName)}${event.details.artifactBytes!=null?` (${Math.ceil(event.details.artifactBytes/1024)} KB)`:''}`:'-'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`:'<p class="muted">No failed uploads.</p>'}

        <div class="row spread section-heading">
          <h3>Backups</h3>
          <button id="backup-now" class="primary">Back up now</button>
        </div>
        <p class="muted">The database and uploaded files are backed up automatically every 24 hours; the newest 14 backups are kept.</p>
        ${backupResult.backups.length?`<div class="table-wrap">
          <table>
            <thead><tr><th>Created</th><th>Type</th><th>Files</th><th>Folder</th></tr></thead>
            <tbody>${backupResult.backups.map((backup)=>`<tr>
              <td>${new Date(backup.createdAt).toLocaleString()}</td>
              <td>${escapeHtml(backup.reason)}</td>
              <td>${backup.artifactCount}</td>
              <td><code>backups/${escapeHtml(backup.name)}</code></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`:'<p class="muted">No backups yet.</p>'}
      </section>`;

      this.bind();
    }catch(error:any){
      this.innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`;
    }
  }

  bind(){
    // Save the role chosen in the row's dropdown.
    this.querySelectorAll('[data-save-role]').forEach((button)=>button.addEventListener('click',()=>{
      const userId=(button as HTMLElement).dataset.saveRole!;
      const select=this.querySelector(`[data-role-select="${userId}"]`) as HTMLSelectElement;
      this.act(()=>api(`/api/admin/users/${userId}/role`,{method:'PUT',body:JSON.stringify({role:select.value})}),()=>'Role updated.');
    }));

    // Reset an account and show the temporary password once.
    this.querySelectorAll('[data-reset]').forEach((button)=>button.addEventListener('click',()=>{
      const element=button as HTMLElement;
      if(!confirm(`Reset the password for ${element.dataset.email}?`)) return;
      this.act(
        ()=>api<{temporaryPassword:string}>(`/api/admin/users/${element.dataset.reset}/reset`,{method:'POST'}),
        (result)=>`Temporary password for ${escapeHtml(element.dataset.email)}: <code>${escapeHtml(result.temporaryPassword)}</code>. Share it privately; it will not be shown again.`
      );
    }));

    this.querySelector('#backup-now')?.addEventListener('click',()=>
      this.act(()=>api('/api/admin/backups',{method:'POST'}),()=>'Backup created.')
    );
  }

  // Run an action, reload, then show the success message (reloading replaces the page markup).
  async act<T>(fn:()=>Promise<T>, message:(result:T)=>string){
    try{
      const result=await fn();
      await this.load();
      const notice=this.querySelector('#admin-msg') as HTMLElement|null;
      if(notice){ notice.innerHTML=message(result); notice.className='notice success'; }
    }catch(error:any){
      alert(error.message);
    }
  }
}

customElements.define('admin-view', AdminView);
