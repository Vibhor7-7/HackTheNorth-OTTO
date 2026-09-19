/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Evaluate only the two local modules; native storage is injected and never imported.
function load(name) {
  const source = fs.readFileSync(path.join(__dirname, `${name}.ts`), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((id) => id === './fixtures' ? load('fixtures') : require(id), module, module.exports);
  return module.exports;
}
const { MockOtto } = load('mock');
const { createFixtures } = load('fixtures');
const wait = (ms = 45) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) { const limit = Date.now() + 2500; while (!predicate() && Date.now() < limit) await wait(20); assert.ok(predicate(), 'State did not settle before timeout'); }
const storage = () => { let value = null; return { getItem: async () => value, setItem: async (_, next) => { value = next; } }; };
async function setup(t) { const store = new MockOtto(storage(), .01); t.after(() => store.dispose()); await store.initialize(); return store; }

test('coffee requires clarification, connection, approval, then succeeds', async t => {
  const store = await setup(t); await store.reset('coffee');
  assert.equal(store.getSnapshot().tasks[0].status, 'needs_input');
  await store.answerQuestion('task-coffee', 'Sam Patel'); await wait();
  assert.equal(store.getSnapshot().tasks[0].status, 'awaiting_connection');
  assert.match(store.getSnapshot().steps.find(s => s.tool_slug === 'GOOGLECALENDAR_CREATE_EVENT').summary, /Sam Patel/);
  await store.connect('gmail'); await wait();
  const approval = store.getSnapshot().approvals.find(a => a.status === 'pending');
  assert.match(approval.facts.To, /Sam Patel/);
  assert.equal(store.getSnapshot().tasks[0].status, 'awaiting_approval');
  await store.approve(approval.id); await wait();
  assert.equal(store.getSnapshot().tasks[0].status, 'succeeded');
  assert.equal(store.getSnapshot().approvals[0].status, 'approved');
});

test('denial is terminal; repeated approval cannot execute a denied action', async t => {
  const store = await setup(t); await store.deny('approval-shopify'); await store.approve('approval-shopify'); await wait();
  assert.equal(store.getSnapshot().tasks.find(t => t.id === 'task-shopify').status, 'cancelled');
  assert.equal(store.getSnapshot().approvals[0].status, 'denied');
});

test('action approval is idempotent, links transcript and becomes done', async t => {
  const store = await setup(t);
  const first = await store.doAction('action-meeting');
  assert.equal(await store.doAction('action-meeting'), first);
  await wait();
  assert.equal(store.getSnapshot().actionItems.find(a => a.id === 'action-meeting').status, 'done');
  assert.ok(store.getSnapshot().turns.find(t => t.id === 'turn-meeting').task_ids.includes(first));
  assert.equal(store.getSnapshot().tasks.filter(t => t.id === first).length, 1);
});

test('reset cancels pending task and chat timers', async t => {
  const store = await setup(t);
  await store.approve('approval-shopify'); await store.sendChat('What did I do today?');
  await store.reset('empty'); await wait(90);
  assert.equal(store.getSnapshot().tasks.length, 0);
  assert.equal(store.getSnapshot().messages.length, 0);
  assert.equal(store.getSnapshot().streaming, false);
});

test('offline prevents decisions; reconnect resumes chat; notes ground replies', async t => {
  const store = await setup(t);
  store.setNetwork('offline'); await assert.rejects(store.approve('approval-shopify'), /offline/);
  assert.equal(store.getSnapshot().approvals[0].status, 'pending');
  store.setNetwork('online'); await store.addMemory('I prefer tea over coffee.');
  await store.sendChat('What do you remember?'); await until(() => !store.getSnapshot().streaming);
  assert.match(store.getSnapshot().messages.at(-1).text, /I prefer tea over coffee/);
  assert.equal(store.getSnapshot().streaming, false);
});

test('hydration expires old approvals and preserves saved context', async t => {
  const state = createFixtures(); state.approvals[0].expires_at = new Date(Date.now() - 1000).toISOString();
  const persisted = { getItem: async () => JSON.stringify({ version: 1, state }), setItem: async () => {} };
  const store = new MockOtto(persisted, .01); t.after(() => store.dispose()); await store.initialize();
  assert.equal(store.getSnapshot().approvals[0].status, 'expired');
  assert.equal(store.getSnapshot().tasks.find(t => t.id === 'task-shopify').status, 'cancelled');
  await store.approve('approval-shopify'); assert.equal(store.getSnapshot().approvals[0].status, 'expired');
  assert.equal(store.getSnapshot().memories.length, state.memories.length);
});

test('SSE events carry the complete updated object', async t => {
  const store = await setup(t); const events = []; store.subscribeEvents(event => events.push(event));
  await store.connect('gmail'); await wait();
  const event = events.find(e => e.type === 'approval.created');
  assert.ok(event.data.facts.To); assert.equal(event.data.task_id, 'task-coffee');
  assert.ok(events.some(e => e.type === 'connection.updated' && e.data.status === 'completed'));
});
