import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'
import ExportPanel from '../components/ExportPanel.jsx'
import DailyVocabMissions from '../components/DailyVocabMissions.jsx'

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
  const credited = result.credited_words || []
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Mastery credit banner */}
      {credited.length > 0 && (
        <div style={{
          borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
          background: 'rgba(34,197,94,0.08)', borderLeft: '3px solid var(--clr-success)',
        }}>
          <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, color: 'var(--clr-success)', marginBottom: 'var(--space-2)' }}>
            🏅 Mastery Credited!
          </div>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', margin: 0, lineHeight: 1.6 }}>
            You used {credited.length > 1 ? 'these words' : 'this word'} from your Study List — each earned +10 mastery points:{' '}
            {credited.map((w, i) => (
              <strong key={i} style={{ color: 'var(--clr-success)' }}>{i > 0 ? ', ' : ''}"{w}"</strong>
            ))}
          </p>
        </div>
      )}
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

      {/* Tone Evaluation */}
      {result.tone_evaluation && (
        <div className="card" style={{ borderColor: 'rgba(217,70,239,0.3)', background: 'rgba(217,70,239,0.06)' }}>
          <div className="section-title" style={{ color: 'var(--clr-accent)', margin: 0, marginBottom: 'var(--space-2)' }}>🎭 Tone & Register Evaluation</div>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)', fontWeight: 600, margin: 0 }}>Tone Detected: {result.tone_evaluation.tone_detected}</p>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', marginTop: 'var(--space-2)' }}>{result.tone_evaluation.appropriateness}</p>
          {result.tone_evaluation.suggestion && (
             <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', marginTop: 'var(--space-1)' }}>💡 <i>{result.tone_evaluation.suggestion}</i></p>
          )}
        </div>
      )}

      {/* Grammar explanations */}
      {result.error_highlights && result.error_highlights.length > 0 && (
         <div className="card">
           <div className="section-title">🔍 Grammar & Vocabulary Explanations</div>
           <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {result.error_highlights.map((err, i) => (
                <div key={i} style={{ padding: 'var(--space-3)', background: 'var(--clr-bg-surface-elevated)', borderRadius: 'var(--radius-md)', borderLeft: '3px solid var(--clr-danger)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
                    <span style={{ textDecoration: 'line-through', color: 'var(--clr-danger)', opacity: 0.8 }}>{err.original}</span>
                    <span>→</span>
                    <span style={{ color: 'var(--clr-success)', fontWeight: 600 }}>{err.corrected}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>💡 {err.explanation}</p>
                </div>
              ))}
           </div>
         </div>
      )}

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
  const [scenarioContext, setScenarioContext] = useState(() => readSS('linguist_writing_scenario', ''))
  const [result, setResult]     = useState(() => readSS(SS_RESULT, null))
  const [error, setError]       = useState(() => readSS(SS_ERROR, ''))
  const [addedWords, setAddedWords] = useState(() => new Set(readSS(SS_ADDED, [])))
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)  // for Save button
  const [savedFlash, setSavedFlash] = useState(false)

  // Keep sessionStorage in sync with state
  useEffect(() => { writeSS(SS_TEXT,   text)          }, [text])
  useEffect(() => { writeSS('linguist_writing_scenario', scenarioContext) }, [scenarioContext])
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
        body: { writing_text: text, scenario_context: scenarioContext }
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

  // Save raw writing to DB without AI analysis (for users without an API key)
  async function handleSave() {
    if (!text.trim() || saving) return
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('user_writings')
        .insert({ user_id: session.user.id, writing_raw: text })
      if (err) throw err
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2000)
    } catch (err) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
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

      <DailyVocabMissions />

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ marginBottom: 'var(--space-4)' }}>
           <input 
             className="form-input" 
             style={{ width: '100%', fontSize: 'var(--font-size-sm)' }} 
             placeholder="Optional: What is the context? (e.g. Formal email, casual chat, academic essay)" 
             value={scenarioContext} 
             onChange={e => setScenarioContext(e.target.value)} 
             disabled={loading}
           />
        </div>
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
              className="btn btn-secondary btn-sm"
              onClick={handleSave}
              disabled={saving || !text.trim()}
              id="save-writing-btn"
              title="Save writing to database (no AI needed)"
            >
              {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : savedFlash ? '✓ Saved!' : '💾 Save'}
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

      <ExportPanel currentText={text} />
    </div>
  )
}
