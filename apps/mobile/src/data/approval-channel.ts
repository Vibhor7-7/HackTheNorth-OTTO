import type { Approval, OttoDataSource } from './types';

type ApprovalSource = Pick<OttoDataSource, 'getSnapshot' | 'approve' | 'deny'>;
export function parseApprovalReply(text: string, approvals: Approval[], now = Date.now()) {
  const match = /^(approve|deny)\s+([a-z0-9-]+)$/i.exec(text.trim());
  if (!match) throw new Error('Use approve CODE or deny CODE, using the code shown in the message.');
  const matches = approvals.filter(a => a.code.toLowerCase() === match[2].toLowerCase());
  const pending = matches.filter(a => a.status === 'pending' && Date.parse(a.expires_at) > now);
  if (pending.length > 1) throw new Error('More than one request has this code. Open Decisions and review the specific request.');
  if (!pending.length) {
    if (!matches.length) throw new Error('That code was not found. Check the code in the approval message.');
    throw new Error('This request has already been handled or expired. Nothing was changed.');
  }
  return { approval: pending[0], decision: match[1].toLowerCase() as 'approve' | 'deny' };
}
export async function decideApproval(source: ApprovalSource, id: string, decision: 'approve' | 'deny') {
  const approval = source.getSnapshot().approvals.find(a => a.id === id);
  if (!approval || approval.status !== 'pending' || Date.parse(approval.expires_at) <= Date.now()) throw new Error('This request has already been handled or expired. Nothing was changed.');
  await source[decision](id);
  const status = source.getSnapshot().approvals.find(a => a.id === id)?.status;
  if (status !== (decision === 'approve' ? 'approved' : 'denied')) throw new Error('The request changed before your reply arrived. Check its current status.');
  return approval;
}
export async function sendApprovalReply(source: ApprovalSource, text: string) {
  const { approval, decision } = parseApprovalReply(text, source.getSnapshot().approvals);
  await decideApproval(source, approval.id, decision);
  return { approvalId: approval.id, text: decision === 'approve' ? `Approved ${approval.code}. Otto can continue the demo task.` : `Denied ${approval.code}. The action was cancelled.` };
}
export function timeRemaining(expiresAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left` : 'Expired';
}
