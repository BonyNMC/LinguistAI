import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const PAGE_SIZE = 20

function stripHtml(html = '') {
  return html.replace(/<[^>]*>/g, '')
}

// ── Session Card ──────────────────────────────────────────────────
function SessionCard({ item }) {
  const [expanded, setExpanded] = useState(false)
  const isWriting = item.type === 'writing'

  const dateLabel = new Date(item.date).toLocaleDateString('en', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', transition: 'box-shadow .15s' }}>
      {/* Header row */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)', cursor: 'pointer',
          background: expanded ? 'rgba(99,102,241,0.04)' : 'transparent',
          transition: 'background .15s',
        }}
      >
        {/* Badge */}
        <div style={{
          flexShrink: 0, width: 36, height: 36, borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          background: isWriting ? 'rgba(96,165,250,0.15)' : 'rgba(99,102,241,0.15)',
        }}>
          {isWriting ? '✍️' : '💬'}
        </div>

        {/* Content preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
              background: isWriting ? 'rgba(96,165,250,0.2)' : 'rgba(99,102,241,0.2)',
              color: isWriting ? '#60a5fa' : '#818cf8',
            }}>
              {isWriting ? 'Writing' : 'Conversation'}
            </span>
            {item.cefr && (
              <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', fontWeight: 600 }}>
                CEFR: {item.cefr}
              </span>
            )}
            <span style={{ fontSize: 11, color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>
              {dateLabel}
            </span>
          </div>
          <div style={{
            fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)',
            fontWeight: 600, marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.title}
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.preview}
          </div>
        </div>

        {/* Expand arrow */}
        <div style={{
          flexShrink: 0, color: 'var(--clr-text-muted)', fontSize: 12,
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform .2s',
        }}>▼</div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--clr-border)', padding: 'var(--space-5)' }}>
          {isWriting ? (
            <WritingDetail item={item} />
          ) : (
            <ConversationDetail item={item} />
          )}
        </div>
      )}
    </div>
  )
}

function WritingDetail({ item }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div>
        <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>📝 Your Writing</div>
        <div style={{
          background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-md)',
          padding: 'var(--space-4)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8,
          color: 'var(--clr-text-primary)', whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto',
        }}>
          {item.raw}
        </div>
      </div>
      {item.analysis?.recall_report && (
        <div>
          <div className="section-title" style={{ marginBottom: 'var(--space-2)' }}>🎯 Recall Report</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
            {stripHtml(item.analysis.recall_report)}
          </p>
        </div>
      )}
      {item.analysis?.native_spoken_rewrite && (
        <div>
          <div className="section-title" style={{ marginBottom: 'var(--space-2)', color: 'var(--clr-accent-light)' }}>💬 Native Rewrite</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
            {stripHtml(item.analysis.native_spoken_rewrite)}
          </p>
        </div>
      )}
    </div>
  )
}

