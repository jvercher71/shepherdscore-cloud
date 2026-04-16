import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◻' },
  { to: '/smart-search', label: 'Smart Search', icon: '🔍' },
  { to: '/members', label: 'Members', icon: '👥' },
  { to: '/families', label: 'Families', icon: '🏠' },
  { to: '/attendance', label: 'Attendance', icon: '📋' },
  { to: '/giving', label: 'Giving', icon: '💰' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/groups', label: 'Groups', icon: '🏘' },
  { to: '/bible-study', label: 'Bible Study', icon: '📖' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/directory', label: 'Directory', icon: '📇' },
  { to: '/ai/insights', label: 'AI Insights', icon: '🧠' },
  { to: '/ai/comm-drafts', label: 'AI Drafts', icon: '✉' },
  { to: '/ai/sermon-prep', label: 'Sermon Prep', icon: '✝' },
  { to: '/staff', label: 'Manage Staff', icon: '👤' },
  { to: '/help', label: 'Help', icon: '?' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

interface ChurchInfo { name?: string; logo_url?: string }

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [church, setChurch] = useState<ChurchInfo>({})

  useEffect(() => {
    api.get<ChurchInfo>('/settings').then(setChurch).catch(() => {})
  }, [])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          {church.logo_url ? (
            <img src={church.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', marginBottom: 4 }} />
          ) : null}
          <span className={styles.logoText}>{church.name || 'ShepherdsCore'}</span>
          <span className={styles.logoTag}>Cloud</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.userFooter}>
          <span className={styles.userEmail}>{user?.email}</span>
          <button onClick={handleSignOut} className={styles.signOutBtn}>Sign Out</button>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
