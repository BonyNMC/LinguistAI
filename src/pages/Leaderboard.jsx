import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const TABS = [
  { key: 'overall_score',        label: '🏆 Overall Ranking',desc: 'Total balanced score across all activities' },
  { key: 'words_mastered',       label: '🌟 Most Mastered',  desc: 'Words fully mastered (mastery ≥ 80)' },
  { key: 'total_activity_count', label: '✍️ Most Active',    desc: 'Writing + conversation sessions' },
  { key: 'total_mastery_points', label: '⚡ Mastery Score',  desc: 'Total mastery points across all words' },
  { key: 'current_streak',       label: '🔥 Best Streak',    desc: 'Current consecutive learning-day streak' },
]

const TIME_FILTERS = [
  { key: 'all_time',   label: '🌍 All Time' },
  { key: 'this_month', label: '📅 This Month' },
  { key: 'this_week',  label: '📆 This Week' },
  { key: 'custom',     label: '⚙️ Custom' },
]

const RANK_ICONS = { 0: '🥇', 1: '🥈', 2: '🥉' }
const CEFR_COLORS = { A1:'#6ee7b7', A2:'#34d399', B1:'#60a5fa', B2:'#818cf8', C1:'#c084fc', C2:'#f472b6' }
const GRID = '48px 1fr 72px 72px 72px 88px 72px'

export default function Leaderboard() {
  const { session } = useAuth()
  const [tab, setTab]               = useState('overall_score')
  const [timeFilter, setTimeFilter] = useState('all_time')
  const [startDate, setStartDate]   = useState('')
  const [endDate, setEndDate]       = useState('')

  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => { 
    // Only fetch automatically if not custom, OR if both dates are selected
    if (timeFilter !== 'custom' || (startDate && endDate)) {
      fetchLeaderboard() 
    }
  }, [timeFilter, startDate, endDate])

  async function fetchLeaderboard() {
    setLoading(true); setError('')
    let p_start_date = '2000-01-01T00:00:00Z'
    let p_end_date = '2100-01-01T00:00:00Z'
    
    try {
      const now = new Date()
      if (timeFilter === 'this_week') {
        const day = now.getDay()
        const diff = now.getDate() - day + (day === 0 ? -6 : 1) // adjust for Monday
        const monday = new Date(now.setDate(diff))
        monday.setHours(0,0,0,0)
        p_start_date = monday.toISOString()
      } else if (timeFilter === 'this_month') {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        p_start_date = firstDay.toISOString()
      } else if (timeFilter === 'custom') {
        p_start_date = new Date(startDate).toISOString()
        const end = new Date(endDate)
        end.setHours(23, 59, 59, 999)
        p_end_date = end.toISOString()
      }
    } catch (err) {
       // user might be halfway typing a date, ignore
       setLoading(false)
       return
    }

    const { data, error: e } = await supabase.rpc('get_leaderboard', { p_start_date, p_end_date })
    if (e) { setError(e.message); setLoading(false); return }
    setRows(data || [])
    setLoading(false)
  }

  const sorted = [...rows].sort((a, b) => (b[tab] ?? 0) - (a[tab] ?? 0))
  const myUserId = session?.user?.id

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: 'var(--space-3)' }}>
        <div className="page-header-text">
          <h1 className="page-title">Leaderboard</h1>
          <p className="page-subtitle">Healthy competition among learners. Every point is earned through real study.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchLeaderboard} id="refresh-leaderboard-btn" style={{ marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Time Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: timeFilter === 'custom' ? 'var(--space-2)' : 'var(--space-4)' }}>
        {TIME_FILTERS.map(tf => (
          <button
            key={tf.key}
            onClick={() => { setTimeFilter(tf.key); if(tf.key !== 'custom'){ setStartDate(''); setEndDate('') } }}
            className={`btn btn-sm ${timeFilter === tf.key ? 'btn-primary' : 'btn-ghost'}`}
            style={{ borderRadius: 99 }}
          >
            {tf.label}
          </button>
        ))}
      </div>
      
      {/* Custom Date Inputs */}
      {timeFilter === 'custom' && (
         <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', alignItems: 'center' }}>
            <input type="date" className="form-input" style={{ width: 'auto', padding: '6px 12px' }} value={startDate} onChange={e => setStartDate(e.target.value)} />
            <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--font-size-sm)' }}>to</span>
            <input type="date" className="form-input" style={{ width: 'auto', padding: '6px 12px' }} value={endDate} onChange={e => setEndDate(e.target.value)} />
         </div>
      )}

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
      
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: tab === 'overall_score' ? 'var(--space-3)' : 'var(--space-5)' }}>
        {TABS.find(t => t.key === tab)?.desc}
      </div>
      
      {/* Formula Explanation */}
      {tab === 'overall_score' && (
        <div style={{ 
          background: 'rgba(99,102,241,0.08)', border: '1px solid var(--clr-border)', 
          borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', 
          marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          💡 <strong style={{ color: 'var(--clr-accent-light)' }}>Score Formula:</strong>
          <span style={{ padding: '2px 6px', background: 'var(--clr-bg-raised)', borderRadius: 4, fontSize: 11 }}>(Mastered × 100)</span> + 
          <span style={{ padding: '2px 6px', background: 'var(--clr-bg-raised)', borderRadius: 4, fontSize: 11 }}>(Activity × 20)</span> + 
          <span style={{ padding: '2px 6px', background: 'var(--clr-bg-raised)', borderRadius: 4, fontSize: 11 }}>(Streak × 10)</span> + 
          <span style={{ padding: '2px 6px', background: 'var(--clr-bg-raised)', borderRadius: 4, fontSize: 11 }}>Mastery Points</span>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
        </div>
      ) : sorted.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🏁</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>No data yet</div>
          <p style={{ color: 'var(--clr-text-secondary)' }}>No statistics found for this time period.</p>
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
            <span style={{ textAlign: 'right', color: tab === 'overall_score' ? 'var(--clr-accent-light)' : 'inherit' }}>Overall</span>
            <span style={{ textAlign: 'right', color: tab === 'words_mastered' ? 'var(--clr-accent-light)' : 'inherit' }}>Mastered</span>
            <span style={{ textAlign: 'right', color: tab === 'total_activity_count' ? 'var(--clr-accent-light)' : 'inherit' }}>Activity</span>
            <span style={{ textAlign: 'right', color: tab === 'total_mastery_points' ? 'var(--clr-accent-light)' : 'inherit' }}>M. Score</span>
            <span style={{ textAlign: 'right', color: tab === 'current_streak' ? 'var(--clr-accent-light)' : 'inherit' }}>🔥 Streak</span>
          </div>

          {sorted.map((row, idx) => {
            const isMe = row.user_id === myUserId
            const cefrColor = CEFR_COLORS[row.cefr_detected] || 'var(--clr-accent)'
            const hl = (key) => ({
              textAlign: 'right', fontSize: 'var(--font-size-sm)',
              fontWeight: tab === key ? 800 : 500,
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
                
                <div style={{ ...hl('overall_score'), fontWeight: 800 }}>{row.overall_score ?? 0}</div>
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

      <div style={{ marginTop: 'var(--space-6)', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', textAlign: 'center', lineHeight: 1.8 }}>
        🔒 Your display name can be changed in <a href="/settings" style={{ color: 'var(--clr-accent-light)' }}>Settings</a>.
        You can also opt out of the leaderboard there.
      </div>
    </div>
  )
}
