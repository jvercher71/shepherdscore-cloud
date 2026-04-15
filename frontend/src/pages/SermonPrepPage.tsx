import { useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

const STYLES = [
  { value: 'expository', label: 'Expository', desc: 'Verse-by-verse through a passage' },
  { value: 'topical', label: 'Topical', desc: 'Organized around a theme or topic' },
  { value: 'narrative', label: 'Narrative', desc: 'Story-driven with application' },
  { value: 'devotional', label: 'Devotional', desc: 'Shorter, reflection-focused' },
]

export default function SermonPrepPage() {
  const [scripture, setScripture] = useState('')
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [style, setStyle] = useState('expository')
  const [outline, setOutline] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const generate = async () => {
    if (!scripture.trim() && !topic.trim()) {
      setError('Please provide at least a scripture reference or topic')
      return
    }
    setLoading(true)
    setError('')
    setOutline('')
    setCopied(false)
    try {
      const res = await api.post<{ outline: string }>('/ai/sermon-prep', {
        scripture: scripture.trim(),
        topic: topic.trim(),
        notes: notes.trim(),
        style,
      })
      setOutline(res.outline)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate outline')
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(outline)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>AI Sermon Prep</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Get a head start on sermon preparation. Provide a scripture passage and/or topic, choose a preaching style,
        and AI will generate a detailed outline with main points, illustrations, and discussion questions.
      </p>

      {error && <p className={styles.error}>{error}</p>}

      {/* Input Form */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className={styles.field}>
            <label>Scripture Passage</label>
            <input
              value={scripture}
              onChange={e => setScripture(e.target.value)}
              placeholder="e.g., John 3:16-21, Psalm 23, Romans 8:28-39"
            />
          </div>
          <div className={styles.field}>
            <label>Topic / Theme</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g., Grace, Forgiveness, Trusting God in hard times"
            />
          </div>
        </div>

        {/* Sermon Style Picker */}
        <div className={styles.field} style={{ marginBottom: 16 }}>
          <label>Preaching Style</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 4 }}>
            {STYLES.map(s => (
              <button
                key={s.value}
                onClick={() => setStyle(s.value)}
                style={{
                  background: style === s.value ? 'var(--color-accent)' : 'var(--color-bg)',
                  color: style === s.value ? '#fff' : 'var(--color-text)',
                  border: `1.5px solid ${style === s.value ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  borderRadius: 8, padding: '10px 12px', textAlign: 'left',
                  transition: 'all 0.15s', cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field} style={{ marginBottom: 20 }}>
          <label>Additional Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g., This is for Easter Sunday, congregation is mostly young families, tie in the church's mission trip..."
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>

        <button className={styles.addBtn} onClick={generate} disabled={loading}>
          {loading ? 'Generating sermon outline…' : 'Generate Outline'}
        </button>
      </div>

      {/* Outline Output */}
      {outline && (
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontWeight: 700, fontSize: 15 }}>
              Sermon Outline — {STYLES.find(s => s.value === style)?.label} Style
            </h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className={styles.secondaryBtn} onClick={copyToClipboard}>
                {copied ? 'Copied!' : 'Copy to Clipboard'}
              </button>
              <button className={styles.secondaryBtn} onClick={() => window.print()}>
                Print
              </button>
            </div>
          </div>
          <div style={{
            background: 'var(--color-bg)', borderRadius: 8, padding: '24px 28px',
            whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.8, color: 'var(--color-text)',
          }}>
            {outline}
          </div>
        </div>
      )}
    </div>
  )
}
