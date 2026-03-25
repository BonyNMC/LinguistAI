import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import NavBar from '../components/NavBar.jsx'

const STATUS_OPTIONS = ['pending', 'active', 'suspended']

const STATUS_BADGE = {
  pending:   { label: 'Pending',   cls: 'badge-pending' },
  active:    { label: 'Active',    cls: 'badge-active' },
  suspended: { label: 'Suspended', cls: 'badge-suspended' },
}

export default function AdminDashboard() {
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [updating, setUpdating] = useState({}) // { [userId]: true }

  async function loadUsers() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('user_profiles')
      .select('id, role, account_status, created_at')
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      const enriched = await enrichWithEmails(data ?? [])
      setUsers(enriched)
    }
    setLoading(false)
  }

  async function enrichWithEmails(profiles) {
    try {
      const { data, error } = await supabase.rpc('admin_get_user_emails')
      if (error || !data) return profiles
      const emailMap = {}
      data.forEach(row => { emailMap[row.id] = row.email })
      return profiles.map(p => ({ ...p, email: emailMap[p.id] ?? null }))
    } catch {
      return profiles
    }
  }

  async function handleStatusChange(userId, newStatus) {
    setUpdating(prev => ({ ...prev, [userId]: true }))
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ account_status: newStatus })
      .eq('id', userId)

    if (err) {
      alert('Error updating status: ' + err.message)
    } else {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, account_status: newStatus } : u
      ))
    }
    setUpdating(prev => ({ ...prev, [userId]: false }))
  }

  useEffect(() => {
    loadUsers()

    // Realtime: reload when a new user is inserted
    const channel = supabase
      .channel('admin-user-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => { loadUsers() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function shortId(id) {
    return id ? id.slice(0, 8) + '…' : '—'
  }

  const totalUsers   = users.length
  const activeUsers  = users.filter(u => u.account_status === 'active').length
  const pendingUsers = users.filter(u => u.account_status === 'pending').length

  return (
    <div className="admin-wrapper">
      <NavBar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Admin Dashboard</h1>
            <p className="admin-subtitle">Manage user access and account status</p>
          </div>
          <button className="btn-refresh" onClick={loadUsers} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '↻ Refresh'}
          </button>
        </div>

        {/* Pending notification banner */}
        {pendingUsers > 0 && (
          <div className="admin-pending-banner">
            <span>🔔</span>
            <span>
              <strong>{pendingUsers} user{pendingUsers !== 1 ? 's' : ''}</strong> awaiting
              activation — scroll down to change their status to <em>Active</em>.
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="admin-stats">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{totalUsers}</div>
            <div className="admin-stat-label">Total Users</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{activeUsers}</div>
            <div className="admin-stat-label">Active</div>
          </div>
          <div className={`admin-stat-card${pendingUsers > 0 ? ' stat-pending' : ''}`}>
            <div className={`admin-stat-value${pendingUsers > 0 ? ' stat-warning' : ''}`}>{pendingUsers}</div>
            <div className="admin-stat-label">⏳ Pending Activation</div>
          </div>
        </div>

        {error && (
          <div className="admin-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && !users.length ? (
          <div className="admin-skeleton-wrapper">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email / ID</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Change Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                      No users found.
                    </td>
                  </tr>
                )}
                {users.map(user => {
                  const badge = STATUS_BADGE[user.account_status] ?? STATUS_BADGE.pending
                  return (
                    <tr key={user.id}>
                      <td className="admin-td-email">
                        {user.email
                          ? <><span className="user-email">{user.email}</span><span className="user-id">{shortId(user.id)}</span></>
                          : <span className="user-id-only" title={user.id}>{shortId(user.id)}</span>
                        }
                      </td>
                      <td>
                        <span className={`role-badge ${user.role === 'admin' ? 'role-admin' : 'role-student'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="admin-td-date">{formatDate(user.created_at)}</td>
                      <td>
                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td>
                        {user.role !== 'admin' ? (
                          <select
                            className="status-select"
                            value={user.account_status}
                            disabled={!!updating[user.id]}
                            onChange={e => handleStatusChange(user.id, e.target.value)}
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>Protected</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="admin-count">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
          </div>
        )}
      </main>
    </div>
  )
}
