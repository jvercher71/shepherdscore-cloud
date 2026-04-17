import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup' | 'check-email' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
        navigate('/')
      } else if (mode === 'signup') {
        await signUp(email, password)
        setMode('check-email')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg.toLowerCase().includes('email not confirmed')) {
        setMode('check-email')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Please enter your email address'); return }
    setLoading(true); setError('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/login',
      })
      if (resetError) throw resetError
      setResetSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'check-email') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
          </div>
          <p className={styles.subtitle}>Check your email</p>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
            We sent a confirmation link to <strong>{email}</strong>.
            Click it to activate your account, then come back here to sign in.
          </p>
          <button className={styles.submitBtn} onClick={() => { setMode('login'); setError('') }}>
            Back to Sign In
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'forgot') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
          </div>
          <p className={styles.subtitle}>Reset your password</p>
          {resetSent ? (
            <>
              <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
                If an account exists for <strong>{email}</strong>, we've sent a password reset link.
                Check your inbox and follow the instructions.
              </p>
              <button className={styles.submitBtn} onClick={() => { setMode('login'); setResetSent(false); setError('') }}>
                Back to Sign In
              </button>
            </>
          ) : (
            <form onSubmit={handleForgotPassword} className={styles.form}>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <div className={styles.field}>
                <label htmlFor="reset-email">Email</label>
                <input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pastor@church.org" required autoComplete="email" />
              </div>
              {error && <p className={styles.error}>{error}</p>}
              <button type="submit" className={styles.submitBtn} disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <p className={styles.toggle}>
                <button type="button" onClick={() => { setMode('login'); setError('') }} className={styles.toggleBtn}>Back to Sign In</button>
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
        </div>
        <div className={styles.tagRow}>
          <span className={styles.tag}>Cloud</span>
        </div>
        <p className={styles.subtitle}>
          {mode === 'login' ? 'Sign in to your church account' : 'Create your church account'}
        </p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="pastor@church.org" required autoComplete="email" />
          </div>
          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' ? 8 : undefined} />
            {mode === 'signup' && password.length > 0 && password.length < 8 && (
              <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4 }}>Password must be at least 8 characters</span>
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        {mode === 'login' && (
          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={() => { setMode('forgot'); setError('') }} className={styles.toggleBtn}>Forgot password?</button>
          </p>
        )}
        <p className={styles.toggle}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }} className={styles.toggleBtn}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
