import type { DemoScenario, DemoState, Task, TaskStep } from './types';

export function createFixtures(scenario: DemoScenario = 'default', now = Date.now()): DemoState {
  const at = (minutes = 0) => new Date(now - minutes * 60_000).toISOString();
  const task = (id: string, goal: string, status: Task['status'], toolkits_used: string[], minutes: number): Task => ({ id, goal, status, source: 'voice', toolkits_used, created_at: at(minutes), updated_at: at() });
  const step = (task_id: string, seq: number, kind: TaskStep['kind'], summary: string, extra: Partial<TaskStep> = {}): TaskStep => ({ id: `${task_id}-step-${seq}`, task_id, seq, kind, summary, created_at: at(4 - seq / 2), ...extra });
  const state: DemoState = {
    // The simulation has no hardware, so it reports a plausible device: the screen
    // then has the same shape whichever provider is in use.
    device: { connected: true, state: 'idle', last_seen: at(0) },
    hydrated: false, network: 'online', streaming: false, demoMode: true, autoApprove: false, messages: [],
    profile: { name: 'Ayush', timezone: 'America/Toronto', contacts: [] }, activeChatId: 'chat-initial', chatSessions: [{ id: 'chat-initial', title: 'New chat', messages: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    tasks: [
      task('task-shopify', 'Put the blue hoodie on sale for 20% off', 'awaiting_approval', ['shopify'], 3),
      { ...task('task-coffee', 'Coffee with Sam next week. Send him the invite.', 'awaiting_connection', ['googlecalendar', 'gmail'], 12), spoken_summary: 'Tuesday at 10 works. Connect Gmail to send Sam the details.' },
      { ...task('task-notes', 'Save the three ideas from my morning walk', 'succeeded', ['notion'], 64), spoken_summary: 'Three ideas saved to your notebook.', detail_md: 'Saved in your demo notebook: a smaller wearable, a physical confirmation gesture, and a daily recap.' },
    ],
    steps: [
      step('task-shopify', 1, 'plan', 'Chose Shopify from 1,500 apps to find your product and update its public price.'),
      step('task-shopify', 2, 'tool_result', 'Found Blue Everyday Hoodie. Current price: $80.00 CAD.', { toolkit: 'shopify', tool_slug: 'SHOPIFY_GET_PRODUCT', risk: 'R0', duration_ms: 420, result_redacted: { product: 'Blue Everyday Hoodie', price: 80, currency: 'CAD' } }),
      step('task-shopify', 3, 'approval_wait', 'A public price change needs your approval.', { toolkit: 'shopify', tool_slug: 'SHOPIFY_UPDATE_PRODUCT', risk: 'R2', args_redacted: { product: 'Blue Everyday Hoodie', price: 64, currency: 'CAD' } }),
      step('task-coffee', 1, 'plan', 'Chose Google Calendar and Gmail from 1,500 apps: find a shared time, then email the invite.'),
      step('task-coffee', 2, 'question', 'There are two Sams: Sam Chen, your manager, and Sam Patel, your designer. Which one?'),
      step('task-coffee', 3, 'tool_result', 'You chose Sam Chen.'),
      step('task-coffee', 4, 'tool_result', 'Created Coffee with Sam Chen, Tuesday 10:00–10:30 AM.', { toolkit: 'googlecalendar', tool_slug: 'GOOGLECALENDAR_CREATE_EVENT', risk: 'R1', duration_ms: 680, args_redacted: { attendee: 'sam.chen@example.com', time: 'Tuesday 10:00–10:30 AM', timezone: 'America/Toronto' } }),
      step('task-coffee', 5, 'connection_wait', 'Gmail needs a connection before Otto can prepare the invite.', { toolkit: 'gmail' }),
      step('task-notes', 1, 'plan', 'Chose Notion to save your ideas in your notebook.'),
      step('task-notes', 2, 'tool_result', 'Saved three ideas to Morning walks.', { toolkit: 'notion', tool_slug: 'NOTION_CREATE_PAGE', risk: 'R1', duration_ms: 510 }),
      step('task-notes', 3, 'final', 'Three ideas saved. This is a local demo record.'),
    ],
    approvals: [{ id: 'approval-shopify', task_id: 'task-shopify', step_id: 'task-shopify-step-3', code: '4821', summary: 'Put the blue hoodie on sale?', facts: { Product: 'Blue Everyday Hoodie', Store: 'Otto Supply · demo store', 'Current price': '$80.00 CAD', 'New price': '$64.00 CAD', Discount: '20%', Impact: 'Public storefront price' }, args_hash: 'demo-shopify-80-64', status: 'pending', channel: 'app', expires_at: at(-5) }],
    connections: [{ id: 'connection-gmail', task_id: 'task-coffee', step_id: 'task-coffee-step-5', toolkit: 'gmail', link: 'otto://demo/connect/gmail', status: 'pending', created_at: at(10) }],
    actionItems: [
      { id: 'action-meeting', turn_id: 'turn-meeting', title: 'Make time for the team', suggested_goal: 'Schedule a team meeting tomorrow at 10 AM via Google Calendar', toolkit_hint: 'googlecalendar', confidence: .98, snippet: 'I need to schedule a meeting at 10 tomorrow with the team.', status: 'open', created_at: at(18) },
      { id: 'action-email', turn_id: 'turn-email', title: 'Send the prototype to Maya', suggested_goal: 'Email Maya the Otto prototype update', toolkit_hint: 'gmail', confidence: .94, snippet: "Oh, and I said I'd send Maya the prototype update.", status: 'open', created_at: at(35) },
      { id: 'action-notion', turn_id: 'turn-notion', title: 'Keep that pitch idea', suggested_goal: 'Save the physical button pitch idea to Notion', toolkit_hint: 'notion', confidence: .89, snippet: "Let's save that idea about the button for the pitch.", status: 'open', created_at: at(51) },
    ],
    turns: [
      { id: 'turn-shopify', user_text: 'Put the blue hoodie on sale for 20 percent off.', assistant_text: 'I found it. Check the app to approve the new price.', task_ids: ['task-shopify'], action_item_ids: [], latency_ms: 890, started_at: at(3), ended_at: at(2.9) },
      { id: 'turn-coffee', user_text: 'Find 30 minutes with Sam next week for a coffee chat and send an invite.', assistant_text: 'Sam Chen or Sam Patel?', task_ids: ['task-coffee'], action_item_ids: [], latency_ms: 780, started_at: at(12), ended_at: at(11.9) },
      { id: 'turn-sam', user_text: 'Sam Chen, my manager.', assistant_text: 'Tuesday at 10 works. Connect Gmail in the app and I can send the details.', task_ids: ['task-coffee'], action_item_ids: [], started_at: at(11), ended_at: at(10.9) },
      { id: 'turn-meeting', user_text: 'I need to schedule a meeting at 10 tomorrow with the team.', assistant_text: 'Got it.', task_ids: [], action_item_ids: ['action-meeting'], started_at: at(18), ended_at: at(17.9) },
      { id: 'turn-email', user_text: "Oh, and I said I'd send Maya the prototype update.", assistant_text: 'I have that.', task_ids: [], action_item_ids: ['action-email'], started_at: at(35), ended_at: at(34.9) },
      { id: 'turn-notion', user_text: "Let's save that idea about the button for the pitch.", assistant_text: 'The physical button idea. Got it.', task_ids: [], action_item_ids: ['action-notion'], started_at: at(51), ended_at: at(50.9) },
      { id: 'turn-notes', user_text: 'Save the three ideas from my morning walk.', assistant_text: 'Three ideas saved to your notebook.', task_ids: ['task-notes'], action_item_ids: [], started_at: at(64), ended_at: at(63.9) },
    ],
    memories: [
      { id: 'memory-sam', text: 'Sam Chen is my manager. Sam Patel is our designer.', source: 'user', created_at: at(1440) },
      { id: 'memory-morning', text: 'I prefer meetings in the morning, before 11.', source: 'user', created_at: at(1441) },
      { id: 'memory-order', text: 'My usual is a falafel bowl from Green Kitchen. No onions.', source: 'user', created_at: at(1442) },
    ],
    extensions: [
      { id: 'shopify', name: 'Shopify', description: 'Your store, products, and orders.', status: 'connected', tool_count: 83 },
      { id: 'googlecalendar', name: 'Google Calendar', description: 'Find time. Make room for what matters.', status: 'connected', tool_count: 27 },
      { id: 'gmail', name: 'Gmail', description: 'Invites, follow-ups, and the words you owe.', status: 'needs_auth', tool_count: 34 },
      { id: 'notion', name: 'Notion', description: 'A place for the thoughts worth keeping.', status: 'connected', tool_count: 42 },
      { id: 'slack', name: 'Slack', description: 'Keep your team in the loop.', status: 'suggested', tool_count: 56 },
      { id: 'github', name: 'GitHub', description: 'Issues, pull requests, and what ships next.', status: 'suggested', tool_count: 91 },
    ],
  };
  if (scenario === 'coffee') {
    state.tasks = [{ ...state.tasks[1], status: 'needs_input', spoken_summary: 'Which Sam did you mean?', created_at: at(), updated_at: at() }];
    state.steps = state.steps.filter(s => s.task_id === 'task-coffee' && s.seq <= 2);
    state.approvals = []; state.connections = []; state.actionItems = [];
    state.turns = state.turns.filter(t => t.id === 'turn-coffee');
  }
  if (scenario === 'food') {
    state.tasks = [task('task-food', 'Order my usual from Green Kitchen', 'awaiting_approval', ['demo-food'], 1)];
    state.steps = [step('task-food', 1, 'plan', 'Loaded your usual from saved context. Food ordering is a simulated demo tool.'), step('task-food', 2, 'approval_wait', 'Review the bowl, total, and delivery address before placing the demo order.', { risk: 'R2', toolkit: 'demo-food' })];
    state.approvals = [{ id: 'approval-food', task_id: 'task-food', step_id: 'task-food-step-2', code: '9042', summary: 'Your usual, on its way?', facts: { Restaurant: 'Green Kitchen · simulated', Order: 'Falafel bowl · no onions', Subtotal: '$16.00 CAD', 'Delivery + tax': '$4.80 CAD', Total: '$20.80 CAD', 'Deliver to': '200 University Ave W, Waterloo', Mode: 'Demo only — no order or charge' }, args_hash: 'demo-food-2080', status: 'pending', expires_at: at(-5) }];
    state.connections = []; state.actionItems = [];
    state.turns = [{ id: 'turn-food', user_text: 'Order my usual from Green Kitchen.', assistant_text: 'Your falafel bowl, no onions. Check the app to confirm the demo order.', task_ids: ['task-food'], action_item_ids: [], started_at: at(1), ended_at: at(.9) }];
  }
  if (scenario === 'empty') { state.tasks = []; state.steps = []; state.approvals = []; state.connections = []; state.actionItems = []; state.turns = []; }
  if (scenario === 'expired' || scenario === 'failure') {
    state.tasks = [{ ...state.tasks[0], status: scenario === 'expired' ? 'cancelled' : 'failed', spoken_summary: scenario === 'expired' ? 'Approval expired. Your price was not changed.' : 'Shopify could not be reached. Your price was not changed.', error: scenario === 'failure' ? 'The demo tool timed out. Start the demo again to retry.' : undefined }];
    state.steps = state.steps.filter(s => s.task_id === 'task-shopify');
    state.steps.push(step('task-shopify', 4, scenario === 'expired' ? 'final' : 'error', state.tasks[0].spoken_summary!));
    state.approvals = scenario === 'expired' ? [{ ...state.approvals[0], status: 'expired', expires_at: at(1), decided_at: at() }] : [];
    state.connections = []; state.actionItems = []; state.turns = state.turns.filter(t => t.id === 'turn-shopify');
  }
  return state;
}