function ConversationDetail({ item }) {
  const messages = item.messages || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Transcript */}
      <div>
        <div className="section-title" style={{ marginBottom: 'var(--space-3)' }}>💬 Conversation Transcript</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}>
              <div style={{
                maxWidth: '80%', padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-lg)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6,
                background: msg.role === 'user' ? 'rgba(99,102,241,0.15)' : 'var(--clr-bg-elevated)',
                color: 'var(--clr-text-primary)',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Analysis summary if available */}
      {item.analysis?.strengths && (
        <div style={{ borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--space-4)' }}>
          <div className="section-title" style={{ color: 'var(--clr-success)', marginBottom: 'var(--space-2)' }}>💪 Strengths</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
            {item.analysis.strengths}
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main History Page ─────────────────────────────────────────────
export default function History() {
  const { session } = useAuth()
  const [allItems, setAllItems]   = useState([])   // all merged items
  const [query, setQuery]         = useState('')
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  useEffect(() => { fetchHistory() }, [])

  async function fetchHistory() {
    setLoading(true); setError('')
    try {
      const uid = session.user.id
      const [writingsRes, convsRes] = await Promise.all([
        supabase.from('user_writings')
          .select('id, writing_raw, writing_analysed, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
          .limit(300),
        supabase.from('conversation_sessions')
          .select('id, title, messages, analysis, created_at')
          .eq('user_id', uid)
          .not('analysis', 'is', null)
          .order('created_at', { ascending: false })
          .limit(300),
      ])
      if (writingsRes.error) throw writingsRes.error
      if (convsRes.error)    throw convsRes.error

      const writings = (writingsRes.data || []).map(w => ({
        id:       `w-${w.id}`,
        type:     'writing',
        date:     w.created_at,
        raw:      w.writing_raw,
        analysis: w.writing_analysed,
        title:    w.writing_raw?.slice(0, 60).replace(/\n/g, ' ') + (w.writing_raw?.length > 60 ? '…' : ''),
        preview:  w.writing_raw?.slice(0, 120).replace(/\n/g, ' '),
        cefr:     w.writing_analysed?.cefr_estimate,
        messages: null,
      }))

      const convs = (convsRes.data || []).map(c => ({
        id:       `c-${c.id}`,
        type:     'conversation',
        date:     c.created_at,
        raw:      null,
        analysis: c.analysis,
        title:    c.title || 'Conversation',
        preview:  (c.messages || []).filter(m => m.role === 'user').map(m => m.content).join(' ').slice(0, 120),
        cefr:     c.analysis?.cefr_estimate,
        messages: c.messages || [],
      }))

      // Merge and sort by date desc
      const merged = [...writings, ...convs].sort((a, b) => b.date.localeCompare(a.date))
      setAllItems(merged)
    } catch (e) {
      setError(e.message || 'Failed to load history.')
    } finally {
      setLoading(false)
    }
  }

  // Client-side search + pagination
  const lowerQ = query.toLowerCase().trim()
  const filtered = lowerQ
    ? allItems.filter(item =>
        item.title?.toLowerCase().includes(lowerQ) ||
        item.preview?.toLowerCase().includes(lowerQ) ||
        item.raw?.toLowerCase().includes(lowerQ) ||
        (item.messages || []).some(m => m.content?.toLowerCase().includes(lowerQ))
      )
    : allItems

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page on new search
  const handleSearch = useCallback((val) => {
    setQuery(val); setPage(1)
  }, [])

  // Group page items by date (YYYY-MM-DD)
  const grouped = pageItems.reduce((acc, item) => {
    const day = item.date.slice(0, 10)
    if (!acc[day]) acc[day] = []
    acc[day].push(item)
    return acc
  }, {})

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Session History</h1>
          <p className="page-subtitle">All your writing and conversation sessions — searchable and expandable.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchHistory} id="history-refresh-btn" style={{ marginLeft: 'auto' }}>
          🔄 Refresh
        </button>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-5)' }}>
        <span style={{
          position: 'absolute', left: 'var(--space-4)', top: '50%', transform: 'translateY(-50%)',
          color: 'var(--clr-text-muted)', fontSize: 16, pointerEvents: 'none',
        }}>🔍</span>
        <input
          id="history-search-input"
          type="text"
          placeholder="Search writing, conversation title, or content…"
          value={query}
          onChange={e => handleSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: 'var(--space-3) var(--space-4) var(--space-3) var(--space-10)',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)',
            background: 'var(--clr-bg-raised)', color: 'var(--clr-text-primary)',
            fontSize: 'var(--font-size-sm)',
          }}
        />
        {query && (
          <button
            onClick={() => handleSearch('')}
            style={{
              position: 'absolute', right: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--clr-text-muted)', fontSize: 18, lineHeight: 1,
            }}
          >✕</button>
        )}
      </div>

      {/* Result count */}
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--space-4)' }}>
        {loading ? 'Loading…' : `${filtered.length} session${filtered.length !== 1 ? 's' : ''}${lowerQ ? ` matching "${query}"` : ''}`}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 56, marginBottom: 'var(--space-4)' }}>{lowerQ ? '🔍' : '📭'}</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
            {lowerQ ? 'No results found' : 'No sessions yet'}
          </div>
          <p style={{ color: 'var(--clr-text-secondary)' }}>
            {lowerQ ? `Try a different keyword.` : 'Complete a writing or conversation analysis to see it here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Grouped by day */}
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day} style={{ marginBottom: 'var(--space-6)' }}>
              <div style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
                marginBottom: 'var(--space-3)', paddingLeft: 2,
              }}>
                {new Date(day + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {items.map(item => <SessionCard key={item.id} item={item} />)}
              </div>
            </div>
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-6)' }}>
              <button
                id="history-prev-btn"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >← Prev</button>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)' }}>
                Page {page} of {totalPages}
              </span>
              <button
                id="history-next-btn"
                className="btn btn-ghost btn-sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
