import { confirmationText, requestStatusMeta } from '../lib/status'
import type { Network, SpendingRequestStatus } from '../types'
import { Badge } from './ui'

export function NetworkBadge({ network }: { network: Network }) {
  return <Badge tone="teal" icon="info">Test mode · {network === 'regtest' ? 'Regtest' : 'Signet'} coins</Badge>
}

export function RequestStatusBadge({ status }: { status: SpendingRequestStatus }) {
  const meta = requestStatusMeta[status]
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export function ConfirmationBadge({ confirmations }: { confirmations: number }) {
  if (confirmations <= 0) {
    return (
      <Badge tone="wait" icon="clock">
        Unconfirmed
      </Badge>
    )
  }
  if (confirmations >= 6) {
    return (
      <Badge tone="ok" icon="check">
        Confirmed
      </Badge>
    )
  }
  return (
    <Badge tone="ok" icon="check">
      {confirmations} confirmation{confirmations === 1 ? '' : 's'}
    </Badge>
  )
}

export { confirmationText }
