// Organizer dashboard: create/edit challenges, configure rubrics, assign judges,
// start judging, inspect provisional rankings, publish results, and view audit logs.
import { api, escapeHtml } from '../api.js';

// Challenge fields editable by the organizer according to D1 FR3/FR4.
type Challenge = {
  id:number;
  title:string;
  description:string;
  rules:string;
  minTeamSize:number;
  maxTeamSize:number;
  maxTeams:number|null;
  registrationDeadline:string;
  submissionDeadline:string;
  status:string;
  publishedAt?:string;
  registrations:{registrationId:number;teamName:string;size:number;registeredAt:string;submittedAt?:string;submissionVersion?:number}[];
};

// Submitted project information shown for judge assignment.
type Submission = {
  submissionId:number;
  teamName:string;
  challengeId:number;
  challengeTitle:string;
  challengeStatus:string;
  repositoryLink?:string;
  artifactName?:string;
  submittedAt:string;
  version:number;
  assignedJudges?:string;
  conflictJudges?:string;
  needsReassignment:number;
};

// Judge account used in the assignment dropdown.
type Judge = { id:number; name:string; email:string };

// One editable rubric criterion.
type RubricCriterion = {
  id?:number;
  name:string;
  description:string;
  weightPercent:number;
  maxScore:number;
};

// Rubric response returned by the organizer API.
type RubricResponse = {
  challengeId:number;
  editable:boolean;
  criteria:RubricCriterion[];
};

// Provisional ranking response used before and after publication.
type RankingResponse = {
  challengeId:number;
  challengeStatus:string;
  formula:string;
  submissionCount:number;
  evaluatedSubmissionCount:number;
  readyToPublish:boolean;
  ranking:{position:number;teamId:number;teamName:string;submissionId:number;provisionalScore:number;evaluationCount:number}[];
};

// Convert an ISO date into the local datetime-local input format.
function toLocalInput(iso:string){
  const date=new Date(iso);
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,16);
}

// Create a useful future datetime-local default for the new-challenge form.
function futureLocal(days:number){
  return toLocalInput(new Date(Date.now()+days*24*60*60*1000).toISOString());
}

// Convert a datetime-local form value back to ISO for the API.
function toIso(value:FormDataEntryValue|null){
  return new Date(String(value||'')).toISOString();
}

// Organizer custom element.
export class OrganizerView extends HTMLElement {
  // Load the dashboard as soon as it is inserted into the page.
  async connectedCallback(){ await this.load(); }

