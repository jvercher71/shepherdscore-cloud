import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface DirectoryMember {
  id: string; first_name: string; last_name: string; preferred_name: string
  phone: string; cell_phone: string; email: string; address: string
  city: string; state: string; zip: string; status: string
}

export default function DirectoryPage() {
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get<DirectoryMember[]>('/directory')
      .then(setMembers)
      .catch(e => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setIsLoading(false))
  }, [])

  const filtered = members.filter(m =>
    `${m.first_name} ${m.last_name} ${m.preferred_name} ${m.email} ${m.phone}`.toLowerCase().includes(search.toLowerCase())
  )

  const formatAddress = (m: DirectoryMember) => {
    const parts = [m.address, m.city, m.state, m.zip].filter(Boolean)
    if (parts.length === 0) return '—'
    if (m.city && m.state) return `${m.address ? m.address + ', ' : ''}${m.city}, ${m.state} ${m.zip}`.trim()
    return parts.join(', ')
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Member Directory</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 16 }}>
        Active members sorted by last name. Use the print button to generate a printable directory.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <input className={styles.searchInput} placeholder="Search directory…" value={search} onChange={e => setSearch(e.target.value)} />
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{filtered.length} members</span>
          <button className={styles.secondaryBtn} onClick={() => window.print()}>Print Directory</button>
        </div>
        <table>
          <thead>
            <tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No members found'}</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>
                  {m.last_name}, {m.preferred_name || m.first_name}
                </td>
                <td>{m.phone || m.cell_phone || '—'}</td>
                <td>{m.email || '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatAddress(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
