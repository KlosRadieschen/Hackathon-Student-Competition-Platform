// Participant dashboard: team formation, challenge search/registration,
// project submission/update, and published result/feedback viewing.
import { api, escapeHtml, fileToBase64, User } from '../api.js';

// Describe the challenge fields exposed by the shared challenge API.
type Challenge = {
  id:number;
  title:string;
  description:string;
  rules:string;
  minTeamSize:number;
  maxTeamSize:number;
  maxTeams:number|null;
  registeredTeams:number;
  registrationDeadline:string;
  submissionDeadline:string;
  status:string;
  publishedAt?:string;
};

// One earlier version of the team's submission (UC1 extension 4a).
type SubmissionVersion = {
  version:number;
  repositoryLink?:string;
  description:string;
  artifactName?:string;
  submittedAt:string;
  replacedAt:string;
};

// Describe the current participant team; null means the participant has no team yet.
type Team = {id:number;name:string;inviteCode:string;teamSize:number}|null;

// Describe registration plus the team's single active MVP submission.
type Registration = {
  id:number;
  challengeId:number;
  title:string;
  submissionDeadline:string;
  challengeStatus:string;
  submissionId?:number;
  submissionVersion?:number;
  previousVersions:SubmissionVersion[];
  repositoryLink?:string;
  submissionDescription?:string;
  artifactName?:string;
  submittedAt?:string;
};

// Describe one published team result. Judge names are intentionally not exposed.
type PublishedResult = {
  challengeId:number;
  challengeTitle:string;
  publishedAt:string;
  position:number;
  provisionalScore:number;
  evaluationCount:number;
  scoreMeaning:string;
  feedback:{feedback:string;submittedAt:string}[];
};

// Participant custom element used by the top-level app shell.
export class ParticipantView extends HTMLElement {
  // These fields hold the authoritative server state used to render the page.
  user!:User;
  challenges:Challenge[]=[];
  team:Team=null;
  registrations:Registration[]=[];
  results:PublishedResult[]=[];

  // Load server data when the component is attached to the document.
  connectedCallback(){ this.load(); }

