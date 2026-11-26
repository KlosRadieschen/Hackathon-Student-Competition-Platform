// NFR4 mobile check: opens every role's dashboard in headless Firefox at phone width,
// reports any page wider than the screen, and saves screenshots to docs/mobile/.
// It starts its own server on a temporary database, so real data is never touched.
// The browser is driven through WebDriver BiDi, the standard protocol built into Firefox.
//
// Usage: npm run mobile-check            (FIREFOX_PATH overrides the browser, default firefox)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WIDTH = 390;
const HEIGHT = 844;
const PORT = 3191;
const DEBUG_PORT = 9333;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const FIREFOX = process.env.FIREFOX_PATH || 'firefox';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'mobile');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hackathon-mobile-'));
// Snap-packaged Firefox cannot see the host /tmp, so its profile lives inside the project (git-ignored).
const profile = fs.mkdtempSync(path.join(root, '.mobile-check-profile-'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, ['--no-warnings', 'backend/server.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), DB_PATH: path.join(tmp, 'mobile.db'), UPLOAD_DIR: path.join(tmp, 'uploads'), BACKUP_DIR: path.join(tmp, 'backups') },
  stdio: ['ignore', 'ignore', 'inherit']
});
const browser = spawn(FIREFOX, ['--headless', '--no-remote', '--profile', profile, '--remote-debugging-port', String(DEBUG_PORT), 'about:blank'], { stdio: 'ignore' });

async function api(method, route, token, body) {
  const res = await fetch(`${ORIGIN}/api${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${route} -> ${json.error}`);
  return json;
}
const login = async (email) => (await api('POST', '/auth/login', null, { email, password: 'Pass123!' })).token;

// Minimal WebDriver BiDi client over Node's built-in WebSocket.
async function connect() {
  let ws;
  for (let i = 0; i < 100 && !ws; i++) {
    ws = await new Promise((resolve) => {
      const socket = new WebSocket(`ws://127.0.0.1:${DEBUG_PORT}/session`);
      socket.addEventListener('open', () => resolve(socket), { once: true });
      socket.addEventListener('error', () => resolve(null), { once: true });
    });
    if (!ws) await sleep(300);
  }
  if (!ws) throw new Error(`Could not start ${FIREFOX}; set FIREFOX_PATH`);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { send, close: () => ws.close() };
}

// Seed one complete competition so every dashboard has realistic content.
async function seed() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${ORIGIN}/api/health`); break; } catch { await sleep(200); }
  }
  const participant = await login('participant@example.com');
  const team = (await api('POST', '/teams', participant, { name: 'Campus Builders' })).team;
  await api('POST', '/teams/join', await login('participant2@example.com'), { inviteCode: team.inviteCode });
  const { registrationId } = await api('POST', '/challenges/1/register', participant);
  const first = { repositoryLink: 'https://github.com/example/campus-builders', description: 'A room-booking assistant for study spaces.' };
  await api('POST', `/registrations/${registrationId}/submission`, participant, first);
  const { submissionId } = await api('POST', `/registrations/${registrationId}/submission`, participant, { ...first, description: 'A room-booking assistant for study spaces, now with a map view.' });
  const organizer = await login('organizer@example.com');
  await api('POST', `/submissions/${submissionId}/assign-judge`, organizer, { judgeId: 4 });
  await api('POST', '/challenges/1/start-judging', organizer);
  return { submissionId };
}

async function main() {
  const { submissionId } = await seed();
  const page = await connect();
  await page.send('session.new', { capabilities: {} });
  const context = (await page.send('browsingContext.getTree', {})).contexts[0].context;
  await page.send('browsingContext.setViewport', { context, viewport: { width: WIDTH, height: HEIGHT }, devicePixelRatio: 2 });

  // Evaluate in the page and return plain JSON data.
  const evaluate = async (expression) => {
    const result = await page.send('script.evaluate', { expression: `JSON.stringify(${expression})`, target: { context }, awaitPromise: true });
    return result.result?.value ? JSON.parse(result.result.value) : null;
  };
  const open = async (token, before = '') => {
    await page.send('browsingContext.navigate', { context, url: ORIGIN, wait: 'complete' });
    await evaluate(`localStorage.${token ? `setItem('hackathon-token', '${token}')` : "removeItem('hackathon-token')"}`);
    await page.send('browsingContext.reload', { context, wait: 'complete' });
    await sleep(1000);
    if (before) { await evaluate(`(${before}, null)`); await sleep(800); }
  };

  const screens = [
    ['login', null],
    ['participant', await login('participant@example.com')],
    ['organizer', await login('organizer@example.com')],
    ['judge', await login('judge@example.com'), `document.querySelector('[data-clear-conflict]') && (window.confirm = () => true, document.querySelector('[data-clear-conflict]').click())`],
    ['judge-evaluation', await login('judge@example.com'), `document.querySelector('[data-evaluate="${submissionId}"]')?.click()`],
    ['admin', await login('admin@example.com')]
  ];

  fs.mkdirSync(outDir, { recursive: true });
  const rows = [];
  for (const [name, token, before] of screens) {
    await open(token, before);
    const metrics = await evaluate(`({
      pageWidth: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('body *')]
        .filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.table-wrap'))
        .slice(0, 3).map((el) => el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : ''))
    })`);
    const { data } = await page.send('browsingContext.captureScreenshot', { context, origin: 'document' });
    fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    rows.push({ screen: name, viewport: WIDTH, pageWidth: metrics.pageWidth, fits: metrics.pageWidth <= WIDTH, overflowing: metrics.overflowing.join(', ') || '-' });
  }
  page.close();

  console.table(rows);
  console.log(`Screenshots saved to ${path.relative(root, outDir)}/`);
  const passed = rows.every((row) => row.fits);
  console.log(`No horizontal scrolling at ${WIDTH}px -> ${passed ? 'PASS' : 'FAIL'}`);
  return passed;
}

main()
  .then((passed) => { process.exitCode = passed ? 0 : 1; })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => {
    browser.kill();
    server.kill();
    setTimeout(() => {
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.rmSync(profile, { recursive: true, force: true });
    }, 1000);
  });
