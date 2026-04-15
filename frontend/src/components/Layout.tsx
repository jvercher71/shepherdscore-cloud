import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './Layout.module.css'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '◻' },
  { to: '/members', label: 'Members', icon: '👥' },
  { to: '/families', label: 'Families', icon: '🏠' },
  { to: '/giving', label: 'Giving', icon: '💰' },
  { to: '/events', label: 'Events', icon: '📅' },
  { to: '/groups', label: 'Groups', icon: '🏘' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/ai/insights', label: 'AI Insights', icon: '🧠' },
  { to: '/ai/comm-drafts', label: 'AI Drafts', icon: '✉' },
  { to: '/ai/sermon-prep', label: 'AI Sermon Prep', icon: '📖' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <span className={styles.logoText}>ShepherdsCore</span>
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
