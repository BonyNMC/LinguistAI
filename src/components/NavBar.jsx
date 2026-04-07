import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const navItems = [
  { to: '/conversation', icon: '💬',  label: 'Conversation' },
  { to: '/writing',      icon: '✍️',  label: 'Writing Space' },
  { to: '/study-list',   icon: '📚',  label: 'Study List' },
  { to: '/review',       icon: '🔁',  label: 'Review' },
  { to: '/leaderboard',  icon: '🏆',  label: 'Leaderboard' },
  { to: '/history',      icon: '🕘',  label: 'History' },
  { to: '/stats',        icon: '📊',  label: 'My Stats' },
  { to: '/settings',     icon: '⚙️',  label: 'Settings' },
]

// Load persisted theme on module init (before first render)
const savedTheme = localStorage.getItem('linguistai-theme')
if (savedTheme === 'light') document.body.classList.add('light-mode')

export default function NavBar() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLight, setIsLight] = useState(() => savedTheme === 'light')
  const [pendingCount, setPendingCount] = useState(0)

  const email   = session?.user?.email ?? ''
  const initial = email.charAt(0).toUpperCase()
  const isAdmin = profile?.role === 'admin'

  // Fetch pending user count for admin notification badge
  useEffect(() => {
    if (!isAdmin) return

    async function fetchPending() {
      const { count } = await supabase
        .from('user_profiles')
        .select('id', { count: 'exact', head: true })
        .eq('account_status', 'pending')
      setPendingCount(count ?? 0)
    }

    fetchPending()

    // Realtime: update badge when user_profiles change
    const channel = supabase
      .channel('navbar-pending-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => { fetchPending() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isAdmin])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  function closeMenu() { setMobileOpen(false) }

  function toggleTheme() {
    const next = !isLight
    setIsLight(next)
    if (next) {
      document.body.classList.add('light-mode')
      localStorage.setItem('linguistai-theme', 'light')
    } else {
      document.body.classList.remove('light-mode')
      localStorage.setItem('linguistai-theme', 'dark')
    }
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <a className="sidebar-brand" href="/conversation" style={{ textDecoration: 'none' }}>
          <div className="sidebar-brand-icon">🧠</div>
          <span className="sidebar-brand-text">LinguistAI</span>
        </a>
        <button
          className="hamburger-btn"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={closeMenu} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        {/* Brand */}
        <a className="sidebar-brand" href="/conversation">
          <div className="sidebar-brand-icon">🧠</div>
          <span className="sidebar-brand-text">LinguistAI</span>
        </a>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="section-title">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Admin link with notification badge */}
          {isAdmin && (
            <>
              <div className="section-title" style={{ marginTop: '1rem' }}>Admin</div>
              <NavLink
                to="/admin"
                onClick={closeMenu}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-item-icon">🛡️</span>
                Dashboard
                {pendingCount > 0 && (
                  <span className="nav-badge">{pendingCount > 99 ? '99+' : pendingCount}</span>
                )}
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div className="user-email">{email}</div>
              {isAdmin && <div style={{ fontSize: '0.65rem', color: 'var(--clr-accent)', marginTop: 1 }}>Administrator</div>}
            </div>
          </div>

          {/* Theme toggle */}
          <button className="theme-toggle-btn" onClick={toggleTheme}>
            <span>{isLight ? '☀️' : '🌙'}</span>
            {isLight ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button className="nav-item btn-ghost" onClick={handleSignOut} style={{ marginTop: 4 }}>
            <span className="nav-item-icon">🚪</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