  // Fetch all organizer state, then render one coherent dashboard.
  async load(){
    try{
      const [challengeResult,submissionResult,judgeResult,auditResult] = await Promise.all([
        api<{challenges:Challenge[]}>('/api/organizer/challenges'),
        api<{submissions:Submission[]}>('/api/organizer/submissions'),
        api<{judges:Judge[]}>('/api/organizer/judges'),
        api<{events:any[]}>('/api/audit')
      ]);

      // Load the rubric and ranking for each challenge separately because both belong to a challenge.
      const detailEntries = await Promise.all(challengeResult.challenges.map(async (challenge)=>{
        const rubric=await api<RubricResponse>(`/api/challenges/${challenge.id}/rubric`);
        const ranking=await api<RankingResponse>(`/api/challenges/${challenge.id}/ranking`);
        return [challenge.id,{rubric,ranking}] as const;
      }));
      const details=new Map<number,{rubric:RubricResponse;ranking:RankingResponse}>(detailEntries);
      const needsJudge=submissionResult.submissions.filter((submission)=>submission.needsReassignment);

      this.innerHTML=`<section>
        <h2>Organizer dashboard</h2>
        <p class="muted">Create and edit challenges, configure the rubric, assign judges, run judging, and publish results.</p>

        ${needsJudge.length?`<p class="warning reassign-banner">${needsJudge.length} submitted project${needsJudge.length===1?' needs':'s need'} a new judge because a judge declared a conflict of interest: ${needsJudge.map((submission)=>escapeHtml(submission.teamName)).join(', ')}.</p>`:''}

        ${this.createChallengeForm()}

        <div class="row spread section-heading">
          <h3>Challenge management</h3>
          <label class="search-label">Search<input id="organizer-search" type="search" placeholder="Search title, description or rules"></label>
        </div>
        <div class="grid">
          ${challengeResult.challenges.map((challenge)=>this.challengeCard(challenge,details.get(challenge.id)!)).join('') || '<p>No challenges yet.</p>'}
        </div>

        <h3>Submitted projects</h3>
        <div class="grid">
          ${submissionResult.submissions.map((submission)=>`
            <article class="card">
              <div class="row spread">
                <h4>${escapeHtml(submission.teamName)}</h4>
                ${submission.needsReassignment?'<span class="badge badge-warning">Needs reassignment</span>':''}
              </div>
              <p>${escapeHtml(submission.challengeTitle)}</p>
              <p class="muted">Submitted: ${new Date(submission.submittedAt).toLocaleString()} (version ${submission.version})</p>
              <p class="muted">Assigned: ${escapeHtml(submission.assignedJudges || 'none')}</p>
              ${submission.conflictJudges?`<p class="warning">Conflict declared by: ${escapeHtml(submission.conflictJudges)}</p>`:''}
              <label>
                Judge
                <select data-judge-select="${submission.submissionId}">
                  ${judgeResult.judges.map((judge)=>`<option value="${judge.id}">${escapeHtml(judge.name)} (${escapeHtml(judge.email)})</option>`).join('')}
                </select>
              </label>
              <button data-assign="${submission.submissionId}">Assign / reassign judge</button>
            </article>
          `).join('') || '<p>No submissions yet.</p>'}
        </div>

        <h3>Audit log</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Time</th><th>Event</th><th>User</th><th>Entity</th></tr></thead>
            <tbody>
              ${auditResult.events.slice(0,30).map((event)=>`
                <tr>
                  <td>${new Date(event.createdAt).toLocaleString()}</td>
                  <td>${escapeHtml(event.eventType)}</td>
                  <td>${escapeHtml(event.userEmail || '-')}</td>
                  <td>${escapeHtml(event.entityType)} ${escapeHtml(event.entityId || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <p id="org-msg" class="notice"></p>
      </section>`;

      this.bind();
    }catch(error:any){
      this.innerHTML=`<p class="error">${escapeHtml(error.message)}</p>`;
    }
  }

  // Form for creating a challenge instead of depending only on seeded demo data.
  createChallengeForm(){
    return `<details class="card create-challenge" open>
      <summary><strong>Create challenge</strong></summary>
      <form id="create-challenge" class="stack form-grid">
        <label>Title<input name="title" required placeholder="Hackathon challenge title"></label>
        <label>Description<textarea name="description" rows="2" required placeholder="What participants should build"></textarea></label>
        <label>Rules<textarea name="rules" rows="2" required placeholder="Main competition rules for this challenge"></textarea></label>
        <div class="two-col">
          <label>Minimum team size<input name="minTeamSize" type="number" min="1" max="20" value="1" required></label>
          <label>Maximum team size<input name="maxTeamSize" type="number" min="1" max="20" value="4" required></label>
        </div>
        <label>Maximum number of teams (blank = unlimited)<input name="maxTeams" type="number" min="1" max="1000"></label>
        <div class="two-col">
          <label>Registration deadline<input name="registrationDeadline" type="datetime-local" value="${futureLocal(7)}" required></label>
          <label>Submission deadline<input name="submissionDeadline" type="datetime-local" value="${futureLocal(10)}" required></label>
        </div>
        <button class="primary" type="submit">Create challenge</button>
      </form>
    </details>`;
  }

  // Render one challenge with its edit form, rubric, phase controls, and ranking.
  challengeCard(challenge:Challenge, detail:{rubric:RubricResponse;ranking:RankingResponse}){
    const {rubric,ranking}=detail;
    const editable=challenge.status==='open';
    const disabled=editable?'':'disabled';
    const rows=rubric.criteria.map((criterion)=>this.criterionRow(criterion,rubric.editable)).join('');

    return `<article class="card rubric-card">
      <div class="row spread">
        <h3>${escapeHtml(challenge.title)}</h3>
        <span class="badge">${escapeHtml(challenge.status)}</span>
      </div>

      <form class="challenge-edit stack" data-challenge-form="${challenge.id}">
        <h4>Challenge details</h4>
        <label>Title<input name="title" value="${escapeHtml(challenge.title)}" ${disabled} required></label>
        <label>Description<textarea name="description" rows="2" ${disabled} required>${escapeHtml(challenge.description)}</textarea></label>
        <label>Rules<textarea name="rules" rows="2" ${disabled} required>${escapeHtml(challenge.rules)}</textarea></label>
        <div class="two-col">
          <label>Minimum team size<input name="minTeamSize" type="number" min="1" max="20" value="${challenge.minTeamSize}" ${disabled} required></label>
          <label>Maximum team size<input name="maxTeamSize" type="number" min="1" max="20" value="${challenge.maxTeamSize}" ${disabled} required></label>
        </div>
        <label>Maximum number of teams (blank = unlimited)<input name="maxTeams" type="number" min="1" max="1000" value="${challenge.maxTeams ?? ''}" ${disabled}></label>
        <div class="two-col">
          <label>Registration deadline<input name="registrationDeadline" type="datetime-local" value="${toLocalInput(challenge.registrationDeadline)}" ${disabled} required></label>
          <label>Submission deadline<input name="submissionDeadline" type="datetime-local" value="${toLocalInput(challenge.submissionDeadline)}" ${disabled} required></label>
        </div>
        ${editable?'<button type="submit">Save challenge changes</button>':'<p class="warning">Challenge details are locked after judging starts.</p>'}
      </form>

      ${this.registrationList(challenge)}

      <form class="rubric-form stack" data-rubric-form="${challenge.id}">
        <div class="row spread">
          <h4>Evaluation rubric</h4>
          <span class="muted">Weights must total 100%</span>
        </div>
        <div class="rubric-rows" data-rubric-rows="${challenge.id}">${rows}</div>
        ${rubric.editable?`
          <div class="row">
            <button type="button" data-add-criterion="${challenge.id}">Add criterion</button>
            <button type="submit" class="primary">Save rubric</button>
          </div>
        `:'<p class="warning">Rubric locked because judging has started.</p>'}
      </form>

      ${challenge.status==='open'?`<button data-judge-phase="${challenge.id}" class="danger-outline">Start judging (closes submissions and locks configuration)</button>`:''}

      ${challenge.status==='judging'||challenge.status==='published'?this.rankingSection(challenge,ranking):''}
    </article>`;
  }

  // Teams registered for this challenge (UC2 step 5).
  registrationList(challenge:Challenge){
    const count=challenge.registrations.length;
    return `<section class="registration-list">
      <h4>Registered teams (${count}${challenge.maxTeams?` / ${challenge.maxTeams}`:''})</h4>
      ${count?`<div class="table-wrap">
        <table>
          <thead><tr><th>Team</th><th>Members</th><th>Registered</th><th>Submission</th></tr></thead>
          <tbody>${challenge.registrations.map((registration)=>`<tr>
            <td>${escapeHtml(registration.teamName)}</td>
            <td>${registration.size}</td>
            <td>${new Date(registration.registeredAt).toLocaleString()}</td>
            <td>${registration.submittedAt?`Version ${registration.submissionVersion}, ${new Date(registration.submittedAt).toLocaleString()}`:'Not submitted'}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`:'<p class="muted">No teams registered yet.</p>'}
    </section>`;
  }

  // Render one rubric row.
  criterionRow(criterion:RubricCriterion, editable:boolean){
    const disabled=editable?'':'disabled';
    const safeName=escapeHtml(criterion.name);
    const safeDescription=escapeHtml(criterion.description);
    return `<div class="rubric-row">
      <label>Name<input name="criterionName" value="${safeName}" ${disabled} required></label>
      <label>Description<input name="criterionDescription" value="${safeDescription}" ${disabled}></label>
      <label>Weight %<input name="criterionWeight" type="number" min="0.01" max="100" step="0.01" value="${criterion.weightPercent}" ${disabled} required></label>
      <label>Max score<input name="criterionMax" type="number" min="0.1" step="0.1" value="${criterion.maxScore}" ${disabled} required></label>
      ${editable?'<button type="button" class="remove-criterion">Remove</button>':''}
    </div>`;
  }

  // Render the provisional ranking and result-publication control.
  rankingSection(challenge:Challenge, ranking:RankingResponse){
    return `<section class="ranking-box">
      <h4>${challenge.status==='published'?'Published results':'Provisional ranking'}</h4>
      <p class="muted">${escapeHtml(ranking.formula)}</p>
      <p class="muted">Evaluated submissions: ${ranking.evaluatedSubmissionCount}/${ranking.submissionCount}</p>
      ${ranking.ranking.length?`
        <div class="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Team</th><th>Score</th><th>Evaluations</th></tr></thead>
            <tbody>${ranking.ranking.map((row)=>`
              <tr><td>#${row.position}</td><td>${escapeHtml(row.teamName)}</td><td>${Number(row.provisionalScore).toFixed(2)}</td><td>${row.evaluationCount}</td></tr>
            `).join('')}</tbody>
          </table>
        </div>`:'<p class="muted">No evaluated submissions yet.</p>'}
      ${challenge.status==='judging'?`
        <button data-publish-results="${challenge.id}" class="primary" ${ranking.readyToPublish?'':'disabled'}>Publish results</button>
        ${ranking.readyToPublish?'':'<p class="warning">Every submitted project needs at least one evaluation before publication.</p>'}
      `:`<p class="success">Results published ${challenge.publishedAt?new Date(challenge.publishedAt).toLocaleString():''}</p>`}
    </section>`;
  }

  // Attach all organizer actions after rendering.
  bind(){
    // Create a challenge.
    this.querySelector('#create-challenge')?.addEventListener('submit',async (event)=>{
      event.preventDefault();
      const data=new FormData(event.target as HTMLFormElement);
      await this.act(()=>api('/api/organizer/challenges',{
        method:'POST',
        body:JSON.stringify({
          title:data.get('title'),
          description:data.get('description'),
          rules:data.get('rules'),
          minTeamSize:Number(data.get('minTeamSize')),
          maxTeamSize:Number(data.get('maxTeamSize')),
          maxTeams:data.get('maxTeams')||null,
          registrationDeadline:toIso(data.get('registrationDeadline')),
          submissionDeadline:toIso(data.get('submissionDeadline'))
        })
      }),'Challenge created. Configure its rubric before judging.');
    });

    // Edit one open challenge.
    this.querySelectorAll('.challenge-edit').forEach((form)=>form.addEventListener('submit',async (event)=>{
      event.preventDefault();
      const element=event.target as HTMLFormElement;
      const challengeId=Number(element.dataset.challengeForm);
      const data=new FormData(element);
      await this.act(()=>api(`/api/organizer/challenges/${challengeId}`,{
        method:'PUT',
        body:JSON.stringify({
          title:data.get('title'),
          description:data.get('description'),
          rules:data.get('rules'),
          minTeamSize:Number(data.get('minTeamSize')),
          maxTeamSize:Number(data.get('maxTeamSize')),
          maxTeams:data.get('maxTeams')||null,
          registrationDeadline:toIso(data.get('registrationDeadline')),
          submissionDeadline:toIso(data.get('submissionDeadline'))
        })
      }),'Challenge updated.');
    }));

    // Filter challenge cards by their visible text and form contents (FR3 search).
    this.querySelector('#organizer-search')?.addEventListener('input',(event)=>{
      const term=(event.target as HTMLInputElement).value.trim().toLowerCase();
      this.querySelectorAll('.rubric-card').forEach((card)=>{
        const fields=[...card.querySelectorAll('input,textarea')].map((field)=>(field as HTMLInputElement).value).join(' ');
        const text=`${card.textContent||''} ${fields}`.toLowerCase();
        (card as HTMLElement).style.display=!term || text.includes(term) ? '' : 'none';
      });
    });

    // Add one blank rubric row.
    this.querySelectorAll('[data-add-criterion]').forEach((button)=>button.addEventListener('click',()=>{
      const challengeId=Number((button as HTMLElement).dataset.addCriterion);
      const rows=this.querySelector(`[data-rubric-rows="${challengeId}"]`) as HTMLElement;
      rows.insertAdjacentHTML('beforeend',this.criterionRow({name:'',description:'',weightPercent:0,maxScore:10},true));
      this.bindRemoveButtons();
    }));

    // Save the complete rubric replacement.
    this.querySelectorAll('.rubric-form').forEach((form)=>form.addEventListener('submit',async (event)=>{
      event.preventDefault();
      const element=event.target as HTMLFormElement;
      const challengeId=Number(element.dataset.rubricForm);
      const criteria=[...element.querySelectorAll('.rubric-row')].map((row)=>({
        name:(row.querySelector('[name="criterionName"]') as HTMLInputElement).value,
        description:(row.querySelector('[name="criterionDescription"]') as HTMLInputElement).value,
        weightPercent:Number((row.querySelector('[name="criterionWeight"]') as HTMLInputElement).value),
        maxScore:Number((row.querySelector('[name="criterionMax"]') as HTMLInputElement).value)
      }));
      await this.act(()=>api(`/api/challenges/${challengeId}/rubric`,{
        method:'PUT',
        body:JSON.stringify({criteria})
      }),'Rubric saved.');
    }));

    // Bind remove buttons after dynamic rows may have been inserted.
    this.bindRemoveButtons();

    // Transition from submissions to judging with an explicit warning.
    this.querySelectorAll('[data-judge-phase]').forEach((button)=>button.addEventListener('click',()=>{
      const challengeId=Number((button as HTMLElement).dataset.judgePhase);
      if(confirm('Start judging now? This closes project submissions and locks challenge/rubric configuration.')){
        this.act(()=>api(`/api/challenges/${challengeId}/start-judging`,{method:'POST'}),'Judging phase started.');
      }
    }));

    // Assign or reassign the selected judge.
    this.querySelectorAll('[data-assign]').forEach((button)=>button.addEventListener('click',()=>{
      const submissionId=(button as HTMLElement).dataset.assign!;
      const select=this.querySelector(`[data-judge-select="${submissionId}"]`) as HTMLSelectElement;
      this.act(()=>api(`/api/submissions/${submissionId}/assign-judge`,{
        method:'POST',
        body:JSON.stringify({judgeId:Number(select.value)})
      }),'Judge assigned.');
    }));

    // Publish results only when the backend says every submitted project is evaluated.
    this.querySelectorAll('[data-publish-results]').forEach((button)=>button.addEventListener('click',()=>{
      const challengeId=Number((button as HTMLElement).dataset.publishResults);
      if(confirm('Publish the current MVP ranking and judge feedback to participants?')){
        this.act(()=>api(`/api/challenges/${challengeId}/publish-results`,{method:'POST'}),'Results published.');
      }
    }));
  }

  // Remove one criterion, but never allow the form to become empty.
  bindRemoveButtons(){
    this.querySelectorAll('.remove-criterion').forEach((button)=>{
      (button as HTMLButtonElement).onclick=()=>{
        const row=button.closest('.rubric-row');
        const form=button.closest('.rubric-form');
        if(form && form.querySelectorAll('.rubric-row').length<=1){
          alert('The rubric must contain at least one criterion.');
          return;
        }
        row?.remove();
      };
    });
  }

  // Run one organizer action, display feedback, and reload authoritative state.
  async act(fn:()=>Promise<any>,successMessage='Saved successfully.'){
    try{
      await fn();
      const message=this.querySelector('#org-msg') as HTMLElement|null;
      if(message){message.textContent=successMessage;message.className='notice success';}
      await this.load();
    }catch(error:any){
      alert(error.message);
    }
  }
}

// Register <organizer-view> for use in app.ts.
customElements.define('organizer-view', OrganizerView);
