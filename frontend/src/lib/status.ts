import type { Tone } from '../components/ui'
import type { Membership, SpendingRequestStatus, DemoRole } from '../types'

export const requestStatusMeta: Record<SpendingRequestStatus, { label: string; tone: Tone; plain: string }> = {
  pending: { label: 'Pending', tone: 'wait', plain: 'Prepared and waiting for the first signature. The creator can still edit it.' },
  awaiting_signatures: { label: 'Awaiting signatures', tone: 'wait', plain: 'Signing has started. Details are locked.' },
  ready_to_broadcast: { label: 'Ready to send', tone: 'teal', plain: 'Enough signers approved. Any signer can now send it to the Bitcoin network.' },
  broadcast: { label: 'Sent', tone: 'ok', plain: 'Accepted by the Bitcoin network.' },
  failed: { label: 'Send failed', tone: 'bad', plain: 'The Bitcoin node did not accept it. Signatures are kept and it can be retried.' },
  rejected: { label: 'Declined', tone: 'neutral', plain: 'Too many signers declined to reach the approval rule. Nothing was sent.' },
}

export function viewerRole(m: Membership): DemoRole {
  if (m.isAdmin) return 'admin'
  if (m.isSigner) return 'signer'
  return 'member'
}

export function roleLabel(m: Membership): string {
  if (m.isAdmin && m.isSigner) return 'Administrator · Authorised signer'
  if (m.isAdmin) return 'Administrator'
  if (m.isSigner) return 'Authorised signer'
  return 'Community member'
}

export const demoRoleLabel: Record<DemoRole, string> = {
  admin: 'Administrator',
  signer: 'Signer',
  member: 'Member',
}

/** Confirmation wording that a non-expert can follow. */
export function confirmationText(confirmations: number): string {
  if (confirmations <= 0) return 'Waiting for first confirmation'
  if (confirmations >= 6) return `${confirmations.toLocaleString('en-GB')} confirmations · final`
  return `${confirmations} confirmation${confirmations === 1 ? '' : 's'}`
}
