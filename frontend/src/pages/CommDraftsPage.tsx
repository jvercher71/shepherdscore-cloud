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
  const [refining, setRefining] = useState(false)
  const [refineInstruction, setRefineInstruction] = useState('')
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

  const refine = async () => {
    if (!draft.trim()) return
    if (!refineInstruction.trim()) { setError('Tell AI what to change (e.g. "shorten", "more casual", "add a call to RSVP")'); return }
    setRefining(true)
    setError('')
    setCopied(false)
    try {
      const res = await api.post<{ draft: string }>('/ai/communication-draft/refine', {
        draft_type: draftType,
        tone,
        current_draft: draft,
        instruction: refineInstruction.trim(),
      })
      setDraft(res.draft)
      setRefineInstruction('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refine draft')
    } finally {
      setRefining(false)
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
        Write your own, edit the AI draft directly, or ask AI to refine it.
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={styles.addBtn} onClick={generate} disabled={loading}>
            {loading ? 'Generating draft…' : 'Generate Draft'}
          </button>
          {!draft && !loading && (
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => setDraft(context.trim())}
              disabled={!context.trim()}
              title="Skip AI and edit your own draft below"
            >
              Write My Own
            </button>
          )}
        </div>
      </div>

      {/* Draft Output — editable */}
      {draft !== '' && (
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15 }}>
              {DRAFT_TYPES.find(t => t.value === draftType)?.label} — edit freely
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.secondaryBtn} onClick={copyToClipboard}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={16}
            style={{
              width: '100%', background: 'var(--color-bg)', border: '1px solid var(--color-border)',
              borderRadius: 8, padding: '16px 20px', fontSize: 14, lineHeight: 1.8,
              color: 'var(--color-text)', fontFamily: 'inherit', resize: 'vertical',
            }}
          />

          {/* Refine */}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Refine with AI
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                value={refineInstruction}
                onChange={e => setRefineInstruction(e.target.value)}
                placeholder='e.g. "shorten to one paragraph", "make it more casual", "add a call to RSVP"'
                onKeyDown={e => { if (e.key === 'Enter' && !refining) refine() }}
                style={{
                  flex: '1 1 280px', border: '1.5px solid var(--color-border)', borderRadius: 8,
                  padding: '10px 12px', fontSize: 14,
                }}
              />
              <button className={styles.addBtn} onClick={refine} disabled={refining || !draft.trim()}>
                {refining ? 'Refining…' : 'Refine with AI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
