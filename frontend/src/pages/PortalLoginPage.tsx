import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './LoginPage.module.css'

export default function PortalLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${API_BASE}/portal/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Request failed')
      
      setMessage(data.message || 'Verification code sent!')
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request login code')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${API_BASE}/portal/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Verification failed')
      
      localStorage.setItem('shepherdscore_portal_token', data.token)
      localStorage.setItem('shepherdscore_portal_member_id', data.member_id)
      navigate('/portal')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code, please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card} style={{ maxWidth: 420 }}>
        <div className={styles.header}>
          <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
        </div>
        <div className={styles.tagRow}>
          <span className={styles.tag} style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>Member Portal</span>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestCode} className={styles.form}>
            <p className={styles.subtitle} style={{ marginBottom: 16 }}>
              Enter your email address to receive a secure login code.
            </p>
            <div className={styles.field}>
              <label htmlFor="email">Your Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="office@yourchurch.org"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Sending code…' : 'Send Verification Code'}
            </button>
            <p className={styles.toggle} style={{ marginTop: 24 }}>
              Are you a church leader? <button type="button" onClick={() => navigate('/login')} className={styles.toggleBtn}>Sign in to Admin Dashboard</button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className={styles.form}>
            <p className={styles.subtitle} style={{ marginBottom: 16 }}>
              We sent a verification code to <strong>{email}</strong>. Enter it below to access the portal.
            </p>
            {message && <p style={{ fontSize: 13, color: '#16a34a', background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>{message}</p>}
            <div className={styles.field}>
              <label htmlFor="code">6-Digit Verification PIN</label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. 123456"
                maxLength={6}
                required
                autoFocus
              />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? 'Verifying…' : 'Verify Code & Sign In'}
            </button>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', marginTop: 16 }}>
              <button type="button" onClick={() => setStep(1)} className={styles.toggleBtn} style={{ fontSize: 13 }}>
                ← Change Email
              </button>
              <button type="button" onClick={handleRequestCode} className={styles.toggleBtn} style={{ fontSize: 13 }}>
                Resend PIN
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
