import { useEffect, useState } from 'react'
import * as api from '../api'
import { errorMessage } from '../api/errors'
import type { DiscussionMessage } from '../types'
import { dateTime } from '../lib/format'
import { Avatar, Button, EmptyState, ErrorState, LoadingBlock, Panel, TextArea } from './ui'

export function SpendingDiscussion({ communityId, requestId, currentUserId }: { communityId: string; requestId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<DiscussionMessage[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await api.listDiscussionMessages(communityId, requestId, { limit: 50 })
      setMessages(page.items)
      setNextCursor(page.nextCursor)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  }
  useEffect(() => {
    setMessages([])
    setNextCursor(null)
    setError(null)
    void load()
  }, [communityId, requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = async () => {
    if (!nextCursor) return
    setLoadingMore(true)
    try {
      const page = await api.listDiscussionMessages(communityId, requestId, { cursor: nextCursor, limit: 50 })
      setMessages((current) => [...current, ...page.items])
      setNextCursor(page.nextCursor)
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setLoadingMore(false) }
  }
  const submit = async () => {
    const value = body.trim()
    if (!value) { setError('Write a message before posting.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const message = await api.addDiscussionMessage(communityId, requestId, value)
      setMessages((current) => [...current, message])
      setBody('')
    } catch (reason) { setError(errorMessage(reason)) }
    finally { setSubmitting(false) }
  }

  return (
    <Panel title="Discussion">
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        {loading ? <LoadingBlock rows={2} label="Loading discussion" /> : error && messages.length === 0 ? <ErrorState message={error} onRetry={() => void load()} /> : messages.length === 0 ? <EmptyState icon="users" title="No messages yet">Ask a question or share context about this payment.</EmptyState> : <ol className="flex flex-col gap-4">{messages.map((message) => (
          <li key={message.id} className="flex items-start gap-3"><Avatar name={message.author.name} size={34} tone="light" /><div className="min-w-0 flex-1 rounded-lg bg-sunken px-4 py-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-bold">{message.author.name}{message.author.id === currentUserId && <span className="font-normal text-muted"> (you)</span>}</p><time className="text-xs text-muted" dateTime={message.createdAt}>{dateTime(message.createdAt)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{message.body}</p></div></li>
        ))}</ol>}
        {nextCursor && <Button variant="secondary" size="sm" busy={loadingMore} onClick={() => void loadMore()}>Load more messages</Button>}
        {error && messages.length > 0 && <p className="text-sm text-bad-ink" role="alert">{error}</p>}
        <div className="border-t border-line pt-5"><TextArea label="Add to the discussion" hint="Plain text only, up to 2,000 characters." maxLength={2000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} /><div className="mt-3 flex justify-end"><Button icon="send" busy={submitting} onClick={() => void submit()}>Post message</Button></div></div>
      </div>
    </Panel>
  )
}
