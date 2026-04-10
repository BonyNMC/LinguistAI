import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

// ── Helpers ───────────────────────────────────────────────────────
function dateStr(d) {
  return d.toISOString().slice(0, 10)
}
function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function startOfDay(dateStr) {
  return new Date(dateStr + 'T00:00:00')
}

// ── Activity Heatmap (GitHub-style, last 6 months) ────────────────
function ActivityHeatmap({ activityByDay }) {
  const today = new Date()
  const start = addDays(today, -181) // ~6 months back

  // Build list of all days
  const days = []
  let cur = new Date(start)
  while (cur <= today) {
    days.push(dateStr(cur))
    cur = addDays(cur, 1)
  }

  // Group into weeks (columns)
  // Pad start so first day aligns to correct weekday (0=Sun)
  const firstDow = startOfDay(days[0]).getDay()
  const paddedDays = [...Array(firstDow).fill(null), ...days]
  const weeks = []
  for (let i = 0; i < paddedDays.length; i += 7) {
    weeks.push(paddedDays.slice(i, i + 7))
  }

  // Month labels
  const monthLabels = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const firstReal = week.find(d => d !== null)
    if (!firstReal) return
    const m = startOfDay(firstReal).getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ wi, label: startOfDay(firstReal).toLocaleString('en', { month: 'short' }) })
      lastMonth = m
    }
  })

  function cellColor(day) {
    if (!day) return 'transparent'
    const count = activityByDay[day] || 0
    if (count === 0) return 'var(--clr-bg-elevated)'
    if (count === 1) return 'rgba(99,102,241,0.35)'
    if (count === 2) return 'rgba(99,102,241,0.6)'
    return 'rgba(99,102,241,0.9)'
  }

  const CELL = 13
  const GAP = 2

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Month labels */}
      <div style={{ display: 'flex', marginLeft: 2, marginBottom: 4 }}>
        {weeks.map((_, wi) => {
          const label = monthLabels.find(m => m.wi === wi)
          return (
            <div key={wi} style={{ width: CELL + GAP, flexShrink: 0, fontSize: 10, color: 'var(--clr-text-muted)' }}>
              {label ? label.label : ''}
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div style={{ display: 'flex', gap: GAP }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
            {week.map((day, di) => (
              <div
                key={di}
                title={day ? `${day}: ${activityByDay[day] || 0} activities` : ''}
                style={{
                  width: CELL, height: CELL,
                  borderRadius: 2,
                  background: cellColor(day),
                  border: day === dateStr(today) ? '1.5px solid var(--clr-accent)' : 'none',
                  cursor: day ? 'default' : 'default',
                  transition: 'background .1s',
                }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>Less</span>
        {['var(--clr-bg-elevated)', 'rgba(99,102,241,0.35)', 'rgba(99,102,241,0.6)', 'rgba(99,102,241,0.9)'].map((c, i) => (
          <div key={i} style={{ width: CELL, height: CELL, borderRadius: 2, background: c }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>More</span>
      </div>
    </div>
  )
}

// ── Daily Practice Line Chart (last 30 days, pure SVG) ────────────
function LineChart({ dataByDay }) {
  const W = 600, H = 140, PAD = { top: 12, right: 16, bottom: 32, left: 32 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // Build last 30 days
  const today = new Date()
  const days = Array.from({ length: 30 }, (_, i) => dateStr(addDays(today, i - 29)))
  const values = days.map(d => dataByDay[d] || 0)
  const maxVal = Math.max(...values, 1)

  const xScale = i => (i / (days.length - 1)) * innerW
  const yScale = v => innerH - (v / maxVal) * innerH

  const points = days.map((_, i) => [xScale(i), yScale(values[i])])
  const polyline = points.map(([x, y]) => `${x},${y}`).join(' ')

  // Fill area under the line
  const areaPath = [
    `M ${points[0][0]},${innerH}`,
    ...points.map(([x, y]) => `L ${x},${y}`),
    `L ${points[points.length - 1][0]},${innerH}`,
    'Z'
  ].join(' ')

  // X-axis labels: show every 5th day
  const xLabels = days.map((d, i) => ({ d, i })).filter(({ i }) => i % 5 === 0 || i === 29)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(99,102,241,0.4)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.0)" />
          </linearGradient>
        </defs>
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => (
            <line key={frac}
              x1={0} y1={innerH * frac} x2={innerW} y2={innerH * frac}
              stroke="var(--clr-border)" strokeWidth={0.5} strokeDasharray="3,3"
            />
          ))}
          {/* Area fill */}
          <path d={areaPath} fill="url(#chartGrad)" />
          {/* Line */}
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--clr-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Dots */}
          {points.map(([x, y], i) => values[i] > 0 && (
            <circle key={i} cx={x} cy={y} r={3}
              fill="var(--clr-accent)" stroke="var(--clr-bg-base)" strokeWidth={1.5}
            />
          ))}
          {/* X labels */}
          {xLabels.map(({ d, i }) => (
            <text key={i} x={xScale(i)} y={innerH + 18}
              textAnchor="middle" fontSize={9} fill="var(--clr-text-muted)"
            >
              {d.slice(5)} {/* MM-DD */}
            </text>
          ))}
          {/* Y labels */}
          {[0, Math.round(maxVal / 2), maxVal].map(v => (
            <text key={v} x={-4} y={yScale(v) + 3}
              textAnchor="end" fontSize={9} fill="var(--clr-text-muted)"
            >
              {v}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

// ── Main Stats Page ───────────────────────────────────────────────
export default function Stats() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [profile, setProfile] = useState(null)
  const [vocabStats, setVocabStats] = useState({ total: 0, mastered: 0, totalMastery: 0 })
  const [activityByDay, setActivityByDay] = useState({})
  const [practiceByDay, setPracticeByDay] = useState({})
  const [recentActivity, setRecentActivity] = useState([])
  const [errorPatterns, setErrorPatterns] = useState({ byType: {}, topErrors: [] })

  useEffect(() => { fetchStats() }, [])

  async function fetchStats() {
    setLoading(true)
    setError('')
    try {
      const uid = session.user.id

      // Fetch in parallel
      const [profRes, vocabRes, writingsRes, convsRes, reviewsRes] = await Promise.all([
        supabase.from('user_profiles')
          .select('current_streak, best_streak, cefr_detected, target_level')
          .eq('id', uid).single(),
        supabase.from('user_vocab_progress')
          .select('mastery_level, status, last_reviewed_at')
          .eq('user_id', uid),
        supabase.from('user_writings')
          .select('created_at, writing_analysed').eq('user_id', uid),
        supabase.from('conversation_sessions')
          .select('created_at, analysis').eq('user_id', uid),
        supabase.from('user_vocab_progress')
          .select('last_reviewed_at').eq('user_id', uid)
          .not('last_reviewed_at', 'is', null),
      ])

      if (profRes.error) throw profRes.error
      setProfile(profRes.data)

      // Vocab stats
      const vRows = vocabRes.data || []
      setVocabStats({
        total: vRows.length,
        mastered: vRows.filter(r => r.mastery_level >= 80).length,
        totalMastery: vRows.reduce((s, r) => s + (r.mastery_level || 0), 0),
      })

      // Build activity heatmap data (writings + analyzed conversations)
      const aByDay = {}
      ;(writingsRes.data || []).forEach(r => {
        const d = r.created_at?.slice(0, 10); if (d) aByDay[d] = (aByDay[d] || 0) + 1
      })
      ;(convsRes.data || []).filter(r => r.analysis).forEach(r => {
        const d = r.created_at?.slice(0, 10); if (d) aByDay[d] = (aByDay[d] || 0) + 1
      })
      setActivityByDay(aByDay)

      // Error Pattern Intelligence: aggregate from writings + conversations
      const byType = {}
      const errorMap = {}
      const collectErrors = (highlights) => {
        if (!Array.isArray(highlights)) return
        highlights.forEach((e) => {
          if (!e?.type) return
          byType[e.type] = (byType[e.type] || 0) + 1
          const key = `${e.original?.toLowerCase()}→${e.corrected?.toLowerCase()}`
          if (key && e.original && e.corrected) {
            if (!errorMap[key]) errorMap[key] = { count: 0, original: e.original, corrected: e.corrected }
            errorMap[key].count++
          }
        })
      }
      ;(writingsRes.data || []).forEach((r) => collectErrors(r.writing_analysed?.error_highlights))
      ;(convsRes.data || []).forEach((r) => collectErrors(r.analysis?.error_highlights))
      const topErrors = Object.values(errorMap).sort((a, b) => b.count - a.count).slice(0, 5)
      setErrorPatterns({ byType, topErrors })

      // Build daily practice chart (vocab reviews by day)
      const pByDay = {}
      ;(reviewsRes.data || []).forEach(r => {
        const d = r.last_reviewed_at?.slice(0, 10); if (d) pByDay[d] = (pByDay[d] || 0) + 1
      })
      // Also count writing/conversation days in practice
      Object.entries(aByDay).forEach(([d, n]) => {
        pByDay[d] = (pByDay[d] || 0) + n
      })
      setPracticeByDay(pByDay)

      // Recent activity feed (last 5 items combined)
      const feed = [
        ...(writingsRes.data || []).map(r => ({ type: 'writing', date: r.created_at })),
        ...(convsRes.data || []).filter(r => r.analysis).map(r => ({ type: 'conversation', date: r.created_at })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
      setRecentActivity(feed)

    } catch (e) {
      setError(e.message || 'Failed to load stats.')
    } finally {
      setLoading(false)
    }
  }

  const totalActivities = Object.values(activityByDay).reduce((s, v) => s + v, 0)

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">My Stats</h1>
          <p className="page-subtitle">Your personal learning analytics — private to you.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchStats} id="stats-refresh-btn" style={{ marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {/* ── Summary Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
            {[
              { icon: '🔥', label: 'Current Streak', value: `${profile?.current_streak ?? 0} days`, sub: `Best: ${profile?.best_streak ?? 0} days`, color: '#fb923c' },
              { icon: '📚', label: 'Words in List', value: vocabStats.total, sub: `${vocabStats.mastered} mastered`, color: '#60a5fa' },
              { icon: '⚡', label: 'Mastery Score', value: vocabStats.totalMastery, sub: 'total points earned', color: '#818cf8' },
              { icon: '🗓️', label: 'Total Sessions', value: totalActivities, sub: 'writing + conversation', color: '#34d399' },
            ].map((card, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: 'var(--space-5)' }}>
                <div style={{ fontSize: 32, marginBottom: 'var(--space-2)' }}>{card.icon}</div>
                <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: card.color, lineHeight: 1.1 }}>
                  {card.value}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--clr-text-primary)', marginTop: 4 }}>
                  {card.label}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 2 }}>
                  {card.sub}
                </div>
              </div>
            ))}
          </div>

          {/* ── Activity Heatmap ── */}
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="section-title">📅 Activity Overview — Last 6 Months</div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-4)' }}>
              Each cell = one day. Hover for details. Darker = more activity.
            </p>
            <ActivityHeatmap activityByDay={activityByDay} />
          </div>

          {/* ── Line Chart ── */}
          <div className="card" style={{ marginBottom: 'var(--space-5)' }}>
            <div className="section-title">📈 Daily Practice — Last 30 Days</div>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-4)' }}>
              Words reviewed + writing/conversation sessions per day.
            </p>
            <LineChart dataByDay={practiceByDay} />
          </div>

          {/* ── Recent Activity ── */}
          {recentActivity.length > 0 && (
            <div className="card">
              <div className="section-title">🕘 Recent Activity</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                {recentActivity.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--clr-bg-elevated)' }}>
                    <span style={{ fontSize: 20 }}>{item.type === 'writing' ? '✍️' : '💬'}</span>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--clr-text-primary)' }}>
                        {item.type === 'writing' ? 'Writing session' : 'Conversation session'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                        {new Date(item.date).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <a href={item.type === 'writing' ? '/writing' : '/conversation'}
                      style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)' }}>
                      → Go
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Error Pattern Intelligence ── */}
          {Object.keys(errorPatterns.byType).length > 0 && (() => {
            const typeLabels = { grammar: 'Grammar', vocab: 'Vocabulary', phrasal_verb: 'Phrasal Verbs', idiom: 'Idioms', linking_word: 'Linking Words' }
            const typeColors = { grammar: '#f87171', vocab: '#60a5fa', phrasal_verb: '#818cf8', idiom: '#fb923c', linking_word: '#34d399' }
            const maxCount = Math.max(...Object.values(errorPatterns.byType))
            const sorted = Object.entries(errorPatterns.byType).sort((a, b) => b[1] - a[1])
            return (
              <div className="card">
                <div className="section-title">🔍 Your Error Patterns</div>
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-4)' }}>
                  Based on your last 30 analyzed sessions. Most frequent errors by type.
                </p>
                {/* Bar chart */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
                  {sorted.map(([type, count]) => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{ width: 110, fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', textAlign: 'right', flexShrink: 0 }}>
                        {typeLabels[type] || type}
                      </div>
                      <div style={{ flex: 1, height: 10, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{
                          width: `${(count / maxCount) * 100}%`,
                          height: '100%',
                          background: typeColors[type] || 'var(--clr-accent)',
                          borderRadius: 'var(--radius-full)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ width: 28, fontSize: 'var(--font-size-xs)', fontWeight: 700, color: typeColors[type] || 'var(--clr-text-muted)', textAlign: 'right', flexShrink: 0 }}>
                        {count}
                      </div>
                      {type === 'grammar' && count > 0 && (
                        <button
                          onClick={() => navigate('/review?grammar=grammar')}
                          style={{
                            padding: '2px 10px', borderRadius: 'var(--radius-full)', border: '1px solid #f87171',
                            background: 'rgba(248,113,113,0.08)', color: '#f87171',
                            fontSize: 10, fontWeight: 700, cursor: 'pointer',
                            flexShrink: 0, whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                          }}
                          title={`Practice grammar — ${count} errors recorded`}
                        >
                          🎯 Practice
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Top specific errors */}
                {errorPatterns.topErrors.length > 0 && (
                  <>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 'var(--space-2)' }}>TOP RECURRING MISTAKES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {errorPatterns.topErrors.map((e, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', minWidth: 14 }}>#{i + 1}</span>
                          <span style={{ color: 'var(--clr-danger)', fontSize: 'var(--font-size-xs)', textDecoration: 'line-through' }}>{e.original}</span>
                          <span style={{ color: 'var(--clr-text-muted)', fontSize: 10 }}>→</span>
                          <span style={{ color: 'var(--clr-success)', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>{e.corrected}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--clr-text-muted)' }}>{e.count}×</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}
