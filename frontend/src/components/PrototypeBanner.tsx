/** Always visible while the MVP is restricted to Bitcoin Regtest. */
export function PrototypeBanner() {
  return (
    <div className="relative z-40 border-b border-night bg-night text-white">
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-[13px] sm:px-6">
        <p className="flex items-center gap-2">
          <span className="bg-accent px-1.5 py-px text-[11px] font-bold uppercase tracking-wider">Regtest MVP</span>
          <span className="text-white/85">
            Connected accounts use Bitcoin Regtest only. Coins have no monetary value. Never enter a private key or recovery phrase.
          </span>
        </p>
      </div>
    </div>
  )
}
