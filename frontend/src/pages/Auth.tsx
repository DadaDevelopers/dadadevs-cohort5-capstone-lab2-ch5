import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '../api/errors'
import { Icon, Logo } from '../components/Icon'
import { PrototypeBanner } from '../components/PrototypeBanner'
import { Button, Notice, TextField } from '../components/ui'
import { useSession } from '../context/SessionContext'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <PrototypeBanner />
      <div className="grid flex-1 md:grid-cols-2">
        <section className="relative overflow-hidden bg-forest px-5 py-6 text-white sm:px-10 md:flex md:min-h-full md:items-center md:px-12 lg:px-20" aria-label="About CommunitySafe">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-white/10" aria-hidden="true" />
          <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-forest-2" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-xl">
            <Link to="/" className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-white">
              <span className="rounded-lg bg-white p-2"><Logo size={30} /></span>
              <span className="text-xl font-extrabold sm:text-2xl">CommunitySafe</span>
            </Link>
            <div className="mt-7 hidden md:block lg:mt-16">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-line">Shared control, clear accountability</p>
              <h2 className="mt-4 max-w-lg text-4xl font-extrabold leading-[1.12] lg:text-5xl">
                Community funds, protected together.
              </h2>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/80">
                Coordinate contributions and payments with a shared Bitcoin wallet where every approval is visible and no single person controls the funds.
              </p>
              <ul className="mt-10 grid max-w-md gap-4 text-[15px] text-white/85">
                <li className="flex items-center gap-3"><Icon name="users" size={20} /> Shared oversight for every member</li>
                <li className="flex items-center gap-3"><Icon name="rule" size={20} /> Multiple approvals before funds move</li>
                <li className="flex items-center gap-3"><Icon name="audit" size={20} /> Clear transaction history</li>
              </ul>
            </div>
          </div>
        </section>
        <main className="flex items-center justify-center px-5 py-10 sm:px-10 md:px-12 lg:px-20">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-sm sm:p-8 lg:p-10">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-teal-ink">Secure community access</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{title}</h1>
            <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}

function PasswordField({ value, onChange, error, label = 'Password', autoComplete }: { value: string; onChange: (v: string) => void; error?: string; label?: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      label={label}
      type={visible ? 'text' : 'password'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      autoComplete={autoComplete}
      placeholder="Enter your password"
      trailing={
        <button type="button" onClick={() => setVisible((v) => !v)} className="p-2 text-muted hover:text-ink" aria-label={visible ? 'Hide password' : 'Show password'}>
          <Icon name={visible ? 'eyeOff' : 'eye'} size={20} />
        </button>
      }
    />
  )
}

export function Login() {
  const { user, login } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/app'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const signIn = async (e: string, p: string, key: string) => {
    setBusy(key)
    setFormError(null)
    try {
      await login(e, p)
      navigate(from, { replace: true })
    } catch (err) {
      setFormError(errorMessage(err))
      setBusy(null)
    }
  }

  const submit = (ev: FormEvent) => {
    ev.preventDefault()
    const next: Record<string, string> = {}
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter the email address you signed up with.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length === 0) void signIn(email, password, 'form')
  }

  if (user) return <Navigate to={from} replace />

  return (
    <AuthShell title="Welcome back" subtitle="Log in to your account">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError && <Notice tone="bad" title="Could not log in">{formError}</Notice>}
        <TextField label="Email address" type="email" autoComplete="email" placeholder="you@example.org" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordField value={password} onChange={setPassword} error={errors.password} autoComplete="current-password" />
        <Button type="submit" size="lg" busy={busy === 'form'} disabled={!!busy} className="mt-2 w-full">
          Log in
        </Button>
      </form>

      <p className="mt-8 text-[15px]">
        Don’t have an account?{' '}
        <Link to="/signup" className="font-semibold text-teal-ink underline underline-offset-4">
          Create one
        </Link>
      </p>
    </AuthShell>
  )
}

export function Signup() {
  const { user, register } = useSession()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().split(/\s+/).length < 2) next.name = 'Enter your first and last name so other members recognise you.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email address, like name@example.org.'
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirm !== password) next.confirm = 'The two passwords do not match.'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    setFormError(null)
    try {
      await register(name, email, password)
      navigate('/start')
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(err.fields)
      setFormError(errorMessage(err))
      setBusy(false)
    }
  }

  if (user) return <Navigate to="/app" replace />

  return (
    <AuthShell title="Create your account" subtitle="Then set up your community’s shared wallet.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        {formError && <Notice tone="bad" title="Could not create the account">{formError}</Notice>}
        <TextField label="Full name" autoComplete="name" placeholder="e.g. Wanjiru Kamau" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <TextField label="Email address" type="email" autoComplete="email" placeholder="you@example.org" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <PasswordField value={password} onChange={setPassword} error={errors.password} autoComplete="new-password" />
        <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} error={errors.confirm} autoComplete="new-password" />
        <p className="text-sm text-muted">
          This password protects your CommunitySafe account only. It is not a Bitcoin key, and CommunitySafe will never ask for your wallet’s recovery words.
        </p>
        <Button type="submit" size="lg" busy={busy} className="mt-1 w-full">
          Create account
        </Button>
      </form>
      <p className="mt-8 text-[15px]">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-teal-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthShell>
  )
}
