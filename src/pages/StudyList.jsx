import { useState, useEffect, useRef } from 'react'
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
const STATUS_COLORS = { learning: 'badge-info', mastered: 'badge-success', suspended: 'badge-muted' }

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

export default function StudyList() {
  const { session } = useAuth()
  const [words, setWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')
  const [filterDomain, setFilterDomain] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const fileRef = useRef()

  const domains = [...new Set(words.map(w => w.vocab_master?.domain).filter(Boolean))]

  useEffect(() => { fetchWords() }, [session])

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
          <p className="page-subtitle">{words.length} words tracked · {words.filter(w => w.status === 'mastered').length} mastered</p>
        </div>
        <div className="flex gap-3">
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
