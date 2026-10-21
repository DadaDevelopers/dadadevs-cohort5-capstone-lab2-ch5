import { useState } from 'react'
import * as api from '../api'
import { Icon } from './Icon'
import { cx } from './ui'

/** Always visible. States plainly that nothing here is real Bitcoin. */
export function PrototypeBanner({ showDemoControls = false }: { showDemoControls?: boolean }) {
  const [open, setOpen] = useState(false)
  const [flags, setFlags] = useState(api.getDemoFlags)

  const toggle = (key: keyof api.DemoFlags) => setFlags(api.setDemoFlags({ [key]: !flags[key] }))
  const anyOn = flags.apiOutage || flags.nodeDown

  return (
    <div className="relative z-40 border-b border-night bg-night text-white">
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[13px] sm:px-6">
        <p className="flex items-center gap-2">
          <span className="bg-accent px-1.5 py-px text-[11px] font-bold uppercase tracking-wider">Prototype</span>
          <span className="text-white/85">
            Mock data on a simulated regtest network. No real Bitcoin. Never enter a private key or recovery phrase.
          </span>
        </p>
        {showDemoControls && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cx('ml-auto inline-flex items-center gap-1.5 px-2 py-1 font-semibold hover:bg-white/10', anyOn && 'text-accent')}
          >
            <Icon name="gear" size={14} />
            Demo controls{anyOn ? ' (failure on)' : ''}
            <Icon name="chevronDown" size={14} />
          </button>
        )}
      </div>
      {open && showDemoControls && (
        <div className="absolute right-2 top-full w-[min(100vw-1rem,380px)] border border-ink bg-surface p-4 text-ink sm:right-6">
          <p className="text-sm font-bold">Simulate failures</p>
          <p className="mt-1 text-[13px] text-muted">Use these to see how each screen handles problems. They reset when you reload.</p>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={flags.apiOutage} onChange={() => toggle('apiOutage')} />
            <span>
              <span className="font-semibold">Server unreachable.</span> Every API call fails, so screens show their error and retry state.
            </span>
          </label>
          <label className="mt-3 flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={flags.nodeDown} onChange={() => toggle('nodeDown')} />
            <span>
              <span className="font-semibold">Bitcoin node down.</span> Sending a fully signed request fails and is kept for retry.
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
