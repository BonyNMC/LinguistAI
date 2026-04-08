import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// Word type taxonomy (from a Language Acquisition perspective):
// - 'vocab'        : general single words (nouns, verbs, adjectives, adverbs)
// - 'phrasal_verb' : verb + particle combinations (e.g. 'bring up', 'give in')
// - 'idiom'        : fixed expressions with figurative meaning (e.g. 'hit the nail on the head')
// - 'linking_word' : discourse connectors & cohesive devices (e.g. 'moreover', 'in contrast')
//                    NOT 'linking_verb' — that is a grammar term for BE/seem/appear, not a learnable lexical chunk
const WORD_TYPES = ['vocab', 'phrasal_verb', 'idiom', 'linking_word']
const STATUS_COLORS = { learning: 'badge-info', reviewing: 'badge-accent', mastered: 'badge-success', suspended: 'badge-muted' }

function MasteryBar({ value }) {
  const level = value >= 70 ? 'high' : value >= 40 ? 'mid' : 'low'
  return (
    <div className="mastery-bar-container">
      <div className="mastery-bar-track">
        <div className="mastery-bar-fill" style={{ width: `${value}%` }} />
      </div>
      <span className="mastery-value">{value}</span>
    </div>
  )
}

function AddWordModal({ onClose, onSave }) {
  const [form, setForm] = useState({ word_phrase: '', type: 'vocab', definition: '', domain: '', source_material: '', original_context: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.word_phrase.trim()) return
    setSaving(true)
    setErr('')
    const { error } = await onSave(form)
    if (error) { setErr(error); setSaving(false) }
    else onClose()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal animate-fade-in">
        <h2 className="modal-title">Add New Word / Phrase</h2>
        {err && <div className="alert alert-danger">{err}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="add-word-phrase">Word / Phrase *</label>
            <input id="add-word-phrase" className="form-input" value={form.word_phrase} onChange={e => setForm(p => ({ ...p, word_phrase: e.target.value }))} placeholder="e.g. bottleneck" required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="add-word-type">Type</label>
            <select id="add-word-type" className="form-select" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              {WORD_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="add-word-def">Definition</label>
            <textarea id="add-word-def" className="form-textarea" style={{ minHeight: 80 }} value={form.definition} onChange={e => setForm(p => ({ ...p, definition: e.target.value }))} placeholder="Meaning of the word in context" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label" htmlFor="add-word-domain">Domain</label>
              <input id="add-word-domain" className="form-input" value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} placeholder="e.g. Lean Six Sigma" />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="add-word-source">Source Material</label>
              <input id="add-word-source" className="form-input" value={form.source_material} onChange={e => setForm(p => ({ ...p, source_material: e.target.value }))} placeholder="e.g. ASQ Green Belt Handbook" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="add-word-ctx">Original Context Sentence</label>
            <textarea id="add-word-ctx" className="form-textarea" style={{ minHeight: 80 }} value={form.original_context} onChange={e => setForm(p => ({ ...p, original_context: e.target.value }))} placeholder="The sentence from your source where you found this word" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} id="confirm-add-word-btn">
              {saving ? <><span className="spinner" /> Saving…</> : 'Add Word'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── MasteryGuide ────────────────────────────────────────────────
// Collapsible learning guide explaining the 4-stage mastery journey.
// Uses the user's real word stats to personalize the message.
function MasteryGuide({ words }) {
  const [open, setOpen] = useState(false)

  const learning = words.filter(w => w.status === 'learning').length
  const reviewing = words.filter(w => w.status === 'reviewing').length
  const mastered = words.filter(w => w.status === 'mastered').length
  const total = words.length

  const STAGES = [
    {
      icon: '📖', label: 'Learning', range: '0 – 79%', color: '#60a5fa',
      desc: 'A new or recently added word. You\'re building first contact — your brain is still forming the neural pathway for this word.',
      earn: 'Each time you use it in Writing or Conversation → +10 pts. Each correct Review challenge → +8 pts.',
    },
    {
      icon: '🔄', label: 'Reviewing', range: '80 – 99%', color: '#a78bfa',
      desc: 'Strong recognition — you\'ve seen and used this word enough that it\'s familiar. But familiarity isn\'t fluency yet. You need more spaced exposures to make it automatic.',
      earn: 'Keep using it in writing. Keep reviewing via SRS. Each session deepens the memory trace.',
    },
    {
      icon: '🌟', label: 'Mastered', range: '100%', color: '#34d399',
      desc: 'Fully acquired. You can produce this word naturally in context without hesitation. This is the goal — Krashen calls it \'acquired\' vs. \'learned\'.',
      earn: 'Worth +100 Overall Score on the Leaderboard. Every 90 days, a quick Maintenance Check confirms it\'s still there.',
    },
    {
      icon: '🔧', label: 'Maintenance', range: 'Every 90 days', color: '#f59e0b',
      desc: 'Even mastered words benefit from a periodic check — Ebbinghaus showed memory traces do thin over time without any exposure. But your score won\'t drop automatically.',
      earn: 'Pass → confirmed, next check in 90 days. Fail → mastery to 70%, back to Reviewing. Honest, not punishing.',
    },
  ]

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'rgba(99,102,241,0.06)', border: '1px solid var(--clr-border)',
          borderRadius: open ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
          padding: 'var(--space-3) var(--space-4)', cursor: 'pointer',
          transition: 'background 0.2s',
        }}
        id="mastery-guide-toggle"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🧠</span>
          <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--clr-text-primary)' }}>
            How Mastery Works
          </span>
          {total > 0 && (
            <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', background: 'var(--clr-bg-elevated)', padding: '1px 8px', borderRadius: 99, border: '1px solid var(--clr-border)' }}>
              {mastered}/{total} mastered · {reviewing} reviewing · {learning} learning
            </span>
          )}
        </div>
        <span style={{ fontSize: 12, color: 'var(--clr-text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {open && (
        <div style={{
          border: '1px solid var(--clr-border)', borderTop: 'none',
          borderRadius: '0 0 var(--radius-md) var(--radius-md)',
          background: 'var(--clr-bg-surface)', padding: 'var(--space-5)',
        }}>
          {/* Journey pipeline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
            {STAGES.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  background: `${s.color}14`, border: `1.5px solid ${s.color}40`,
                  borderRadius: 'var(--radius-md)', padding: '6px 14px', textAlign: 'center', minWidth: 100,
                }}>
                  <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</div>
                  <div style={{ fontSize: 9, color: 'var(--clr-text-muted)', marginTop: 1 }}>{s.range}</div>
                </div>
                {i < STAGES.length - 1 && (
                  <div style={{ fontSize: 16, color: 'var(--clr-text-muted)', padding: '0 6px', flexShrink: 0 }}>→</div>
                )}
              </div>
            ))}
          </div>

          {/* Stage details */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            {STAGES.map((s, i) => (
              <div key={i} style={{ borderLeft: `3px solid ${s.color}`, paddingLeft: 'var(--space-3)', paddingRight: 'var(--space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span>{s.icon}</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: s.color }}>{s.label}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--clr-text-secondary)', margin: '0 0 6px', lineHeight: 1.6 }}>{s.desc}</p>
                <p style={{ fontSize: 10, color: 'var(--clr-text-muted)', margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--clr-text-secondary)' }}>How to earn: </strong>{s.earn}
                </p>
              </div>
            ))}
          </div>

          {/* Smart tip based on user's current progress */}
          <div style={{
            background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3) var(--space-4)', display: 'flex', gap: 10, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>💡</span>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', margin: 0, lineHeight: 1.7 }}>
              {mastered > 0
                ? <>You've mastered <strong style={{ color: '#34d399' }}>{mastered} word{mastered > 1 ? 's' : ''}</strong>! Keep using them in Writing and Conversation — natural usage is what separates <em>memorized</em> from <em>truly acquired</em>. A Maintenance Check will appear every 90 days to confirm they're still solid.</>
                : reviewing > 0
                  ? <>You have <strong style={{ color: '#a78bfa' }}>{reviewing} word{reviewing > 1 ? 's' : ''}</strong> in the Reviewing stage — almost there! Keep writing and doing Review sessions. Once a word hits 100%, it becomes <strong style={{ color: '#34d399' }}>Mastered</strong> (+100 pts on the Leaderboard).</>
                  : total > 0
                    ? <>You're building your foundation with <strong style={{ color: '#60a5fa' }}>{total} word{total > 1 ? 's' : ''}</strong>. Use them in your Writing and Conversation sessions — every time the AI detects a study word in your text, it gets +10 mastery automatically.</>
                    : <>Add your first words via <strong>+ Add Word</strong> or import a CSV. Then use them in Writing or Conversation — the AI will detect and credit them automatically.</>
              }
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function StudyList() {
  const { session } = useAuth()
  const location = useLocation()
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const fileRef = useRef()

  const domains = [...new Set(words.map(w => w.vocab_master?.domain).filter(Boolean))]

  // Refetch whenever the user navigates to this page (e.g., after Mastery Credit from Writing/Conversation)
  useEffect(() => { fetchWords() }, [session, location.pathname])

  async function fetchWords() {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_vocab_progress')
      .select(`id, mastery_level, status, times_used_in_writing, next_review_due_at, vocab_master(id, word_phrase, type, definition, domain, source_material)`)
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[StudyList] fetchWords error:', error)
      setError('Failed to load words: ' + error.message)
    } else {
      setWords(data || [])
    }
    setLoading(false)
  }

  async function handleSaveWord(form) {
    try {
      const { data: vocabRow, error: upsertErr } = await supabase
        .from('vocab_master')
        .upsert({ word_phrase: form.word_phrase.trim(), type: form.type, definition: form.definition, domain: form.domain, source_material: form.source_material, original_context: form.original_context }, { onConflict: 'word_phrase' })
        .select('id').single()
      if (upsertErr) return { error: upsertErr.message }
      const { error: progErr } = await supabase
        .from('user_vocab_progress')
        .upsert({ user_id: session.user.id, vocab_id: vocabRow.id }, { onConflict: 'user_id,vocab_id' })
      if (progErr) return { error: progErr.message }
      await fetchWords()
      return {}
    } catch (e) { return { error: e.message } }
  }

  async function handleStatusChange(progressId, newStatus) {
    await supabase.from('user_vocab_progress').update({ status: newStatus }).eq('id', progressId)
    setWords(prev => prev.map(w => w.id === progressId ? { ...w, status: newStatus } : w))
  }

  async function handleDelete(progressId) {
    if (!confirm('Remove this word from your study list?')) return
    await supabase.from('user_vocab_progress').delete().eq('id', progressId)
    setWords(prev => prev.filter(w => w.id !== progressId))
  }

  function handleExportCSV() {
    const rows = [['word_phrase', 'type', 'definition', 'domain', 'source_material', 'mastery_level', 'status']]
    words.forEach(w => {
      rows.push([
        w.vocab_master?.word_phrase, w.vocab_master?.type, w.vocab_master?.definition,
        w.vocab_master?.domain, w.vocab_master?.source_material, w.mastery_level, w.status
      ])
    })
    const csv = rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'linguistai_vocab.csv'
    a.click()
  }

  async function handleImportCSV(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim())
    let imported = 0; let failed = 0
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g)?.map(c => c?.replace(/^"|"$/g, '').trim()) || []
      const row = {}
      headers.forEach((h, idx) => { row[h] = cols[idx] || '' })
      if (!row.word_phrase) continue
      const result = await handleSaveWord({ word_phrase: row.word_phrase, type: row.type || 'vocab', definition: row.definition || '', domain: row.domain || '', source_material: row.source_material || '', original_context: row.original_context || '' })
      result.error ? failed++ : imported++
    }
    setError(`Imported ${imported} words${failed ? `, ${failed} failed` : ''}.`)
    fileRef.current.value = ''
    await fetchWords()
  }

  const filtered = words.filter(w =>
    (!filterDomain || w.vocab_master?.domain === filterDomain) &&
    (!filterStatus || w.status === filterStatus)
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Study List</h1>
          <p className="page-subtitle">
            {words.length} words tracked · {words.filter(w => w.status === 'reviewing').length} reviewing · {words.filter(w => w.status === 'mastered').length} mastered
          </p>
        </div>
        <div className="flex gap-3">
          <button className="btn btn-ghost btn-sm" onClick={fetchWords} id="refresh-studylist-btn">🔄 Refresh</button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCSV} id="export-csv-btn">⬇ Export CSV</button>
          <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current.click()} id="import-csv-btn">⬆ Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImportCSV} />
          <button className="btn btn-primary" onClick={() => setShowModal(true)} id="add-word-btn">+ Add Word</button>
        </div>
      </div>

      {error && <div className="alert alert-info">{error}</div>}

      {/* Filters */}
      <div className="flex gap-3" style={{ marginBottom: 'var(--space-4)' }}>
        <select className="form-select" style={{ maxWidth: 200 }} value={filterDomain} onChange={e => setFilterDomain(e.target.value)} id="filter-domain">
          <option value="">All domains</option>
          {domains.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="form-select" style={{ maxWidth: 160 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)} id="filter-status">
          <option value="">All statuses</option>
          <option value="learning">Learning</option>
          <option value="reviewing">Reviewing (80–99%)</option>
          <option value="mastered">Mastered (100%)</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* ── How Mastery Works ──────────────────────────────────── */}
      <MasteryGuide words={words} />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center' }}>
            <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📚</div>
            <div className="empty-state-title">No words yet</div>
            <p>Add words manually or import a CSV file.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Word / Phrase</th>
                <th>Type</th>
                <th>Domain</th>
                <th>Mastery</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(w => (
                <tr key={w.id}>
                  <td>
                    <div style={{ fontWeight: 600, color: 'var(--clr-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {w.vocab_master?.word_phrase}
                      <SpeakButton text={w.vocab_master?.word_phrase} title={`Listen to "${w.vocab_master?.word_phrase}"`} />
                    </div>
                    {w.vocab_master?.definition && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 2 }}>{w.vocab_master.definition.slice(0, 80)}{w.vocab_master.definition.length > 80 ? '…' : ''}</div>
                    )}
                  </td>
                  <td><span className="badge badge-muted">{w.vocab_master?.type?.replace('_', ' ')}</span></td>
                  <td style={{ color: 'var(--clr-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{w.vocab_master?.domain || '—'}</td>
                  <td style={{ minWidth: 140 }}><MasteryBar value={w.mastery_level} /></td>
                  <td>
                    <select
                      className="form-select"
                      style={{ padding: '4px 28px 4px 8px', fontSize: 'var(--font-size-xs)' }}
                      value={w.status}
                      onChange={e => handleStatusChange(w.id, e.target.value)}
                    >
                      <option value="learning">Learning</option>
                      <option value="mastered">Mastered</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </td>
                  <td>
                    <button className="btn btn-icon btn-danger" onClick={() => handleDelete(w.id)} title="Remove word" id={`delete-word-${w.id}`}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <AddWordModal onClose={() => setShowModal(false)} onSave={handleSaveWord} />}
    </div>
  )
}
