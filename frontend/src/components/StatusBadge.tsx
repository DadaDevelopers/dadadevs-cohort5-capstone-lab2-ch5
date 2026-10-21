import { confirmationText, requestStatusMeta } from '../lib/status'
import type { SpendingRequestStatus } from '../types'
import { Badge } from './ui'

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
  return (
    <Badge tone="ok" icon="check">
      {confirmations >= 6 ? 'Confirmed' : `${confirmations} of 6 confirmations`}
    </Badge>
  )
}

export { confirmationText }
