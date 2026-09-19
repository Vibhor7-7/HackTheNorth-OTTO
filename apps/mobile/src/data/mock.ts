import { createFixtures } from './fixtures';
import type { Approval, ChatMessage, DemoScenario, DemoState, NetworkState, OttoDataSource, OttoEvent, Task, TaskStep } from './types';

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const STORAGE_KEY = 'otto.frontend.demo.v1';
const nativeStorage: Storage = {
  async getItem(key) { return (await import('@react-native-async-storage/async-storage')).default.getItem(key); },
  async setItem(key, value) { await (await import('@react-native-async-storage/async-storage')).default.setItem(key, value); },
};

/** A local simulation. Replace this provider with HTTP/SSE; screens keep the same contract. */
export class MockOtto implements OttoDataSource {
  private state: DemoState = createFixtures();
  private listeners = new Set<() => void>();
  private events = new Set<(event: OttoEvent) => void>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private expiry?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private chatGeneration = 0;
  private chatTimer?: ReturnType<typeof setTimeout>;
  private serial = 0;
  private writes = Promise.resolve();
  private initializing?: Promise<void>;
  constructor(private storage: Storage = nativeStorage, private speed = 1) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeEvents = (listener: (event: OttoEvent) => void) => { this.events.add(listener); return () => { this.events.delete(listener); }; };
  private id(prefix: string) { return `${prefix}-${Date.now()}-${++this.serial}`; }
  private now() { return new Date().toISOString(); }
  private emit(event: OttoEvent) { this.events.forEach(listener => listener(event)); }
  private publish(patch: Partial<DemoState> = {}) {
    this.state = { ...this.state, ...patch };
    if (patch.messages) {
      this.state.chatSessions = this.state.chatSessions.map(chat => chat.id === this.state.activeChatId ? { ...chat, messages: patch.messages!, title: patch.messages!.find(m => m.role === 'user')?.text.slice(0, 60) || 'New chat', updated_at: this.now() } : chat);
    }
    this.listeners.forEach(listener => listener());
    if (this.state.hydrated) {
      const json = JSON.stringify({ version: 1, state: this.state });
      this.writes = this.writes.then(() => this.storage.setItem(STORAGE_KEY, json)).catch(() => { /* A storage failure must not prevent local use. */ });
    }
    this.scheduleExpiry();
  }
  private requireOnline() { if (this.state.network !== 'online') throw new Error('Otto is offline. Reconnect to continue this demo.'); }
  private later(fn: () => void, ms = 900) {
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (generation !== this.generation) return;
      if (this.state.network !== 'online') { this.later(fn, 500); return; }
      fn();
    }, ms * this.speed);
    this.timers.add(timer);
  }
  private scheduleExpiry() {
    if (this.expiry) clearTimeout(this.expiry);
    const pending = this.state.approvals.filter(a => a.status === 'pending');
    if (!pending.length) return;
    const next = Math.min(...pending.map(a => Date.parse(a.expires_at)));
    this.expiry = setTimeout(() => this.expire(), Math.max(0, next - Date.now()) + 5);
  }
  private expire() {
    const expired = this.state.approvals.filter(a => a.status === 'pending' && Date.parse(a.expires_at) <= Date.now());
    for (const approval of expired) this.resolveApproval(approval, 'expired');
  }
  initialize = async () => {
    if (this.state.hydrated) return;
    if (this.initializing) return this.initializing;
    const generation = this.generation;
    this.initializing = (async () => {
      try {
        const raw = await this.storage.getItem(STORAGE_KEY);
        if (generation !== this.generation) return;
        if (raw) {
          const stored = JSON.parse(raw);
          const s = stored.state;
          if (stored.version === 1 && s && ['tasks', 'steps', 'approvals', 'connections', 'actionItems', 'turns', 'memories', 'extensions', 'messages'].every(k => Array.isArray(s[k]))) {
            const chatSessions = Array.isArray(s.chatSessions) && s.chatSessions.length ? s.chatSessions : [{ id: 'chat-initial', title: s.messages.find((m: ChatMessage) => m.role === 'user')?.text.slice(0, 60) || 'New chat', messages: s.messages, created_at: this.now(), updated_at: this.now() }];
            const active = chatSessions.find((chat: {id: string}) => chat.id === s.activeChatId) ?? chatSessions[0];
            this.state = { ...s, chatSessions, activeChatId: active.id, messages: active.messages, network: 'online', streaming: false, hydrated: false };
          }
        }
      } catch { /* A malformed or unavailable cache starts a fresh demo. */ }
      if (generation !== this.generation) return;
      this.publish({ hydrated: true });
      this.expire();
      for (const task of this.state.tasks.filter(t => t.status === 'running')) this.later(() => this.advance(task.id));
    })();
    return this.initializing;
  };
  getHome = async () => ({ approvals: this.state.approvals.filter(a => a.status === 'pending'), connections: this.state.connections.filter(c => c.status === 'pending'), action_items: this.state.actionItems.filter(a => a.status === 'open'), recent_tasks: [...this.state.tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)) });
  private updateTask(id: string, patch: Partial<Task>) {
    const current = this.state.tasks.find(t => t.id === id);
    if (!current) return;
    const task = { ...current, ...patch, updated_at: this.now() };
    this.publish({ tasks: this.state.tasks.map(t => t.id === id ? task : t) });
    this.emit({ type: 'task.updated', data: task });
  }
  private addStep(task_id: string, kind: TaskStep['kind'], summary: string, extra: Partial<TaskStep> = {}) {
    const step: TaskStep = { id: this.id('step'), task_id, seq: this.state.steps.filter(s => s.task_id === task_id).length + 1, kind, summary, created_at: this.now(), ...extra };
    this.publish({ steps: [...this.state.steps, step] }); this.emit({ type: 'step.created', data: step }); return step;
  }
  private finish(id: string) {
    const task = this.state.tasks.find(t => t.id === id);
    if (!task || task.status !== 'running') return;
    const summary = id === 'task-shopify' ? 'Blue Everyday Hoodie is now $64.00 CAD in the demo store.' : id === 'task-food' ? 'Demo order confirmed. No order was placed and no money was charged.' : task.toolkits_used.includes('gmail') ? 'Your email was sent in the demo. No real message was sent.' : task.toolkits_used.includes('googlecalendar') ? 'Your meeting is on the demo calendar.' : 'Saved to your demo notebook.';
    this.addStep(id, 'tool_result', summary, { toolkit: task.toolkits_used.at(-1), duration_ms: 640, result_redacted: { demo: true, completed: true } });
    this.addStep(id, 'final', summary);
    this.updateTask(id, { status: 'succeeded', spoken_summary: summary, detail_md: `${summary}\n\nAll actions in this experience are simulated locally.` });
    const updated = this.state.actionItems.map(a => a.task_id === id ? { ...a, status: 'done' as const } : a);
    this.publish({ actionItems: updated });
    updated.filter(a => a.task_id === id).forEach(a => this.emit({ type: 'action_item.updated', data: a }));
    const memory = { id: this.id('memory'), text: summary, source: 'task_summary' as const, task_id: id, created_at: this.now() };
    this.publish({ memories: [memory, ...this.state.memories] }); this.emit({ type: 'memory.created', data: memory });
  }
  private createApproval(taskId: string) {
    if (this.state.approvals.some(a => a.task_id === taskId && a.status === 'pending')) return;
    const task = this.state.tasks.find(t => t.id === taskId)!;
    const isCoffee = taskId === 'task-coffee' || /coffee|sam/i.test(task.goal);
    const selected = this.state.steps.findLast(s => s.task_id === taskId && s.summary.startsWith('You chose'))?.summary.includes('Patel') ? 'Sam Patel' : 'Sam Chen';
    const step = this.addStep(taskId, 'approval_wait', 'Sending on your behalf needs your approval.', { toolkit: 'gmail', tool_slug: 'GMAIL_SEND_EMAIL', risk: 'R2' });
    const approval: Approval = { id: this.id('approval'), task_id: taskId, step_id: step.id, code: '7319', summary: isCoffee ? `Send ${selected} the invite?` : 'Send Maya the prototype update?', facts: { To: isCoffee ? `${selected} · ${selected === 'Sam Patel' ? 'sam.patel' : 'sam.chen'}@example.com` : 'Maya · maya@example.com', Subject: isCoffee ? 'Coffee next week' : 'Otto prototype update', Message: isCoffee ? 'Coffee on Tuesday, 10:00–10:30 AM? I have reserved the time.' : 'Here is the latest Otto prototype update. Ready for your feedback.', ...(isCoffee ? { When: 'Tuesday · 10:00–10:30 AM', Timezone: 'America/Toronto' } : {}), Mode: 'Demo email · no real message' }, args_hash: `demo-${taskId}`, status: 'pending', channel: 'app', expires_at: new Date(Date.now() + 5 * 60_000).toISOString() };
    this.publish({ approvals: [approval, ...this.state.approvals] }); this.emit({ type: 'approval.created', data: approval });
    this.updateTask(taskId, { status: 'awaiting_approval', spoken_summary: 'The draft is ready. Review it before I send.' });
  }
  private advance(taskId: string) {
    const task = this.state.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'running') return;
    if (this.state.approvals.some(a => a.task_id === taskId && a.status === 'approved')) { this.finish(taskId); return; }
    const missing = task.toolkits_used.find(id => this.state.extensions.find(e => e.id === id)?.status !== 'connected');
    if (missing) {
      const step = this.addStep(taskId, 'connection_wait', `Connect ${missing === 'gmail' ? 'Gmail' : missing} to continue.`, { toolkit: missing });
      const connection = { id: this.id('connection'), task_id: taskId, step_id: step.id, toolkit: missing, link: `otto://demo/connect/${missing}`, status: 'pending' as const, created_at: this.now() };
      this.publish({ connections: [connection, ...this.state.connections] }); this.emit({ type: 'connection.created', data: connection });
      this.updateTask(taskId, { status: 'awaiting_connection', spoken_summary: 'A quick connection, then I can carry on.' });
    } else if (task.toolkits_used.includes('gmail')) this.createApproval(taskId);
    else this.finish(taskId);
  }
  private resolveApproval(approval: Approval, status: 'denied' | 'expired') {
    const updated = { ...approval, status, decided_at: this.now() };
    this.publish({ approvals: this.state.approvals.map(a => a.id === approval.id ? updated : a) }); this.emit({ type: 'approval.updated', data: updated });
    const summary = status === 'expired' ? 'Approval expired. The action was cancelled.' : 'You said no. The action was cancelled.';
    this.addStep(approval.task_id, 'final', summary);
    this.updateTask(approval.task_id, { status: 'cancelled', spoken_summary: summary });
  }
  approve = async (id: string) => {
    this.requireOnline(); this.expire();
    const approval = this.state.approvals.find(a => a.id === id);
    if (!approval || approval.status !== 'pending') return;
    const updated = { ...approval, status: 'approved' as const, channel: 'app' as const, decided_at: this.now() };
    this.publish({ approvals: this.state.approvals.map(a => a.id === id ? updated : a) }); this.emit({ type: 'approval.updated', data: updated });
    this.updateTask(approval.task_id, { status: 'running', spoken_summary: 'Approved. Finishing the demo action.' });
    this.addStep(approval.task_id, 'tool_call', 'Permission received. Executing the simulated action.', { risk: 'R2' });
    this.later(() => this.finish(approval.task_id), 1150);
  };
  deny = async (id: string) => { this.requireOnline(); this.expire(); const a = this.state.approvals.find(a => a.id === id); if (a?.status === 'pending') this.resolveApproval(a, 'denied'); };
  connect = async (toolkitId: string) => {
    this.requireOnline();
    const extension = this.state.extensions.find(e => e.id === toolkitId);
    if (!extension) throw new Error('This toolkit is not part of the demo.');
    const updated = { ...extension, status: 'connected' as const };
    this.publish({ extensions: this.state.extensions.map(e => e.id === toolkitId ? updated : e) }); this.emit({ type: 'extension.updated', data: updated });
    const pending = this.state.connections.filter(c => c.toolkit === toolkitId && c.status === 'pending');
    for (const connection of pending) {
      const completed = { ...connection, status: 'completed' as const, completed_at: this.now() };
      this.publish({ connections: this.state.connections.map(c => c.id === connection.id ? completed : c) }); this.emit({ type: 'connection.updated', data: completed });
      this.addStep(connection.task_id, 'tool_result', `${extension.name} connected in demo mode.`, { toolkit: toolkitId, duration_ms: 480 });
      this.updateTask(connection.task_id, { status: 'running', spoken_summary: 'Connected. Preparing the next step.' });
      this.later(() => this.advance(connection.task_id));
    }
  };
  disconnect = async (toolkitId: string) => {
    this.requireOnline(); const extension = this.state.extensions.find(e => e.id === toolkitId); if (!extension) return;
    const updated = { ...extension, status: 'needs_auth' as const };
    this.publish({ extensions: this.state.extensions.map(e => e.id === toolkitId ? updated : e) }); this.emit({ type: 'extension.updated', data: updated });
  };
  private startTask(goal: string, source: Task['source'], toolkit?: string) {
    const tools = toolkit ? [toolkit] : /email|send|invite/i.test(goal) ? ['gmail'] : /meeting|schedule|calendar|coffee/i.test(goal) ? ['googlecalendar'] : ['notion'];
    const task: Task = { id: this.id('task'), goal, source, status: 'running', toolkits_used: tools, created_at: this.now(), updated_at: this.now(), spoken_summary: 'Finding the right tools.' };
    this.publish({ tasks: [task, ...this.state.tasks] }); this.emit({ type: 'task.created', data: task });
    this.addStep(task.id, 'plan', `Chose ${tools.map(id => this.state.extensions.find(e => e.id === id)?.name ?? id).join(' and ')} from 1,500 apps for this request.`);
    this.later(() => this.advance(task.id), 1500); return task.id;
  }
  doAction = async (id: string) => {
    this.requireOnline(); const item = this.state.actionItems.find(a => a.id === id); if (!item) throw new Error('Action item not found.');
    if (item.task_id) return item.task_id;
    if (item.status !== 'open') throw new Error('This action item has already been handled.');
    const task_id = this.startTask(item.suggested_goal, 'action_item', item.toolkit_hint);
    const updated = { ...item, status: 'approved' as const, task_id, decided_at: this.now() };
    this.publish({ actionItems: this.state.actionItems.map(a => a.id === id ? updated : a), turns: this.state.turns.map(t => t.id === item.turn_id ? { ...t, task_ids: [...t.task_ids, task_id] } : t) });
    this.emit({ type: 'action_item.updated', data: updated }); return task_id;
  };
  dismissAction = async (id: string) => { this.requireOnline(); const item = this.state.actionItems.find(a => a.id === id); if (!item || item.status !== 'open') return; const updated = { ...item, status: 'dismissed' as const, decided_at: this.now() }; this.publish({ actionItems: this.state.actionItems.map(a => a.id === id ? updated : a) }); this.emit({ type: 'action_item.updated', data: updated }); };
  addMemory = async (text: string) => { this.requireOnline(); if (!text.trim()) return; const memory = { id: this.id('memory'), text: text.trim(), source: 'user' as const, created_at: this.now() }; this.publish({ memories: [memory, ...this.state.memories] }); this.emit({ type: 'memory.created', data: memory }); };
  deleteMemory = async (id: string) => { this.requireOnline(); this.publish({ memories: this.state.memories.filter(m => m.id !== id) }); };
  answerQuestion = async (taskId: string, answer: string) => {
    this.requireOnline(); const task = this.state.tasks.find(t => t.id === taskId); if (task?.status !== 'needs_input') return;
    const chosen = /patel/i.test(answer) ? 'Sam Patel' : /chen|manager/i.test(answer) ? 'Sam Chen' : null;
    if (!chosen) throw new Error('Choose Sam Chen or Sam Patel so Otto knows who you mean.');
    this.addStep(taskId, 'tool_result', `You chose ${chosen}.`);
    this.publish({ turns: [{ id: this.id('turn'), user_text: answer, assistant_text: `Got it. Finding time with ${chosen}.`, task_ids: [taskId], action_item_ids: [], started_at: this.now(), ended_at: this.now() }, ...this.state.turns] });
    this.updateTask(taskId, { status: 'running', spoken_summary: `Finding a morning with ${chosen}.` });
    this.later(() => {
      this.addStep(taskId, 'tool_result', `Created Coffee with ${chosen}, Tuesday 10:00–10:30 AM.`, { toolkit: 'googlecalendar', tool_slug: 'GOOGLECALENDAR_CREATE_EVENT', risk: 'R1', duration_ms: 680, args_redacted: { attendee: chosen, duration_minutes: 30 } });
      this.advance(taskId);
    }, 1300);
  };
  stopChat = () => { this.chatGeneration++; if (this.chatTimer) clearTimeout(this.chatTimer); if (this.state.streaming) this.publish({ streaming: false }); };
  newChat = async () => {
    this.stopChat();
    const empty = this.state.chatSessions.find(chat => !chat.messages.length);
    if (empty) { await this.selectChat(empty.id); return; }
    const chat = { id: this.id('chat'), title: 'New chat', messages: [], created_at: this.now(), updated_at: this.now() };
    this.publish({ chatSessions: [chat, ...this.state.chatSessions], activeChatId: chat.id, messages: [] });
    await this.writes;
  };
  selectChat = async (id: string) => { const chat = this.state.chatSessions.find(item => item.id === id); if (!chat) return; this.stopChat(); this.publish({ activeChatId: id, messages: chat.messages }); await this.writes; };
  clearChat = async () => { this.stopChat(); this.publish({ messages: [] }); await this.writes; };
  sendChat = async (text: string) => {
    this.requireOnline(); if (!text.trim() || this.state.streaming) return;
    const user: ChatMessage = { id: this.id('message'), role: 'user', text: text.trim(), created_at: this.now() };
    let answer: string; let citations: ChatMessage['citations'] = [];
    if (/^(please\s+)?(schedule|send|email|save|create|book|remind|set up)\b/i.test(text.trim())) {
      const id = this.startTask(text.trim(), 'chat'); answer = 'On it. I started a demo task and will ask before anything is sent on your behalf.'; citations = [{ kind: 'task', id }];
    } else if (/context|remember|notes|prefer|usual|manager/i.test(text)) {
      const notes = this.state.memories.filter(m => m.source === 'user');
      answer = notes.length ? `Here is the context you gave me:\n\n${notes.map(m => `• ${m.text}`).join('\n')}\n\nThese notes guide this demo. You can edit them in Context.` : 'You have no saved notes yet. Add one in Context and I can use it here.';
    } else if (/commit|week/i.test(text)) {
      const items = this.state.actionItems.filter(a => a.status === 'open');
      answer = items.length ? `You mentioned ${items.length} things to follow up on:\n\n${items.map(a => `• ${a.title}`).join('\n')}\n\nThey are waiting in Tasks. Nothing has been started for these yet.` : 'There are no open commitments in this demo right now.';
      citations = items.map(a => ({ kind: 'turn', id: a.turn_id }));
    } else if (/open|waiting|left|pending/i.test(text)) {
      const tasks = this.state.tasks.filter(t => !['succeeded', 'cancelled', 'failed'].includes(t.status));
      answer = tasks.length ? tasks.map(t => `${t.goal} — ${t.spoken_summary ?? t.status.replaceAll('_', ' ')}.`).join('\n\n') : 'Nothing is waiting on you. Your demo tasks are all handled.';
      citations = tasks.map(t => ({ kind: 'task', id: t.id }));
    } else {
      const tasks = this.state.tasks.slice(0, 3);
      answer = tasks.length ? `Here is where your day stands:\n\n${tasks.map(t => `• ${t.spoken_summary ?? `${t.goal}: ${t.status.replaceAll('_', ' ')}`}`).join('\n\n')}` : 'Your day is a clean slate in this demo. Try a scenario in Settings, or ask me to schedule a meeting.';
      citations = tasks.map(t => ({ kind: 'task', id: t.id }));
      const notes = this.state.memories.filter(m => m.source === 'user');
      if (notes[0] && /sam|meeting|coffee/i.test(text)) answer += `\n\nKeeping your note in mind: ${notes[0].text}`;
    }
    const reply: ChatMessage = { id: this.id('message'), role: 'assistant', text: '', created_at: this.now(), citations: citations.filter(c => c.kind === 'task') };
    this.publish({ messages: [...this.state.messages, user, reply], streaming: true });
    const token = ++this.chatGeneration;
    const sessionId = this.state.activeChatId;
    const chunks = answer.match(/.{1,18}(?:\s|$)|.{1,18}/gs) ?? [answer]; let i = 0;
    const tick = () => {
      if (token !== this.chatGeneration || sessionId !== this.state.activeChatId) return;
      if (this.state.network !== 'online') { this.chatTimer = setTimeout(tick, 500 * this.speed); return; }
      const chunk = chunks[i++] ?? '';
      const done = i >= chunks.length;
      this.publish({ messages: this.state.messages.map(m => m.id === reply.id ? { ...m, text: m.text + chunk, citations: done ? citations : citations.filter(c => c.kind === 'task') } : m), streaming: !done });
      if (!done) this.chatTimer = setTimeout(tick, 35 * this.speed);
    };
    this.chatTimer = setTimeout(tick, 200 * this.speed);
  };
  setNetwork = (network: NetworkState) => { this.publish({ network }); };
  reset = async (scenario: DemoScenario = 'default') => { this.stopChat(); this.clearTimers(); this.generation++; this.initializing = undefined; this.state = createFixtures(scenario); this.publish({ hydrated: true }); await this.writes; };
  private clearTimers() { this.timers.forEach(clearTimeout); this.timers.clear(); if (this.expiry) clearTimeout(this.expiry); }
  dispose = () => { this.stopChat(); this.generation++; this.clearTimers(); this.listeners.clear(); this.events.clear(); };
}

export const otto: OttoDataSource = new MockOtto();
