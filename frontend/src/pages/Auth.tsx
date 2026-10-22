import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '../api/errors'
import { Icon, Logo } from '../components/Icon'
import { PrototypeBanner } from '../components/PrototypeBanner'
import { Button, Notice, TextField } from '../components/ui'
import { useSession } from '../context/SessionContext'

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <PrototypeBanner />
      <div className="flex flex-1">
        <div
          className="hidden w-40 shrink-0 bg-cover bg-center md:block lg:w-72"
          style={{ backgroundImage: `url(${import.meta.env.BASE_URL}hero.jpg)` }}
          aria-hidden="true"
        />
        <main className="flex flex-1 justify-center px-5 py-10 sm:px-10 md:justify-start md:pl-16 lg:pl-28">
          <div className="w-full max-w-md">
            <Link to="/" className="inline-flex flex-col items-center gap-2">
              <Logo size={52} />
              <span className="text-2xl font-extrabold text-night">CommunitySafe</span>
            </Link>
            <h1 className="mt-12 text-3xl font-extrabold">{title}</h1>
            <p className="mt-1.5 text-[16px] text-ink-soft">{subtitle}</p>
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

const DEMO_ACCOUNTS = [
  { label: 'Administrator', who: 'Martha Ngendo', email: 'martha.ngendo@example.org' },
  { label: 'Signer', who: 'Sharnie Essy', email: 'sharnie.essy@example.org' },
  { label: 'Member', who: 'Linder Stacy', email: 'linder.stacy@example.org' },
]

export function Login() {
  const { login } = useSession()
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

      <div className="mt-8 border border-line bg-paper p-5">
        <p className="text-sm font-bold">Demo accounts</p>
        <p className="mt-1 text-sm text-muted">Any email and password work in this prototype. Unknown emails sign in as the administrator. Or pick a role:</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map((a) => (
            <Button key={a.email} variant="secondary" size="sm" busy={busy === a.email} disabled={!!busy} onClick={() => void signIn(a.email, 'demo', a.email)} className="h-auto flex-col items-start gap-0 py-2 text-left">
              <span>{a.label}</span>
              <span className="text-xs font-normal text-muted">{a.who}</span>
            </Button>
          ))}
        </div>
      </div>

      <p className="mt-8 text-[15px]">
        Don’t have an account?{' '}
        <Link to="/signup" className="font-semibold text-accent-ink underline underline-offset-4">
          Create one
        </Link>
      </p>
    </AuthShell>
  )
}

export function Signup() {
  const { register } = useSession()
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
    if (name.trim().length < 2) next.name = 'Enter your full name so other members recognise you.'
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
        <Link to="/login" className="font-semibold text-accent-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </AuthShell>
  )
}
