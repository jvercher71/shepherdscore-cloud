import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
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
  { to: '/billing', label: 'Billing', icon: '💳' },
  { to: '/help', label: 'Help', icon: '?' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

interface ChurchInfo { name?: string; logo_url?: string }

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [church, setChurch] = useState<ChurchInfo>({})
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    api.get<ChurchInfo>('/settings').then(setChurch).catch(() => {})
  }, [])

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      {/* Mobile top bar */}
      <header className={styles.topbar}>
        <button className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <span className={styles.topbarTitle}>{church.name || 'ShepherdsCore'}</span>
      </header>

      {/* Overlay for mobile */}
      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          {church.logo_url ? (
            <img src={church.logo_url} alt={church.name || 'Church'} className={styles.brandLogo} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
          )}
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
          <a href="https://VercherTechnologies.one" target="_blank" rel="noopener noreferrer" className={styles.credit}>
            Brought to you by<br /><strong>VercherTechnologies.one</strong>
          </a>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