  // Fetch challenge, team, registration, and published-result data in parallel.
  async load(){
    try {
      const [challengeResult,teamResult,registrationResult,resultResult] = await Promise.all([
        api<{challenges:Challenge[]}>('/api/challenges'),
        api<{team:Team}>('/api/teams/me'),
        api<{registrations:Registration[]}>('/api/registrations/me'),
        api<{results:PublishedResult[]}>('/api/results/me')
      ]);
      this.challenges=challengeResult.challenges;
      this.team=teamResult.team;
      this.registrations=registrationResult.registrations;
      this.results=resultResult.results;
      this.render();
    } catch(error:any){
      this.innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`;
    }
  }

  // Render the complete participant dashboard from current state.
  render(){
    // Show team details when a team exists; otherwise show create/join forms.
    const leaveBlocked=this.leaveBlockedReason();
    // An invite link (/?invite=CODE) pre-fills the join form (FR5).
    const inviteFromLink=new URLSearchParams(location.search).get('invite')||'';
    const teamHtml = this.team ? `
      <div class="card">
        <h3>${escapeHtml(this.team.name)}</h3>
        <p>Members: <strong>${this.team.teamSize}</strong></p>
        <p>Invite code: <code>${escapeHtml(this.team.inviteCode)}</code></p>
        <p>Invite link: <code class="invite-link">${escapeHtml(`${location.origin}/?invite=${encodeURIComponent(this.team.inviteCode)}`)}</code></p>
        <button id="leave-team" class="danger-outline" ${leaveBlocked?'disabled':''}>Leave team</button>
        ${leaveBlocked?`<p class="muted">${leaveBlocked}</p>`:''}
        <p class="notice"></p>
      </div>` : `
      <div class="two-col">
        <form id="create-team" class="card stack">
          <h3>Create a team</h3>
          <label>Team name<input name="name" required></label>
          <button class="primary">Create</button>
          <p class="notice"></p>
        </form>
        <form id="join-team" class="card stack">
          <h3>Join with invite code</h3>
          ${inviteFromLink?'<p class="success">You were invited to a team. Click Join to accept.</p>':''}
          <label>Invite code<input name="inviteCode" value="${escapeHtml(inviteFromLink)}" required></label>
          <button>Join</button>
          <p class="notice"></p>
        </form>
      </div>`;

    // Build one card per challenge, including rules and registration/submission state.
    const challengeCards = this.challenges.map((challenge)=>{
      const registration=this.registrations.find((item)=>item.challengeId===challenge.id);
      const full=challenge.maxTeams!=null && challenge.registeredTeams>=challenge.maxTeams;
      return `<article class="card challenge-card">
        <div class="row spread"><h3>${escapeHtml(challenge.title)}</h3><span class="badge">${escapeHtml(challenge.status)}</span></div>
        <p>${escapeHtml(challenge.description)}</p>
        <p><strong>Rules:</strong> ${escapeHtml(challenge.rules || 'No additional rules.')}</p>
        <p class="muted">Team size ${challenge.minTeamSize}-${challenge.maxTeamSize}</p>
        <p class="muted">Teams registered: ${challenge.registeredTeams}${challenge.maxTeams?` / ${challenge.maxTeams}`:''}</p>
        <p class="muted">Registration deadline: ${new Date(challenge.registrationDeadline).toLocaleString()}</p>
        <p class="muted">Submission deadline: ${new Date(challenge.submissionDeadline).toLocaleString()}</p>
        ${registration
          ? '<p class="success">Registered</p>'
          : full
            ? '<p class="warning">This challenge is full.</p>'
            : `<button data-register="${challenge.id}" ${!this.team||challenge.status!=='open'?'disabled':''}>Register team</button>`}
        ${registration ? this.submissionForm(registration) : ''}
        <p class="notice"></p>
      </article>`;
    }).join('');

    // Render published result cards only after the organizer has published results.
    const resultCards = this.results.map((result)=>`
      <article class="card result-card">
        <h3>${escapeHtml(result.challengeTitle)}</h3>
        <p class="result-score">Rank <strong>#${result.position}</strong> · Provisional score <strong>${result.provisionalScore.toFixed(2)}</strong>/100</p>
        <p class="muted">${escapeHtml(result.scoreMeaning)}</p>
        <h4>Judge feedback</h4>
        ${result.feedback.map((item)=>`<blockquote>${escapeHtml(item.feedback)}</blockquote>`).join('') || '<p class="muted">No written feedback available.</p>'}
      </article>
    `).join('');

    // Insert the page markup.
    this.innerHTML=`<section>
      <h2>Participant dashboard</h2>
      <p class="muted">Create or join a team, find a challenge, register, and submit your project before the deadline.</p>
      <p id="notice" class="notice"></p>
      ${teamHtml}

      <div class="row spread section-heading">
        <h2>Challenges</h2>
        <label class="search-label">Search<input id="challenge-search" type="search" placeholder="Search title, description or rules"></label>
      </div>
      <div class="grid" id="challenge-grid">${challengeCards || '<p>No challenges are available.</p>'}</div>

      ${this.results.length ? `<h2>Published results</h2><div class="grid">${resultCards}</div>` : ''}
    </section>`;

    // Attach browser event handlers after the HTML is inserted.
    this.bind();
  }

  // Explain why the team cannot be left, mirroring the server's team-size and lock rules.
  leaveBlockedReason(){
    const registration=this.registrations[0];
    const challenge=registration && this.challenges.find((item)=>item.id===registration.challengeId);
    if(!this.team || !challenge) return '';
    if(challenge.status!=='open' || Date.now()>Date.parse(challenge.submissionDeadline)) {
      return 'Team membership is locked because submissions have closed.';
    }
    if(this.team.teamSize-1<challenge.minTeamSize) {
      return `You can't leave: your team is registered for ${escapeHtml(challenge.title)}, which needs at least ${challenge.minTeamSize} member${challenge.minTeamSize===1?'':'s'}.`;
    }
    return '';
  }

  // List earlier submission versions, newest first.
  versionHistory(registration:Registration){
    if(!registration.previousVersions?.length) return '';
    return `<details class="version-history">
      <summary>Previous versions (${registration.previousVersions.length})</summary>
      ${registration.previousVersions.map((version)=>`<div class="version">
        <strong>Version ${version.version}</strong> <span class="muted">submitted ${new Date(version.submittedAt).toLocaleString()}, replaced ${new Date(version.replacedAt).toLocaleString()}</span>
        <p>${escapeHtml(version.description)}</p>
        ${version.repositoryLink?`<p class="muted">${escapeHtml(version.repositoryLink)}</p>`:''}
        ${version.artifactName?`<p class="muted">File: ${escapeHtml(version.artifactName)}</p>`:''}
      </div>`).join('')}
    </details>`;
  }

