// Participant dashboard: team formation, challenge search/registration,
// project submission/update, and published result/feedback viewing.
import { api, fileToBase64, User } from '../api.js';

// Describe the challenge fields exposed by the shared challenge API.
type Challenge = {
  id:number;
  title:string;
  description:string;
  rules:string;
  minTeamSize:number;
  maxTeamSize:number;
  registrationDeadline:string;
  submissionDeadline:string;
  status:string;
  publishedAt?:string;
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
      this.innerHTML=`<p class="error">${error.message}</p>`;
    }
  }

  // Render the complete participant dashboard from current state.
  render(){
    // Show team details when a team exists; otherwise show create/join forms.
    const teamHtml = this.team ? `
      <div class="card">
        <h3>${this.team.name}</h3>
        <p>Members: <strong>${this.team.teamSize}</strong></p>
        <p>Invite code: <code>${this.team.inviteCode}</code></p>
      </div>` : `
      <div class="two-col">
        <form id="create-team" class="card stack">
          <h3>Create a team</h3>
          <label>Team name<input name="name" required></label>
          <button class="primary">Create</button>
        </form>
        <form id="join-team" class="card stack">
          <h3>Join with invite code</h3>
          <label>Invite code<input name="inviteCode" required></label>
          <button>Join</button>
        </form>
      </div>`;

    // Build one card per challenge, including rules and registration/submission state.
    const challengeCards = this.challenges.map((challenge)=>{
      const registration=this.registrations.find((item)=>item.challengeId===challenge.id);
      return `<article class="card challenge-card">
        <div class="row spread"><h3>${challenge.title}</h3><span class="badge">${challenge.status}</span></div>
        <p>${challenge.description}</p>
        <p><strong>Rules:</strong> ${challenge.rules || 'No additional rules.'}</p>
        <p class="muted">Team size ${challenge.minTeamSize}-${challenge.maxTeamSize}</p>
        <p class="muted">Registration deadline: ${new Date(challenge.registrationDeadline).toLocaleString()}</p>
        <p class="muted">Submission deadline: ${new Date(challenge.submissionDeadline).toLocaleString()}</p>
        ${registration
          ? '<p class="success">Registered</p>'
          : `<button data-register="${challenge.id}" ${!this.team||challenge.status!=='open'?'disabled':''}>Register team</button>`}
        ${registration ? this.submissionForm(registration) : ''}
      </article>`;
    }).join('');

    // Render published result cards only after the organizer has published results.
    const resultCards = this.results.map((result)=>`
      <article class="card result-card">
        <h3>${result.challengeTitle}</h3>
        <p class="result-score">Rank <strong>#${result.position}</strong> · Provisional score <strong>${result.provisionalScore.toFixed(2)}</strong>/100</p>
        <p class="muted">${result.scoreMeaning}</p>
        <h4>Judge feedback</h4>
        ${result.feedback.map((item)=>`<blockquote>${item.feedback}</blockquote>`).join('') || '<p class="muted">No written feedback available.</p>'}
      </article>
    `).join('');

    // Insert the page markup.
    this.innerHTML=`<section>
      <h2>Participant dashboard</h2>
      <p class="muted">Create or join a team, find a challenge, register, and submit your project before the deadline.</p>
      ${teamHtml}

      <div class="row spread section-heading">
        <h2>Challenges</h2>
        <label class="search-label">Search<input id="challenge-search" type="search" placeholder="Search title, description or rules"></label>
      </div>
      <div class="grid" id="challenge-grid">${challengeCards || '<p>No challenges are available.</p>'}</div>

      ${this.results.length ? `<h2>Published results</h2><div class="grid">${resultCards}</div>` : ''}
      <p id="notice" class="notice"></p>
    </section>`;

    // Attach browser event handlers after the HTML is inserted.
    this.bind();
  }

  // Render the UC1 form for a registered team.
  submissionForm(registration:Registration){
    // Project writes stop when judging/publishing begins.
    if(registration.challengeStatus!=='open') {
      return `<p class="muted">Submissions are closed for this challenge.</p>`;
    }

    return `<form class="submission-form stack" data-registration="${registration.id}">
      <h4>${registration.submissionId?'Update':'Submit'} project</h4>
      <label>Repository link<input name="repositoryLink" type="url" value="${registration.repositoryLink||''}" placeholder="https://github.com/..."></label>
      <label>Description<textarea name="description" rows="2" placeholder="Short project summary">${registration.submissionDescription||''}</textarea></label>
      <label>Artifact (MVP: PDF, ZIP, TXT, MD; max 1 MB)<input name="artifact" type="file" accept=".pdf,.zip,.txt,.md"></label>
      ${registration.artifactName?`<p class="muted">Current artifact: ${registration.artifactName}</p>`:''}
      ${registration.submittedAt?`<p class="success">Timestamped receipt: ${new Date(registration.submittedAt).toLocaleString()}</p>`:''}
      <button class="primary">${registration.submissionId?'Update submission':'Submit project'}</button>
    </form>`;
  }

  // Attach all participant interactions.
  bind(){
    // Create a new team.
    this.querySelector('#create-team')?.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const form=new FormData(event.target as HTMLFormElement);
      await this.act(()=>api('/api/teams',{method:'POST',body:JSON.stringify({name:form.get('name')})}));
    });

    // Join a team using the invite code created by its owner.
    this.querySelector('#join-team')?.addEventListener('submit', async (event)=>{
      event.preventDefault();
      const form=new FormData(event.target as HTMLFormElement);
      await this.act(()=>api('/api/teams/join',{method:'POST',body:JSON.stringify({inviteCode:form.get('inviteCode')})}));
    });

    // Register the participant's team for the selected challenge.
    this.querySelectorAll('[data-register]').forEach((button)=>button.addEventListener('click',()=>
      this.act(()=>api(`/api/challenges/${(button as HTMLElement).dataset.register}/register`,{method:'POST'}))
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
      }));
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

  // Execute an action, show feedback, and reload authoritative server state.
  async act(fn:()=>Promise<any>){
    const notice=this.querySelector('#notice') as HTMLElement;
    try{
      await fn();
      notice.textContent='Saved successfully.';
      notice.className='notice success';
      await this.load();
    }catch(error:any){
      notice.textContent=error.message;
      notice.className='notice error';
    }
  }
}

// Register <participant-view> for use in app.ts.
customElements.define('participant-view', ParticipantView);
