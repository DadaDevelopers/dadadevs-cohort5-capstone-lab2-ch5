import { Link } from 'react-router-dom'
import { Icon, Logo } from '../components/Icon'
import { PrototypeBanner } from '../components/PrototypeBanner'
import { SignerSlotsMini } from '../components/SignerSlots'
import { ButtonLink } from '../components/ui'

// HashRouter owns the URL hash, so in-page links scroll with JavaScript instead of #anchors.
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const STEPS = [
  { title: 'Create the community', body: 'The person setting it up becomes the administrator. They manage the member list, nothing more.' },
  { title: 'Choose the signers', body: 'Pick the trusted members who will approve spending. Being a member does not make you a signer.' },
  { title: 'Agree the approval rule', body: 'For example, 3 of 5 signers must approve. At least two people are always needed.' },
  { title: 'Receive contributions', body: 'Everyone sends to one shared address. Every member can see the balance and each deposit.' },
  { title: 'Spend only with approval', body: 'A signer proposes a payment. It leaves the wallet only after enough signers have signed it on their own devices.' },
]

const ROLES = [
  {
    role: 'Administrator',
    can: 'Create the community, add members, choose the signers and set the first approval rule.',
    cannot: 'Spend, or skip the approval rule. If the admin is also a signer, their signature counts once like anyone else’s.',
  },
  {
    role: 'Authorised signer',
    can: 'Propose spending, review the full details, sign or decline, and send a payment once enough people have signed.',
    cannot: 'Spend alone. Change a request after someone has signed it.',
  },
  {
    role: 'Member',
    can: 'See the balance, every contribution, every request and who signed it, and the full history.',
    cannot: 'Sign or propose spending.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-dvh bg-paper">
      <PrototypeBanner />

      <section className="relative overflow-hidden bg-night text-white">
        <div
          className="absolute bottom-0 right-0 top-20 hidden w-[42%] bg-cover bg-center md:block"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}hero.jpg)`, clipPath: 'ellipse(100% 78% at 100% 50%)' }}
          role="img"
          aria-label="Rooftops of a Nairobi neighbourhood"
        />
        <header className="relative flex items-center gap-6 px-5 py-5 sm:px-10">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="text-lg font-bold">Community Safe</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-8 text-[15px] font-semibold md:flex" aria-label="Page">
            <button type="button" onClick={() => scrollTo('problem')} className="hover:text-accent">Why</button>
            <button type="button" onClick={() => scrollTo('how')} className="hover:text-accent">How it works</button>
            <button type="button" onClick={() => scrollTo('roles')} className="hover:text-accent">Roles</button>
            <Link to="/login" className="hover:text-accent">Log in</Link>
          </nav>
          <ButtonLink to="/signup" className="ml-auto md:ml-0">Get started</ButtonLink>
        </header>

        <div className="relative px-5 pb-20 pt-14 sm:px-10 md:w-[58%] md:pb-32 md:pt-28">
          <h1 className="text-[40px] font-extrabold leading-[1.08] sm:text-6xl">
            Your community’s money.
            <br />
            <span className="text-accent">Controlled together</span>.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90 sm:text-xl">
            A Bitcoin multisignature wallet for communities, organisations and groups. No single person can move the funds.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <ButtonLink to="/signup" size="lg">Create community</ButtonLink>
            <button type="button" onClick={() => scrollTo('how')} className="inline-flex h-14 items-center border border-white/60 px-7 font-semibold hover:bg-white/10">
              Learn more
            </button>
          </div>
          <p className="mt-8 text-sm text-white/60">
            Want to look around first?{' '}
            <Link to="/login" className="font-semibold text-white underline underline-offset-4">
              Log in with the demo community
            </Link>
          </p>
        </div>
      </section>

      <section id="problem" className="scroll-mt-4 border-b border-line">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-10 md:grid-cols-12 md:py-24">
          <div className="md:col-span-5">
            <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">The problem</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">When one person holds the money, everyone depends on them.</h2>
          </div>
          <div className="space-y-4 text-[17px] leading-relaxed text-ink-soft md:col-span-6 md:col-start-7">
            <p>
              Chamas, savings groups and community projects usually keep their funds with one treasurer. If that person falls ill, travels, loses
              their phone or is tempted, the group cannot reach its own money, and members cannot easily see what happened to it.
            </p>
            <p>
              CommunitySafe splits control. Several trusted members each hold one key, and the group agrees how many of them must sign before
              anything is spent. Every member can follow along.
            </p>
          </div>
          <div className="grid border border-line bg-surface md:col-span-12 md:grid-cols-2">
            <div className="border-b border-line p-6 md:border-b-0 md:border-r">
              <p className="text-sm font-semibold text-muted">Today</p>
              <p className="mt-1 text-lg font-bold">One treasurer, one key</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="h-6 w-6 bg-ink" />
                <span className="text-sm text-ink-soft">1 of 1. Whoever holds it can spend everything.</span>
              </div>
            </div>
            <div className="p-6">
              <p className="text-sm font-semibold text-muted">With CommunitySafe</p>
              <p className="mt-1 text-lg font-bold">Five signers, any three must approve</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <SignerSlotsMini total={5} signed={3} declined={0} threshold={3} />
                <span className="text-sm text-ink-soft">One lost phone or one bad actor cannot move or lock the funds.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-4 border-b border-line bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-10 md:py-24">
          <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">How it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Five steps from a group chat to a shared, accountable wallet.</h2>
          <ol className="mt-12 border-t border-ink">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid gap-2 border-b border-line py-6 sm:grid-cols-12 sm:gap-6">
                <span className="text-3xl font-extrabold tabular text-accent sm:col-span-1">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-xl font-bold sm:col-span-4">{s.title}</h3>
                <p className="text-[16px] leading-relaxed text-ink-soft sm:col-span-7">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="roles" className="scroll-mt-4 border-b border-line">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-10 md:py-24">
          <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">Roles</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight sm:text-4xl">Membership and signing authority are kept apart.</h2>
          <div className="mt-12 overflow-hidden border border-line bg-surface">
            <div className="hidden grid-cols-12 border-b border-ink bg-sunken text-sm font-bold sm:grid">
              <span className="col-span-3 px-5 py-3">Role</span>
              <span className="col-span-5 px-5 py-3">Can</span>
              <span className="col-span-4 px-5 py-3">Cannot</span>
            </div>
            {ROLES.map((r) => (
              <div key={r.role} className="grid border-b border-line last:border-b-0 sm:grid-cols-12">
                <p className="px-5 pt-5 text-lg font-bold sm:col-span-3 sm:py-5">{r.role}</p>
                <p className="flex gap-2 px-5 pt-3 text-[15px] leading-relaxed sm:col-span-5 sm:py-5">
                  <Icon name="check" size={18} className="mt-0.5 shrink-0 text-ok-ink" />
                  {r.can}
                </p>
                <p className="flex gap-2 px-5 pb-5 pt-3 text-[15px] leading-relaxed text-ink-soft sm:col-span-4 sm:py-5">
                  <Icon name="ban" size={18} className="mt-0.5 shrink-0 text-bad-ink" />
                  {r.cannot}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 flex max-w-3xl items-start gap-2 text-[15px] text-ink-soft">
            <Icon name="shield" size={18} className="mt-0.5 shrink-0" />
            CommunitySafe only ever stores public key information. Private keys and recovery phrases stay on each signer’s own device and are never
            asked for.
          </p>
        </div>
      </section>

      <footer className="bg-night text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-10 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-2xl font-extrabold">Try it with a test community.</p>
            <p className="mt-2 text-white/70">This prototype runs on mock data and a simulated regtest network. Nothing here is real money.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/signup" size="lg">Create community</ButtonLink>
            <ButtonLink to="/login" size="lg" variant="inverse">Log in</ButtonLink>
          </div>
        </div>
      </footer>
    </div>
  )
}
