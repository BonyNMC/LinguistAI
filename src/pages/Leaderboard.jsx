import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const TABS = [
  { key: 'words_mastered',       label: '🏆 Most Mastered',  desc: 'Words fully mastered (mastery ≥ 80)' },
  { key: 'total_activity_count', label: '✍️ Most Active',    desc: 'Writing + conversation sessions' },
  { key: 'total_mastery_points', label: '⚡ Mastery Score',  desc: 'Total mastery points across all words' },
  { key: 'current_streak',       label: '🔥 Best Streak',    desc: 'Current consecutive learning-day streak' },
]

const RANK_ICONS = { 0: '🥇', 1: '🥈', 2: '🥉' }
const CEFR_COLORS = { A1:'#6ee7b7', A2:'#34d399', B1:'#60a5fa', B2:'#818cf8', C1:'#c084fc', C2:'#f472b6' }
const GRID = '48px 1fr 72px 72px 72px 72px'

export default function Leaderboard() {
  const { session } = useAuth()
  const [tab, setTab]         = useState('words_mastered')
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => { fetchLeaderboard() }, [])

  async function fetchLeaderboard() {
    setLoading(true); setError('')
    const { data, error: e } = await supabase.rpc('get_leaderboard')
    if (e) { setError(e.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  const sorted = [...rows].sort((a, b) => (b[tab] ?? 0) - (a[tab] ?? 0))
  const myUserId = session?.user?.id

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">Healthy competition among learners. Every point is earned through real study.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchLeaderboard} id="refresh-leaderboard-btn" style={{ marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Sort tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key} id={`tab-${t.key}`}
            onClick={() => setTab(t.key)}
            style={{
              padding: 'var(--space-2) var(--space-4)', borderRadius: 'var(--radius-md)',
              border: tab === t.key ? '2px solid var(--clr-accent)' : '1px solid var(--clr-border)',
              background: tab === t.key ? 'rgba(99,102,241,0.12)' : 'var(--clr-bg-raised)',
              color: tab === t.key ? 'var(--clr-accent-light)' : 'var(--clr-text-secondary)',
              fontWeight: tab === t.key ? 700 : 400, fontSize: 'var(--font-size-sm)',
              cursor: 'pointer', transition: 'all .15s',
            }}
          >{t.label}</button>
        ))}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-5)' }}>
        {TABS.find(t => t.key === tab)?.desc}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🏁</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>No data yet</div>
          <p style={{ color: 'var(--clr-text-secondary)' }}>Be the first! Start writing or reviewing to earn points.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: GRID,
            gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--clr-border)',
            fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 600,
          }}>
            <span style={{ textAlign: 'center' }}>#</span>
            <span>Learner</span>
            <span style={{ textAlign: 'right' }}>Mastered</span>
            <span style={{ textAlign: 'right' }}>Activity</span>
            <span style={{ textAlign: 'right' }}>Score</span>
            <span style={{ textAlign: 'right' }}>🔥 Streak</span>
          </div>

          {sorted.map((row, idx) => {
            const isMe = row.user_id === myUserId
            const cefrColor = CEFR_COLORS[row.cefr_detected] || 'var(--clr-accent)'
            const hl = (key) => ({
              textAlign: 'right', fontSize: 'var(--font-size-sm)',
              fontWeight: tab === key ? 800 : 400,
              color: tab === key ? 'var(--clr-accent-light)' : 'var(--clr-text-secondary)',
            })
            return (
              <div key={row.user_id} id={`leaderboard-row-${idx}`} style={{
                display: 'grid', gridTemplateColumns: GRID,
                gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)',
                alignItems: 'center', borderBottom: '1px solid var(--clr-border)',
                background: isMe ? 'rgba(99,102,241,0.08)' : 'transparent',
                transition: 'background .15s',
              }}>
                {/* Rank */}
                <div style={{ textAlign: 'center', fontSize: idx < 3 ? 22 : 'var(--font-size-sm)', fontWeight: 700, color: 'var(--clr-text-muted)' }}>
                  {RANK_ICONS[idx] ?? (idx + 1)}
                </div>

                {/* Name + CEFR */}
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <div style={{ fontWeight: isMe ? 700 : 500, color: isMe ? 'var(--clr-accent-light)' : 'var(--clr-text-primary)', fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.username}</span>
                    {isMe && <span className="badge badge-accent" style={{ fontSize: 9, flexShrink: 0 }}>You</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                    {row.cefr_detected && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, color: '#fff', background: cefrColor }}>
                        {row.cefr_detected}
                      </span>
                    )}
                    {row.target_level && (
                      <span style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>Target: {row.target_level}</span>
                    )}
                  </div>
                </div>

                <div style={hl('words_mastered')}>{row.words_mastered ?? 0}</div>
                <div style={hl('total_activity_count')}>{row.total_activity_count ?? 0}</div>
                <div style={hl('total_mastery_points')}>{row.total_mastery_points ?? 0}</div>

                {/* Streak */}
                <div style={{ ...hl('current_streak'), display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                  {(row.current_streak ?? 0) > 0 && <span style={{ fontSize: 14 }}>🔥</span>}
                  {row.current_streak ?? 0}
                  <span style={{ fontSize: 9, color: 'var(--clr-text-muted)', marginLeft: 1 }}>d</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 'var(--space-5)', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', textAlign: 'center', lineHeight: 1.8 }}>
        🔒 Your display name can be changed in <a href="/settings" style={{ color: 'var(--clr-accent-light)' }}>Settings</a>.
        You can also opt out of the leaderboard there.
      </div>
    </div>
  )
}
