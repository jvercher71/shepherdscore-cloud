import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import styles from './LoginPage.module.css'

export default function OnboardingPage() {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  const [churchName, setChurchName] = useState('')
  const [pastorName, setPastorName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/churches', { church_name: churchName, pastor_name: pastorName })
      await refreshSession()
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>ShepherdsCore</h1>
          <span className={styles.tag}>Cloud</span>
        </div>
        <p className={styles.subtitle}>Set up your church</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="churchName">Church Name</label>
            <input
              id="churchName"
              type="text"
              value={churchName}
              onChange={e => setChurchName(e.target.value)}
              placeholder="Grace Community Church"
              required
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="pastorName">Pastor Name <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
            <input
              id="pastorName"
              type="text"
              value={pastorName}
              onChange={e => setPastorName(e.target.value)}
              placeholder="Pastor John Smith"
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.submitBtn} disabled={loading}>
            {loading ? 'Setting up…' : 'Get Started'}
          </button>
        </form>
      </div>
    </div>
  )
}
