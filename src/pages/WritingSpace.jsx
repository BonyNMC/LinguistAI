import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// ── sessionStorage keys ──────────────────────────────────────────
const SS_TEXT   = 'linguist_writing_text'
const SS_RESULT = 'linguist_writing_result'
const SS_ERROR  = 'linguist_writing_error'
const SS_ADDED  = 'linguist_writing_added'

function readSS(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeSS(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── Sub-components ────────────────────────────────────────────────
function VocabSuggestionCard({ word, onAdd, added }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 4 }}>
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)' }}>
            {word.word}
          </span>
          <SpeakButton text={word.word} title={`Listen to "${word.word}"`} />
        </div>
        <span className="badge badge-accent">{word.type || 'vocab'}</span>
      </div>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-3)' }}>
        {word.definition}
      </p>
      <button
        className={`btn btn-sm ${added ? 'btn-secondary' : 'btn-primary'}`}
        onClick={() => !added && onAdd(word)}
        disabled={added}
        id={`add-word-${word.word.replace(/\s+/g, '-')}`}
      >
        {added ? '✓ Added' : '+ Add to Study List'}
      </button>
    </div>
  )
}

// Strip any rogue HTML tags the AI might accidentally include in plain-text fields
function stripHtml(str) {
  if (!str) return ''
  return str.replace(/<\/?[a-zA-Z][^>]*>/g, '')
}

function AnalysisResult({ result, onAddWord, addedWords }) {
  if (!result) return null
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Marked-up text */}
      <div className="card">
        <div className="section-title">📝 Analysed Text</div>
        <div className="writing-output" dangerouslySetInnerHTML={{ __html: result.analysed_text_marked_up }} />
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
            <span className="mark-error" style={{ padding: '1px 6px' }}>Red</span> = Errors
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
            <span className="mark-recall" style={{ padding: '1px 6px' }}>Green</span> = Study words used ✓
          </span>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
            <span className="mark-suggestion" style={{ padding: '1px 6px' }}>Amber</span> = Suggestions
          </span>
        </div>
      </div>

      {/* Active Recall Report */}
      {result.recall_report && (
        <div className="card">
          <div className="section-title">🎯 Active Recall Report</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', whiteSpace: 'pre-line' }}>
            {stripHtml(result.recall_report)}
          </p>
        </div>
      )}

      {/* Native Rewrite */}
      {result.native_spoken_rewrite && (
        <div className="card" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>💬 Native Speaker Rewrite</div>
            <SpeakButton text={stripHtml(result.native_spoken_rewrite)} size="md" title="Listen to native rewrite" />
          </div>
          <p style={{ fontSize: 'var(--font-size-base)', lineHeight: 1.8, color: 'var(--clr-text-primary)' }}>
            {stripHtml(result.native_spoken_rewrite)}
          </p>
        </div>
      )}

      {/* New Vocabulary */}
      {result.new_vocabulary_suggestions?.length > 0 && (
        <div>
          <div className="section-title">✨ Suggested New Vocabulary</div>
          <div className="grid-2">
            {result.new_vocabulary_suggestions.map((word, i) => (
              <VocabSuggestionCard
                key={i} word={word}
                onAdd={onAddWord} added={addedWords.has(word.word)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main WritingSpace ──────────────────────────────────────────────
export default function WritingSpace() {
  const { session } = useAuth()

  // Restore from sessionStorage on mount
  const [text, setText]         = useState(() => readSS(SS_TEXT, ''))
  const [result, setResult]     = useState(() => readSS(SS_RESULT, null))
  const [error, setError]       = useState(() => readSS(SS_ERROR, ''))
  const [addedWords, setAddedWords] = useState(() => new Set(readSS(SS_ADDED, [])))
  const [loading, setLoading]   = useState(false)

  // Keep sessionStorage in sync with state
  useEffect(() => { writeSS(SS_TEXT,   text)          }, [text])
  useEffect(() => { writeSS(SS_RESULT, result)        }, [result])
  useEffect(() => { writeSS(SS_ERROR,  error)         }, [error])
  useEffect(() => { writeSS(SS_ADDED,  [...addedWords]) }, [addedWords])

  async function handleAnalyze() {
    if (!text.trim()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('analyze-writing', {
        body: { writing_text: text }
      })
      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)
      setResult(data)
    } catch (err) {
      setError(err.message || 'Analysis failed. Please check your API key in Settings.')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddWord(word) {
    try {
      const { data: vocabRow, error: upsertErr } = await supabase
        .from('vocab_master')
        .upsert({ word_phrase: word.word, type: word.type || 'vocab', definition: word.definition }, { onConflict: 'word_phrase' })
        .select('id').single()
      if (upsertErr) throw upsertErr
      const { error: progErr } = await supabase
        .from('user_vocab_progress')
        .upsert({ user_id: session.user.id, vocab_id: vocabRow.id, status: 'learning' }, { onConflict: 'user_id,vocab_id' })
      if (progErr) throw progErr
      setAddedWords(prev => new Set([...prev, word.word]))
    } catch (err) {
      setError('Failed to add word: ' + err.message)
    }
  }

  function handleClear() {
    setText('')
    setResult(null)
    setError('')
    setAddedWords(new Set())
    // Explicitly wipe sessionStorage on clear
    ;[SS_TEXT, SS_RESULT, SS_ERROR, SS_ADDED].forEach(k => sessionStorage.removeItem(k))
  }

  const charCount = text.length
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Writing Space</h1>
          <p className="page-subtitle">Write anything, then let your AI coach analyze and improve it.</p>
        </div>
        {(result || text) && (
          <div style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--clr-success)', display: 'inline-block' }} />
            Session saved
          </div>
        )}
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <textarea
          id="writing-input"
          className="form-textarea"
          style={{ minHeight: 220, border: 'none', padding: 0, background: 'transparent', fontSize: 'var(--font-size-base)', lineHeight: 1.8 }}
          placeholder="Start writing here… e.g. 'We need to fix the bottleneck in our production line by implementing a better quality control process.'"
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <div className="flex items-center justify-between" style={{ marginTop: 'var(--space-4)', borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>{wordCount} words</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>{charCount} chars</span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleClear}
              disabled={!text && !result}
              id="clear-writing-btn"
            >
              Clear
            </button>
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={loading || !text.trim()}
              id="analyze-writing-btn"
            >
              {loading ? <><span className="spinner" /> Analyzing…</> : '🔍 Analyze Writing'}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Your AI coach is analyzing your writing…</p>
        </div>
      )}

      <AnalysisResult result={result} onAddWord={handleAddWord} addedWords={addedWords} />
    </div>
  )
}
