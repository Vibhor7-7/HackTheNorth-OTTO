// The real Otto: HTTP + SSE against apps/server. Implements the same
// OttoDataSource contract as MockOtto, so no screen changes when you swap.
//
// Section 7.2 is the contract. Every request carries the bearer key; live updates
// arrive on GET /api/events (APP-15: one call paints Home, everything after that
// is SSE).

import type {
  ActionItem, Approval, ChatMessage, ChatSession, ConnectionRequest, DemoScenario,
  DemoState, Device, Extension, HomePayload, Memory, NetworkState, OttoDataSource,
  OttoEvent, Task, TaskStep, Turn,
} from './types';

/**
 * Expo's fetch supports streaming response bodies, which plain React Native does
 * not - and SSE needs a stream. Injectable so the adapter can be exercised under
 * Node, where the global fetch already streams.
 */
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function defaultFetch(): FetchLike {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoFetch = require('expo/fetch').fetch as FetchLike | undefined;
    if (expoFetch) return expoFetch;
  } catch {
    /* not running under Expo */
  }
  return globalThis.fetch as FetchLike;
}

export interface HttpOttoConfig {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: FetchLike;
  /** Tasks whose step log is loaded on first paint; the rest arrive over SSE. */
  hydrateStepsFor?: number;
}

const SINGLE_THREAD_ID = 'main';

/**
 * Insert or replace by id. Every local write goes through this, because a write
 * and its SSE echo race: the server's memory.created can land before the POST's
 * own response is parsed, and a plain prepend then shows the item twice.
 */
function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [item, ...list];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

