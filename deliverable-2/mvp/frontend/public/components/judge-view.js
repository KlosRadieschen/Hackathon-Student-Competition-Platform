// Import the API/session helpers used by the judge dashboard.
import { api, escapeHtml, safeUrl, session } from '../api.js';
// The judge custom element owns the fairness-first conflict/evaluation workflow.
export class JudgeView extends HTMLElement {
    // Keep active assignments in component state between render actions.
    assignments = [];
    // Load the dashboard when the component first appears.
    connectedCallback() { this.load(); }
    // Fetch the judge's active assignment list.
    async load() {
        try {
            this.assignments = (await api('/api/judge/assignments')).assignments;
            this.render();
        }
        catch (error) {
            this.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
    // Render assignment identity first; full project details remain hidden until conflict is cleared.
    render() {
        this.innerHTML = `<section>
      <h2>Judge dashboard</h2>
      <p class="muted">First check whether you have a conflict with the team. Project content and the scoring rubric open only after you confirm there is no conflict.</p>
      <div class="grid">
        ${this.assignments.map((assignment) => `
          <article class="card">
            <div class="row spread">
              <h3>${escapeHtml(assignment.teamName)}</h3>
              <span class="badge">${escapeHtml(assignment.challengeTitle)}</span>
            </div>
            ${assignment.hasEvaluation ? '<p class="success">Evaluation submitted.</p>' : assignment.conflictChecked ? `
              <p class="success">Conflict check completed: no conflict declared.</p>
              <button data-evaluate="${assignment.submissionId}" class="primary">Open project and rubric</button>
            ` : `
              <p class="warning">Conflict check required before project content is opened.</p>
              <div class="row">
                <button data-clear-conflict="${assignment.submissionId}" class="primary">No conflict — continue</button>
                <button data-conflict="${assignment.submissionId}">Declare conflict</button>
              </div>
            `}
          </article>
        `).join('') || '<p>No active assignments.</p>'}
      </div>
      <div id="panel"></div>
    </section>`;
        // Confirm no conflict before project details can be requested from the backend.
        this.querySelectorAll('[data-clear-conflict]').forEach((button) => button.addEventListener('click', () => {
            this.confirmNoConflict(Number(button.dataset.clearConflict));
        }));
        // Open the full evaluation form only after conflict clearance.
        this.querySelectorAll('[data-evaluate]').forEach((button) => button.addEventListener('click', () => {
            this.openEvaluation(Number(button.dataset.evaluate));
        }));
        // Allow conflict declaration from the pre-evaluation identity screen.
        this.querySelectorAll('[data-conflict]').forEach((button) => button.addEventListener('click', () => {
            this.declareConflict(Number(button.dataset.conflict));
        }));
    }
    // Ask the backend to record the judge's explicit no-conflict confirmation.
    async confirmNoConflict(submissionId) {
        if (!confirm('Confirm that you do not have a conflict of interest with this team?'))
            return;
        try {
            await api(`/api/submissions/${submissionId}/no-conflict`, { method: 'POST' });
            await this.load();
        }
        catch (error) {
            alert(error.message);
        }
    }
    // Download an artifact only after conflict clearance; the backend enforces the same rule again.
    async downloadArtifact(submissionId) {
        const response = await fetch(`/api/submissions/${submissionId}/artifact`, {
            headers: { Authorization: `Bearer ${session.token}` }
        });
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            alert(body?.message || 'Could not download artifact');
            return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'artifact';
        link.click();
        URL.revokeObjectURL(url);
    }
    // Declare a conflict before evaluation; a short reason is stored for auditability.
    async declareConflict(submissionId) {
        const reason = prompt('Reason for conflict of interest:');
        if (!reason)
            return;
        try {
            await api(`/api/submissions/${submissionId}/conflicts`, {
                method: 'POST',
                body: JSON.stringify({ reason })
            });
            alert('Conflict recorded. The submission now requires judge reassignment.');
            await this.load();
        }
        catch (error) {
            alert(error.message);
        }
    }
    // Load project content and rubric only after the backend confirms the conflict check is complete.
    async openEvaluation(submissionId) {
        const panel = this.querySelector('#panel');
        try {
            const data = await api(`/api/submissions/${submissionId}/evaluation-data`);
            panel.innerHTML = `<form id="evaluation-form" class="card stack evaluation">
        <h3>Evaluate ${escapeHtml(data.submission.teamName)}</h3>
        <p><strong>${escapeHtml(data.submission.challengeTitle)}</strong></p>
        <p>${escapeHtml(data.submission.description || 'No project description provided.')}</p>
        ${data.submission.repositoryLink ? `<p><a href="${escapeHtml(safeUrl(data.submission.repositoryLink))}" target="_blank" rel="noreferrer">Open repository</a></p>` : '<p class="muted">No repository link provided.</p>'}
        ${data.submission.artifactName ? `<p><a href="#" data-artifact="${submissionId}">Download ${escapeHtml(data.submission.artifactName)}</a></p>` : ''}
        <p class="muted">D2 MVP scoring: the organizer-defined weights produce a provisional weighted total. Final ranking/normalization is outside this MVP.</p>
        ${data.criteria.map((criterion) => `
          <fieldset>
            <legend>${escapeHtml(criterion.name)} <span class="muted">(${Math.round(criterion.weight * 100)}%, max ${criterion.maxScore})</span></legend>
            <p class="muted">${escapeHtml(criterion.description)}</p>
            <label>Score<input name="score-${criterion.id}" type="number" min="0" max="${criterion.maxScore}" step="0.1" required></label>
            <label>Criterion comment<input name="comment-${criterion.id}"></label>
          </fieldset>
        `).join('')}
        <label>Written feedback<textarea name="feedback" rows="4" required></textarea></label>
        <button class="primary">Submit evaluation</button>
        <p id="eval-msg"></p>
      </form>`;
            // Bring the newly opened evaluation form into view.
            panel.scrollIntoView({ behavior: 'smooth' });
            // Bind artifact download after the project content has been revealed lawfully.
            panel.querySelector('[data-artifact]')?.addEventListener('click', (event) => {
                event.preventDefault();
                this.downloadArtifact(submissionId);
            });
            // Submit one complete evaluation with a score for every configured criterion.
            panel.querySelector('form').addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(event.target);
                const scores = data.criteria.map((criterion) => ({
                    criterionId: criterion.id,
                    score: Number(formData.get(`score-${criterion.id}`)),
                    comment: String(formData.get(`comment-${criterion.id}`) || '')
                }));
                try {
                    const result = await api(`/api/submissions/${submissionId}/evaluations`, {
                        method: 'POST',
                        body: JSON.stringify({ scores, feedback: formData.get('feedback') })
                    });
                    alert(`Evaluation saved. ${result.scoreMeaning}: ${result.totalScore.toFixed(2)}/100`);
                    await this.load();
                }
                catch (error) {
                    panel.querySelector('#eval-msg').textContent = error.message;
                }
            });
        }
        catch (error) {
            panel.innerHTML = `<p class="error">${escapeHtml(error.message)}</p>`;
        }
    }
}
// Register the custom element so <judge-view> works inside the app shell.
customElements.define('judge-view', JudgeView);
