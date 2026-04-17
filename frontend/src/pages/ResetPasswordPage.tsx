import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './LoginPage.module.css'

export default function ResetPasswordPage() {
  const { clearPasswordRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true); setError('')
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
      clearPasswordRecovery()
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.header}>
            <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
          </div>
          <p className={styles.subtitle}>Password updated!</p>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Your password has been changed successfully. Redirecting to dashboard…
          </p>
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
        <p className={styles.subtitle}>Set your new password</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="new-password">New Password</label>
            <input id="new-password" type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={8}
              autoComplete="new-password" />
            {password.length > 0 && password.length < 8 && (
              <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4 }}>
                Must be at least 8 characters
              </span>
            )}
          </div>
          <div className={styles.field}>
            <label htmlFor="confirm-password">Confirm Password</label>
            <input id="confirm-password" type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required minLength={8}
              autoComplete="new-password" />
            {confirm.length > 0 && password !== confirm && (
              <span style={{ fontSize: 11, color: 'var(--color-danger)', marginTop: 4 }}>
                Passwords do not match
              </span>
            )}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={loading || password.length < 8 || password !== confirm}>
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