function emptyState(): DemoState {
  return {
    tasks: [], steps: [], approvals: [], connections: [], actionItems: [],
    turns: [], memories: [], extensions: [], messages: [],
    chatSessions: [{ id: SINGLE_THREAD_ID, title: 'Otto', messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    activeChatId: SINGLE_THREAD_ID,
    network: 'offline', streaming: false, hydrated: false,
  };
}

export class HttpOtto implements OttoDataSource {
  private state: DemoState = emptyState();
  private listeners = new Set<() => void>();
  private events = new Set<(event: OttoEvent) => void>();
  private fetchImpl: FetchLike;
  private stream?: AbortController;
  private retry = 0;
  private closed = false;
  private device: Device = { connected: false, state: 'idle' };
  /** Surfaced so a screen can show why it is offline instead of guessing. */
  lastError?: string;
  private poller?: ReturnType<typeof setInterval>;

  constructor(private config: HttpOttoConfig) {
    this.fetchImpl = config.fetchImpl ?? defaultFetch();
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  subscribeEvents = (listener: (event: OttoEvent) => void) => { this.events.add(listener); return () => { this.events.delete(listener); }; };

  /** The device status is not in DemoState; screens that want it read it here. */
  getDevice = () => this.device;

  /** APP-15: one call paints Home. Also folded into local state so the rest of the app sees it. */
  getHome = async (): Promise<HomePayload> => {
    const home = await this.request<HomePayload>('/api/home');
    this.publish({
      approvals: home.approvals,
      connections: home.connections,
      actionItems: home.action_items,
      tasks: home.recent_tasks,
    });
    return home;
  };

  // ---- plumbing -----------------------------------------------------------

  private publish(patch: Partial<DemoState> = {}) {
    this.state = { ...this.state, ...patch };
    if (patch.messages) {
      this.state.chatSessions = this.state.chatSessions.map((c) =>
        c.id === this.state.activeChatId
          ? { ...c, messages: patch.messages!, updated_at: new Date().toISOString(),
              title: patch.messages!.find((m) => m.role === 'user')?.text.slice(0, 60) || 'Otto' }
          : c);
    }
    this.listeners.forEach((l) => l());
  }

  private emit(event: OttoEvent) { this.events.forEach((l) => l(event)); }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    if (!res.ok) {
      // The server names its failures (a missing Composio scope, an already-decided
      // approval); surfacing that text beats a generic "request failed".
      let detail = '';
      try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* non-JSON body */ }
      const message = detail || `${init?.method ?? 'GET'} ${path} failed (${res.status})`;
      console.warn(`[otto] ${message}`);
      this.lastError = message;
      throw new Error(message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ---- hydrate ------------------------------------------------------------

  async initialize(): Promise<void> {
    try {
      const [home, turns, memories, extensions, messages, device] = await Promise.all([
        this.request<HomePayload>('/api/home'),
        this.request<Turn[]>('/api/turns?limit=50'),
        this.request<Memory[]>('/api/memories'),
        this.request<Extension[]>('/api/extensions'),
        this.request<ChatMessage[]>('/api/chat/messages?limit=50'),
        this.request<Device>('/api/device'),
      ]);

      this.device = device;
      const steps = await this.loadSteps(home.recent_tasks);

      this.publish({
        tasks: home.recent_tasks,
        approvals: home.approvals,
        connections: home.connections,
        actionItems: home.action_items,
        turns, memories, extensions, messages, steps,
        network: 'online',
        hydrated: true,
      });

      this.openEventStream();
    } catch (err) {
      // A server that is unreachable is a connection problem, not a broken app.
      // Throwing here put the whole app behind "your demo could not load", which
      // hid the real cause and gave no way back. Show offline, keep retrying, and
      // say loudly in the console what actually failed.
      const why = err instanceof Error ? err.message : String(err);
      console.warn(`[otto] could not reach ${this.config.baseUrl} - ${why}`);
      console.warn('[otto] check: same Wi-Fi as the laptop, LAN IP not localhost, server running');
      this.lastError = why;
      this.publish({ network: 'offline', hydrated: true });
      this.openEventStream();
    }
  }

  /** Step logs for the newest tasks, so Task detail is populated on first open. */
  private async loadSteps(tasks: Task[]): Promise<TaskStep[]> {
    const take = tasks.slice(0, this.config.hydrateStepsFor ?? 8);
    const results = await Promise.all(take.map((t) =>
      this.request<Task & { steps: TaskStep[] }>(`/api/tasks/${t.id}`)
        .then((d) => d.steps ?? [])
        .catch(() => [] as TaskStep[])));
    return results.flat();
  }

  // ---- live updates (SSE) -------------------------------------------------

  private openEventStream(): void {
    if (this.closed) return;
    this.stream?.abort();
    const controller = new AbortController();
    this.stream = controller;

    void (async () => {
      try {
        const res = await this.fetchImpl(`${this.config.baseUrl}/api/events`, {
          headers: { Authorization: `Bearer ${this.config.apiKey}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`event stream failed (${res.status})`);
        if (!res.body) {
          // No streaming support in this runtime. Polling is less elegant but it
          // keeps the app live, which matters more than the transport.
          console.warn('[otto] no streaming body; falling back to polling');
          this.startPolling();
          return;
        }

        this.retry = 0;
        if (this.state.network !== 'online') this.publish({ network: 'online' });

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // SSE frames are separated by a blank line.
          let split: number;
          while ((split = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            this.handleFrame(frame);
          }
        }
        throw new Error('event stream ended');
      } catch (err) {
        if (controller.signal.aborted || this.closed) return;
        this.scheduleReconnect();
      }
    })();
  }

  private handleFrame(frame: string): void {
    let type = '';
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue;                 // heartbeat
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (!type || data.length === 0) return;

    let payload: unknown;
    try { payload = JSON.parse(data.join('\n')); } catch { return; }

    this.apply({ type, data: payload } as OttoEvent);
  }

  /** Fold one server event into local state, then hand it to event subscribers. */
  private apply(event: OttoEvent): void {
    switch (event.type) {
      case 'task.created':
      case 'task.updated':
        this.publish({ tasks: upsert(this.state.tasks, event.data) });
        break;
      case 'step.created':
        this.publish({ steps: upsert(this.state.steps, event.data) });
        break;
      case 'turn.created':
      case 'turn.updated':
        // Newest first, matching GET /api/turns and what the Transcript tab shows.
        this.publish({ turns: upsert(this.state.turns, event.data) });
        break;
      case 'approval.created':
      case 'approval.updated':
        this.publish({ approvals: upsert(this.state.approvals, event.data) });
        break;
      case 'connection.created':
      case 'connection.updated':
        this.publish({ connections: upsert(this.state.connections, event.data) });
        break;
      case 'action_item.created':
      case 'action_item.updated':
        this.publish({ actionItems: upsert(this.state.actionItems, event.data) });
        break;
      case 'memory.created':
        this.publish({ memories: upsert(this.state.memories, event.data) });
        break;
      case 'extension.updated':
        this.publish({ extensions: upsert(this.state.extensions, event.data) });
        break;
      case 'device.updated':
        this.device = event.data;
        this.publish();
        break;
    }
    this.emit(event);
  }

  /**
   * Fallback when the runtime cannot stream. Re-reads the parts of state that
   * change on their own; a write already refreshes what it touched.
   */
  private startPolling(): void {
    if (this.poller) return;
    const tick = async () => {
      try {
        const [home, device] = await Promise.all([
          this.request<HomePayload>('/api/home'),
          this.request<Device>('/api/device'),
        ]);
        this.device = device;
        this.publish({
          approvals: home.approvals,
          connections: home.connections,
          actionItems: home.action_items,
          tasks: home.recent_tasks,
          network: 'online',
        });
      } catch {
        this.publish({ network: 'reconnecting' });
      }
    };
    void tick();
    this.poller = setInterval(tick, 2500);
  }

  private scheduleReconnect(): void {
    this.retry += 1;
    this.publish({ network: this.retry > 3 ? 'offline' : 'reconnecting' });
    const wait = Math.min(1000 * 2 ** (this.retry - 1), 15000);
    setTimeout(() => this.openEventStream(), wait);
  }

  close(): void {
    this.closed = true;
    this.stream?.abort();
    if (this.poller) { clearInterval(this.poller); this.poller = undefined; }
  }

  // ---- mutations ----------------------------------------------------------
  //
  // Each one posts and then refreshes from the authoritative response. SSE will
  // also deliver the change; upsert-by-id makes that idempotent.

  approve = async (id: string) => { await this.decide(id, 'approve'); };
  deny = async (id: string) => { await this.decide(id, 'deny'); };

  private async decide(id: string, decision: 'approve' | 'deny') {
    const updated = await this.request<Approval>(`/api/approvals/${id}/decision`, {
      method: 'POST', body: JSON.stringify({ decision }),
    });
    if (updated?.id) this.apply({ type: 'approval.updated', data: updated });
  }

  connect = async (toolkitId: string) => {
    // The mock flipped a local flag; a real connection needs the user to sign in
    // at Composio. So this opens the Connect Link itself - the screen only awaits
    // and then shows its success state, and a promise that never settles there
    // leaves the button stuck mid-press.
    const { link } = await this.request<{ link: string }>(`/api/extensions/${toolkitId}/connect`, { method: 'POST' });
    this.lastConnectLink = link;
    try {
      const browser = require('expo-web-browser') as { openBrowserAsync(url: string): Promise<unknown> };
      await browser.openBrowserAsync(link);
    } catch {
      // Not under Expo, or the browser refused: fall through to Linking.
      try {
        const linking = require('react-native').Linking as { openURL(url: string): Promise<unknown> };
        await linking.openURL(link);
      } catch {
        console.warn(`[otto] could not open the connect link, open it manually: ${link}`);
      }
    }
    // Composio tells the server when the user finishes (GET /connect/callback), and
    // that arrives over SSE. Re-read now as well, so returning from the browser
    // shows the new status even if the event was missed.
    await this.refreshExtensions().catch(() => {});
  };
  /** The most recent Connect Link, in case a screen wants to show or re-open it. */
  lastConnectLink?: string;

  disconnect = async (toolkitId: string) => {
    await this.request(`/api/extensions/${toolkitId}/disconnect`, { method: 'POST' });
    await this.refreshExtensions();
  };

  private async refreshExtensions() {
    this.publish({ extensions: await this.request<Extension[]>('/api/extensions') });
  }

  doAction = async (id: string): Promise<string> => {
    const { task_id } = await this.request<{ task_id: string }>(`/api/action-items/${id}/approve`, { method: 'POST' });
    return task_id;
  };

  dismissAction = async (id: string) => {
    await this.request(`/api/action-items/${id}/dismiss`, { method: 'POST' });
    this.publish({
      actionItems: this.state.actionItems.map((a) => a.id === id ? { ...a, status: 'dismissed' } : a),
    });
  };

  addMemory = async (text: string) => {
    const memory = await this.request<Memory>('/api/memories', { method: 'POST', body: JSON.stringify({ text }) });
    this.publish({ memories: upsert(this.state.memories, memory) });
  };

  deleteMemory = async (id: string) => {
    await this.request(`/api/memories/${id}`, { method: 'DELETE' });
    this.publish({ memories: this.state.memories.filter((m) => m.id !== id) });
  };

  answerQuestion = async (taskId: string, answer: string) => {
    await this.request(`/api/tasks/${taskId}/answer`, { method: 'POST', body: JSON.stringify({ answer }) });
  };

  // ---- chat ---------------------------------------------------------------
  //
  // The server keeps one thread (DATA-7, CHAT-3). The session methods therefore
  // operate on that single thread rather than pretending to manage several.

  sendChat = async (text: string) => {
    const mine: ChatMessage = { id: `local-${Date.now()}`, role: 'user', text, created_at: new Date().toISOString() };
    this.publish({ messages: [...this.state.messages, mine], streaming: true });

    const reply: ChatMessage = { id: `pending-${Date.now()}`, role: 'assistant', text: '', created_at: new Date().toISOString() };
    let assembled = '';

    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);

      this.publish({ messages: [...this.state.messages, reply] });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });

        let split: number;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);

          let type = '';
          const lines: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) type = line.slice(6).trim();
            else if (line.startsWith('data:')) lines.push(line.slice(5).trim());
          }
          if (!type || !lines.length) continue;

          let payload: any;
          try { payload = JSON.parse(lines.join('\n')); } catch { continue; }

          if (type === 'chat.delta') {
            assembled += payload.text ?? '';
            this.replaceMessage(reply.id, { ...reply, text: assembled });
          } else if (type === 'chat.done') {
            this.replaceMessage(reply.id, { ...reply, id: payload.id ?? reply.id, text: payload.text ?? assembled, citations: payload.citations });
            done = true;
          } else if (type === 'chat.error') {
            throw new Error(payload.message ?? 'chat failed');
          }
        }
      }
    } finally {
      this.publish({ streaming: false });
    }
  };

  private replaceMessage(id: string, next: ChatMessage) {
    this.publish({ messages: this.state.messages.map((m) => m.id === id ? next : m) });
  }

  stopChat = () => { this.publish({ streaming: false }); };

  newChat = async () => { await this.clearChat(); };
  selectChat = async (_id: string) => { /* one thread; nothing to select */ };

  clearChat = async () => {
    // The server has no delete-thread route, so this clears the local view only.
    // Honest about it rather than implying the history is gone server side.
    this.publish({ messages: [] });
  };

  // ---- demo controls ------------------------------------------------------

  reset = async (_scenario?: DemoScenario) => {
    this.state = emptyState();
    this.publish();
    await this.initialize();
  };

  /** Local only: there is no server-side notion of the client being offline. */
  setNetwork = (network: NetworkState) => { this.publish({ network }); };
}
