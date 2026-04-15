import { useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

const DRAFT_TYPES = [
  { value: 'announcement', label: 'Church Announcement' },
  { value: 'event_promo', label: 'Event Promotion' },
  { value: 'welcome_email', label: 'Welcome Email (New Member)' },
  { value: 'thank_you', label: 'Thank You Note (Donor/Volunteer)' },
  { value: 'newsletter', label: 'Newsletter Section' },
]

const TONES = [
  { value: 'warm', label: 'Warm & Friendly' },
  { value: 'formal', label: 'Formal' },
  { value: 'casual', label: 'Casual' },
]

export default function CommDraftsPage() {
  const [draftType, setDraftType] = useState('announcement')
  const [context, setContext] = useState('')
  const [tone, setTone] = useState('warm')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!context.trim()) { setError('Please provide some details or context'); return }
    setLoading(true)
    setError('')
    setDraft('')
    setCopied(false)
    try {
      const res = await api.post<{ draft: string }>('/ai/communication-draft', {
        draft_type: draftType,
        context: context.trim(),
        tone,
      })
      setDraft(res.draft)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate draft')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>AI Communication Drafts</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Generate church announcements, event promotions, welcome emails, thank-you notes, and newsletters with AI.
        Provide context and let AI draft it for you.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {/* Input Form */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className={styles.field}>
            <label>Type</label>
            <select value={draftType} onChange={e => setDraftType(e.target.value)}>
              {DRAFT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label>Tone</label>
            <select value={tone} onChange={e => setTone(e.target.value)}>
              {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.field} style={{ marginBottom: 20 }}>
          <label>Details & Context</label>
          <textarea
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder={
              draftType === 'announcement' ? 'e.g., We are launching a new youth program starting next Sunday...' :
              draftType === 'event_promo' ? 'e.g., Annual church picnic on July 4th at Riverside Park, bring a dish to share...' :
              draftType === 'welcome_email' ? "e.g., New member John Smith joined this week, he's interested in the music ministry..." :
              draftType === 'thank_you' ? 'e.g., Sarah volunteered for 3 months at the food pantry every Saturday...' :
              'e.g., Updates on the building fund, upcoming mission trip, and new Bible study group...'
            }
            rows={4}
            style={{ resize: 'vertical' }}
          />
        </div>
        <button className={styles.addBtn} onClick={generate} disabled={loading}>
          {loading ? 'Generating draft…' : 'Generate Draft'}
        </button>
      </div>

      {/* Draft Output */}
      {draft && (
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15 }}>
              Generated {DRAFT_TYPES.find(t => t.value === draftType)?.label}
            </h3>
            <button className={styles.secondaryBtn} onClick={copyToClipboard}>
              {copied ? 'Copied!' : 'Copy to Clipboard'}
            </button>
          </div>
          <div style={{
            background: 'var(--color-bg)', borderRadius: 8, padding: '20px 24px',
            whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, color: 'var(--color-text)',
          }}>
            {draft}
          </div>
        </div>
      )}
    </div>
  )
}