  // Render the UC1 form for a registered team.
  submissionForm(registration:Registration){
    // Project writes stop when judging/publishing begins.
    if(registration.challengeStatus!=='open') {
      return `<p class="muted">Submissions are closed for this challenge.</p>${this.versionHistory(registration)}`;
    }

    return `<form class="submission-form stack" data-registration="${registration.id}">
      <h4>${registration.submissionId?'Update':'Submit'} project</h4>
      <p class="muted">A description and either a repository link or a file are required.</p>
      <label>Repository link<input name="repositoryLink" type="url" value="${escapeHtml(registration.repositoryLink||'')}" placeholder="https://github.com/..."></label>
      <label>Description<textarea name="description" rows="2" required minlength="3" placeholder="Short project summary">${escapeHtml(registration.submissionDescription||'')}</textarea></label>
      <label>Artifact (MVP: PDF, ZIP, TXT, MD; max 1 MB)<input name="artifact" type="file" accept=".pdf,.zip,.txt,.md"></label>
      ${registration.artifactName?`<p class="muted">Current artifact: ${escapeHtml(registration.artifactName)}</p>`:''}
      ${registration.submittedAt?`<p class="success">Timestamped receipt: version ${registration.submissionVersion}, ${new Date(registration.submittedAt).toLocaleString()}</p>`:''}
      ${this.versionHistory(registration)}
      <button class="primary">${registration.submissionId?'Update submission':'Submit project'}</button>
    </form>`;
  }

  // Attach all participant interactions.
  bind(){
    // Create a new team.
    this.querySelector('#create-team')?.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const form=new FormData(event.target as HTMLFormElement);
      await this.act(()=>api('/api/teams',{method:'POST',body:JSON.stringify({name:form.get('name')})}),event.target as Element);
    });

    // Join a team using the invite code created by its owner.
    this.querySelector('#join-team')?.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const form=new FormData(event.target as HTMLFormElement);
      await this.act(async ()=>{
        await api('/api/teams/join',{method:'POST',body:JSON.stringify({inviteCode:form.get('inviteCode')})});
        // Drop the invite code from the address bar once it has been used.
        history.replaceState(null,'',location.pathname);
      },event.target as Element);
    });

    // Leave the current team after confirmation.
    this.querySelector('#leave-team')?.addEventListener('click',(event)=>{
      if(confirm('Leave this team? You will need a new invite code to rejoin.')){
        this.act(()=>api('/api/teams/leave',{method:'POST'}),event.target as Element,'You left the team.');
      }
    });

    // Register the participant's team for the selected challenge.
    this.querySelectorAll('[data-register]').forEach((button)=>button.addEventListener('click',()=>
      this.act(()=>api(`/api/challenges/${(button as HTMLElement).dataset.register}/register`,{method:'POST'}),button)
    ));

    // Create/update the single active MVP submission.
    this.querySelectorAll('.submission-form').forEach((form)=>form.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const element=event.target as HTMLFormElement;
      const data=new FormData(element);
      const file=data.get('artifact') as File;
      let artifact:any=undefined;

      // Convert a selected browser file to base64 for the small classroom MVP API.
      if(file && file.size){
        artifact={name:file.name,type:file.type,size:file.size,dataBase64:await fileToBase64(file)};
      }

      await this.act(()=>api(`/api/registrations/${element.dataset.registration}/submission`,{
        method:'POST',
        body:JSON.stringify({
          repositoryLink:data.get('repositoryLink'),
          description:data.get('description'),
          artifact
        })
      }),element);
    }));

    // Client-side search is enough for the MVP because the challenge list is small.
    this.querySelector('#challenge-search')?.addEventListener('input',(event)=>{
      const term=(event.target as HTMLInputElement).value.trim().toLowerCase();
      this.querySelectorAll('.challenge-card').forEach((card)=>{
        const text=(card.textContent||'').toLowerCase();
        (card as HTMLElement).style.display=!term || text.includes(term) ? '' : 'none';
      });
    });
  }

  // Execute an action and reload server state. Errors appear next to the control that caused them;
  // the success message goes at the top because reloading re-renders the page.
  async act(fn:()=>Promise<any>, origin:Element, successMessage='Saved successfully.'){
    const local=(origin.closest('.card')?.querySelector('.notice') || this.querySelector('#notice')) as HTMLElement;
    local.textContent='';
    try{
      await fn();
      await this.load();
      const notice=this.querySelector('#notice') as HTMLElement|null;
      if(notice){ notice.textContent=successMessage; notice.className='notice success'; }
    }catch(error:any){
      local.textContent=error.message;
      local.className='notice error';
    }
  }
}

// Register <participant-view> for use in app.ts.
customElements.define('participant-view', ParticipantView);
