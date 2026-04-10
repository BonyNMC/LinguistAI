import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// ── SRS Status Lifecycle ─────────────────────────────────────────────────────
const MAINTENANCE_INTERVAL_DAYS = 90

function calcNextReview(mastery, quality, ef, reps) {
  let newEf = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  let newReps = quality >= 3 ? reps + 1 : 0
  let interval = 1
  if (newReps === 1) interval = 1
  else if (newReps === 2) interval = 6
  else interval = Math.round((reps > 0 ? 6 * Math.pow(ef, reps - 1) : 1) * newEf)
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + interval)
  const newMastery = Math.min(100, Math.max(0, mastery + (quality >= 3 ? 8 : -15)))
  let newStatus
  if (newMastery >= 100) newStatus = 'mastered'
  else if (newMastery >= 80) newStatus = 'reviewing'
  else if (newMastery < 10) newStatus = 'learning'
  return { ef: newEf, reps: newReps, next_review_due_at: nextDate.toISOString(), mastery: newMastery, status: newStatus }
}

function calcMaintenanceResult(passed) {
  const nextDate = new Date()
  if (passed) {
    nextDate.setDate(nextDate.getDate() + MAINTENANCE_INTERVAL_DAYS)
    return { mastery: 100, status: 'mastered', next_review_due_at: nextDate.toISOString() }
  } else {
    nextDate.setDate(nextDate.getDate() + 3)
    return { mastery: 70, status: 'reviewing', next_review_due_at: nextDate.toISOString() }
  }
}

// ── Edit-distance helper ─────────────────────────────────────────────────────
function editDist(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = a[i-1] === b[j-1] ? m[i-1][j-1] : 1 + Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1])
  return m[a.length][b.length]
}

// ── ClozePassage: Renders passage with inline inputs ─────────────────────────
function ClozePassage({ passage, blanks, answers, onAnswerChange, submitted }) {
  // Split by [1], [2], … placeholders
  const parts = passage.split(/(\[\d+\])/g)
  return (
    <div style={{ lineHeight: 2.4, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)' }}>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (!match) return <span key={i}>{part}</span>
        const idx = parseInt(match[1])
        const blankDef = blanks.find(b => b.index === idx)
        const userVal = answers[idx] || ''
        let isCorrect = false, isWrong = false
        if (submitted && blankDef) {
          const ans = userVal.trim().toLowerCase()
          const target = blankDef.target.toLowerCase()
          isCorrect = ans === target || editDist(ans, target) <= 1
          isWrong = !isCorrect
        }
        const inputWidth = Math.max(90, ((blankDef?.target?.length || 6) + 2) * 10)
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 3px' }}>
            <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', fontWeight: 700 }}>[{idx}]</span>
            <input
              type="text"
              value={userVal}
              onChange={e => !submitted && onAnswerChange(idx, e.target.value)}
              disabled={submitted}
              autoComplete="off"
              style={{
                width: inputWidth,
                padding: '2px 8px',
                borderRadius: 6,
                border: `2px solid ${isCorrect ? 'var(--clr-success)' : isWrong ? 'var(--clr-danger)' : 'var(--clr-accent)'}`,
                background: isCorrect ? 'rgba(34,197,94,0.1)' : isWrong ? 'rgba(239,68,68,0.07)' : 'var(--clr-bg-elevated)',
                color: 'var(--clr-text-primary)',
                fontSize: 'var(--font-size-sm)',
                textAlign: 'center',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              placeholder={`   …   `}
            />
            {submitted && isWrong && blankDef && (
              <span style={{ color: 'var(--clr-success)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
                → {blankDef.target}
              </span>
            )}
            {submitted && isCorrect && (
              <span style={{ color: 'var(--clr-success)', fontSize: 12 }}>✓</span>
            )}
          </span>
        )
      })}
    </div>
  )
}

// ── GrammarExercise: Single MCQ card ─────────────────────────────────────────
function GrammarCard({ exercise, idx, selected, onSelect, submitted }) {
  const sentence = [exercise.sentence_before, '_____', exercise.sentence_after].filter(Boolean).join(' ')
  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontWeight: 800, fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0, marginTop: 2 }}>Q{idx + 1}</span>
        <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)', lineHeight: 1.7, fontStyle: 'italic' }}>
          "{sentence}"
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {exercise.options?.map((opt, oi) => {
          const isSelected = selected === oi
          const isCorrect = oi === exercise.correct_index
          let bg = 'var(--clr-bg-elevated)', border = 'var(--clr-border)', color = 'var(--clr-text-secondary)'
          if (submitted) {
            if (isCorrect) { bg = 'rgba(34,197,94,0.12)'; border = 'var(--clr-success)'; color = 'var(--clr-success)' }
            else if (isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.07)'; border = 'var(--clr-danger)'; color = 'var(--clr-danger)' }
          } else if (isSelected) {
            bg = 'rgba(99,102,241,0.12)'; border = 'var(--clr-accent)'; color = 'var(--clr-text-primary)'
          }
          return (
            <button
              key={oi}
              onClick={() => !submitted && onSelect(oi)}
              disabled={submitted}
              style={{
                textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)', border: `1.5px solid ${border}`,
                background: bg, color, fontSize: 'var(--font-size-sm)',
                cursor: submitted ? 'default' : 'pointer', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 10, opacity: 0.6 }}>{String.fromCharCode(65 + oi)}.</span>
              {opt}
              {submitted && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
              {submitted && isSelected && !isCorrect && <span style={{ marginLeft: 'auto' }}>✗</span>}
            </button>
          )
        })}
      </div>
      {submitted && exercise.explanation && (
        <div className="animate-fade-in" style={{ marginTop: 'var(--space-3)', background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', lineHeight: 1.7, borderLeft: '3px solid var(--clr-accent)' }}>
          💡 {exercise.explanation}
        </div>
      )}
    </div>
  )
}

export default function Review() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()

  const [dueWords, setDueWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState('idle')
  const [challenge, setChallenge] = useState(null)
  const [userSentence, setUserSentence] = useState('')
  const [evalResult, setEvalResult] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState(() => searchParams.get('grammar') ? 'grammar' : 'challenge')
  const [storyContext, setStoryContext] = useState(null)
  const [shadowingActive, setShadowingActive] = useState(false)
  const [shadowingText, setShadowingText] = useState('')
  const [recognizedText, setRecognizedText] = useState('')
  const [shadowingScore, setShadowingScore] = useState(null)
  const [shadowingListening, setShadowingListening] = useState(false)
  const [shadowingWordDiff, setShadowingWordDiff] = useState([])
  const [phonetic, setPhonetic] = useState(null)
  const [shadowingAttempts, setShadowingAttempts] = useState(0)

  // ── Cloze (multi-blank) state ────────────────────────────────────
  const [clozeData, setClozeData] = useState(null)         // { passage, blanks, word_bank, progress_ids }
  const [clozeAnswers, setClozeAnswers] = useState({})     // { blankIndex: string }
  const [clozeResults, setClozeResults] = useState(null)   // [{ index, target, userAnswer, passed, vocab_id }]
  const [clozeSubmitting, setClozeSubmitting] = useState(false)

  // ── Grammar mode state ───────────────────────────────────────────
  const [grammarData, setGrammarData] = useState(null)     // { grammar_topic, topic_explanation, exercises }
  const [grammarLoading, setGrammarLoading] = useState(false)
  const [grammarAnswers, setGrammarAnswers] = useState({}) // { exerciseIdx: optionIdx }
  const [grammarSubmitted, setGrammarSubmitted] = useState(false)
  const [grammarScore, setGrammarScore] = useState(null)

  useEffect(() => { fetchDue() }, [session])

  // Auto-load grammar exercises if URL has ?grammar param
  useEffect(() => {
    if (mode === 'grammar' && !grammarData && !grammarLoading) {
      handleGenerateGrammar()
    }
  }, [mode])

  async function fetchDue() {
    setLoading(true)
    const now = new Date().toISOString()
    const { data: regularWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .in('status', ['learning', 'reviewing'])
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(20)
    const { data: maintenanceWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .eq('status', 'mastered')
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(3)
    setDueWords([...(regularWords || []), ...(maintenanceWords || [])])
    setLoading(false)
  }

  const current = dueWords[currentIdx]

  function resetCloze() {
    setClozeData(null)
    setClozeAnswers({})
    setClozeResults(null)
    setClozeSubmitting(false)
  }

  function resetChallenge() {
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    setShadowingActive(false)
    setShadowingScore(null)
    setShadowingWordDiff([])
    setShadowingAttempts(0)
    setRecognizedText('')
  }

  async function handleGenerateChallenge() {
    setPhase('generating')
    setError('')
    resetChallenge()
    resetCloze()
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-challenge', {
        body: {
          vocab_id: current.vocab_master.id,
          user_id: session.user.id,
          story_mode: mode === 'story',
          story_context: storyContext,
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      if (mode === 'story' && data.story_context) setStoryContext(data.story_context)
      setChallenge(data)
      setPhase('challenge')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function handleGenerateCloze() {
    setPhase('cloze-generating')
    setError('')
    resetCloze()
    resetChallenge()
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-cloze', {})
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setClozeData(data)
      setClozeAnswers({})
      setPhase('cloze')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function handleSubmitCloze() {
    if (!clozeData || clozeSubmitting) return
    setClozeSubmitting(true)

    const results = clozeData.blanks.map(blank => {
      const userAnswer = (clozeAnswers[blank.index] || '').trim()
      const target = blank.target.toLowerCase()
      const ans = userAnswer.toLowerCase()
      const passed = ans === target || editDist(ans, target) <= 1
      return { index: blank.index, target: blank.target, vocab_id: blank.vocab_id, userAnswer, passed }
    })
    setClozeResults(results)
    setPhase('cloze-result')

    // Update SRS for each blank independently (with await for leaderboard accuracy)
    for (const r of results) {
      const progressId = clozeData.progress_ids?.[r.vocab_id]
      if (!progressId) continue
      // Find the progress row to get current mastery/ef/reps
      const progressRow = dueWords.find(w => w.id === progressId) ||
        (await supabase.from('user_vocab_progress').select('id,mastery_level,ef_factor,repetitions,status').eq('id', progressId).single()).data
      if (!progressRow) continue
      const quality = r.passed ? 4 : 1
      let update = { last_reviewed_at: new Date().toISOString() }
      if (progressRow.status === 'mastered') {
        const { mastery, status, next_review_due_at } = calcMaintenanceResult(r.passed)
        update = { ...update, mastery_level: mastery, status, next_review_due_at }
      } else {
        const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
          progressRow.mastery_level, quality, progressRow.ef_factor, progressRow.repetitions
        )
        update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at }
        if (status) update.status = status
      }
      await supabase.from('user_vocab_progress').update(update).eq('id', progressId)
    }
    setClozeSubmitting(false)
  }

  async function handleGenerateGrammar() {
    setGrammarLoading(true)
    setGrammarData(null)
    setGrammarAnswers({})
    setGrammarSubmitted(false)
    setGrammarScore(null)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-grammar-exercise', {})
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setGrammarData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setGrammarLoading(false)
    }
  }

  function handleSubmitGrammar() {
    if (!grammarData) return
    const results = grammarData.exercises.map((ex, i) => ({
      selected: grammarAnswers[i] ?? -1,
      correct: ex.correct_index,
      passed: grammarAnswers[i] === ex.correct_index,
    }))
    const score = Math.round((results.filter(r => r.passed).length / results.length) * 100)
    setGrammarScore(score)
    setGrammarSubmitted(true)
  }

  async function handleSubmitSentence() {
    if (!userSentence.trim()) return
    setPhase('evaluating')
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('evaluate-challenge', {
        body: {
          vocab_id: current.vocab_master.id,
          user_id: session.user.id,
          user_sentence: userSentence,
          target_word: challenge.target_word
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setEvalResult(data)
      setPhase('result')
      let update = { last_reviewed_at: new Date().toISOString() }
      if (current.status === 'mastered') {
        const { mastery, status, next_review_due_at } = calcMaintenanceResult(data.passed)
        update = { ...update, mastery_level: mastery, status, next_review_due_at }
      } else {
        const quality = data.passed ? Math.min(5, Math.round(3 + data.score / 33)) : 1
        const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
          current.mastery_level, quality, current.ef_factor, current.repetitions
        )
        update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at, times_used_in_writing: (current.times_used_in_writing || 0) + 1 }
        if (status) update.status = status
      }
      await supabase.from('user_vocab_progress').update(update).eq('id', current.id)
    } catch (e) {
      setError(e.message)
      setPhase('challenge')
    }
  }

  function handleNext() {
    if (currentIdx + 1 >= dueWords.length) {
      fetchDue()
      setCurrentIdx(0)
    } else {
      setCurrentIdx(i => i + 1)
    }
    setPhase('idle')
    resetChallenge()
    resetCloze()
    setError('')
    setPhonetic(null)
  }

  function startShadowing(text) {
    setShadowingActive(true)
    setShadowingText(text)
    setShadowingScore(null)
    setRecognizedText('')
    setShadowingWordDiff([])
    // Fetch IPA phonetics for current word
    if (current?.vocab_master?.word_phrase) {
      const word = current.vocab_master.word_phrase.split(' ')[0]
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
        .then(r => r.json())
        .then(d => {
          const ph = d?.[0]?.phonetics?.find(p => p.text)?.text
          if (ph) setPhonetic(ph)
        })
        .catch(() => {})
    }
    // Auto-play TTS
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-US'
    speechSynthesis.cancel()
    speechSynthesis.speak(utt)
  }

  function startListening() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Rec) return
    setShadowingListening(true)
    setShadowingScore(null)
    setShadowingWordDiff([])
    const rec = new Rec()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.onresult = e => {
      const spoken = e.results[0][0].transcript.toLowerCase()
      setRecognizedText(spoken)
      const targetWords = shadowingText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
      const spokenWords = spoken.replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean)
      const diff = targetWords.map(w => ({ word: w, hit: spokenWords.includes(w) }))
      const hits = diff.filter(d => d.hit).length
      setShadowingScore(Math.round((hits / diff.length) * 100))
      setShadowingWordDiff(diff)
      setShadowingAttempts(a => a + 1)
      setShadowingListening(false)
    }
    rec.onerror = () => { setShadowingListening(false) }
    rec.onend = () => { setShadowingListening(false) }
    rec.start()
  }

  // ── Mode tabs config ──────────────────────────────────────────────
  const MODES = [
    { id: 'challenge', label: '✍️ Challenge' },
    { id: 'story', label: '📖 Story' },
    { id: 'cloze', label: '✏️ Cloze' },
    { id: 'grammar', label: '📏 Grammar' },
  ]

  const allClozeAnswered = clozeData && clozeData.blanks.every(b => (clozeAnswers[b.index] || '').trim())
  const allGrammarAnswered = grammarData && grammarData.exercises.every((_, i) => grammarAnswers[i] !== undefined)

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Review</h1>
          <p className="page-subtitle">Active recall through challenges. Spaced repetition keeps you sharp.</p>
        </div>
        {/* Mode toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {MODES.map(m => (
            <button
              key={m.id}
              id={`mode-${m.id}-btn`}
              onClick={() => {
                setMode(m.id)
                if (m.id !== 'story') setStoryContext(null)
                if (m.id !== 'grammar') { }
                setPhase('idle')
                resetChallenge()
                resetCloze()
                setError('')
              }}
              style={{
                padding: '4px 12px', borderRadius: 'var(--radius-full)', border: 'none',
                fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
                background: mode === m.id ? 'var(--clr-accent)' : 'var(--clr-bg-elevated)',
                color: mode === m.id ? '#fff' : 'var(--clr-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* ── GRAMMAR MODE — Independent of word queue ── */}
      {mode === 'grammar' && (
        <div className="animate-fade-in">
          {grammarLoading && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
              <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
              <p style={{ color: 'var(--clr-text-secondary)' }}>Analyzing your error patterns and generating exercises…</p>
            </div>
          )}
          {!grammarLoading && !grammarData && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
              <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>📏</div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Grammar Practice</div>
              <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 400, margin: '0 auto var(--space-6)' }}>
                AI will analyze your past errors and create targeted grammar exercises to fix your specific weaknesses.
              </p>
              <button className="btn btn-primary btn-lg" onClick={handleGenerateGrammar} id="start-grammar-btn">
                📏 Generate Grammar Drills
              </button>
            </div>
          )}
          {!grammarLoading && grammarData && (
            <div>
              <div className="card" style={{ marginBottom: 'var(--space-4)', borderLeft: '3px solid var(--clr-accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, marginBottom: 2 }}>GRAMMAR FOCUS</div>
                    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--clr-text-primary)' }}>{grammarData.grammar_topic}</div>
                    {grammarData.topic_explanation && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', marginTop: 4 }}>{grammarData.topic_explanation}</div>
                    )}
                  </div>
                  {grammarScore !== null && (
                    <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: grammarScore >= 80 ? 'var(--clr-success)' : grammarScore >= 60 ? 'var(--clr-warning)' : 'var(--clr-danger)' }}>
                        {grammarScore}%
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                        {grammarScore >= 80 ? '🎉 Excellent!' : grammarScore >= 60 ? '👍 Good job!' : '💪 Keep practicing!'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {grammarData.exercises.map((ex, i) => (
                <GrammarCard
                  key={i}
                  exercise={ex}
                  idx={i}
                  selected={grammarAnswers[i]}
                  onSelect={oi => setGrammarAnswers(prev => ({ ...prev, [i]: oi }))}
                  submitted={grammarSubmitted}
                />
              ))}

              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
                {!grammarSubmitted ? (
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={handleSubmitGrammar}
                    disabled={!allGrammarAnswered}
                    id="submit-grammar-btn"
                  >
                    ✅ Submit All
                  </button>
                ) : (
                  <button className="btn btn-secondary" onClick={handleGenerateGrammar} id="new-grammar-btn">
                    🔄 New Set of Drills
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VOCABULARY REVIEW MODES (Challenge / Story / Cloze) ── */}
      {mode !== 'grammar' && (
        <>
          {/* Cloze mode is independent — shows at top when active */}
          {mode === 'cloze' && (
            <>
              {(phase === 'idle' || phase === 'cloze-result') && phase !== 'cloze-generating' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)', marginBottom: 'var(--space-4)' }}>
                  {phase === 'idle' ? (
                    <>
                      <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>✏️</div>
                      <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Multi-Blank Cloze</div>
                      <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 420, margin: '0 auto var(--space-6)' }}>
                        AI creates a passage using your review words as blanks. Type each word from memory — no hints given!
                      </p>
                      <button className="btn btn-primary btn-lg" onClick={handleGenerateCloze} id="start-cloze-btn">
                        ✏️ Generate Cloze Passage
                      </button>
                    </>
                  ) : (
                    // Cloze result summary
                    clozeResults && (() => {
                      const correct = clozeResults.filter(r => r.passed).length
                      const total = clozeResults.length
                      const pct = Math.round((correct / total) * 100)
                      return (
                        <div className="animate-fade-in">
                          <div style={{ fontSize: 48, marginBottom: 'var(--space-3)' }}>{pct === 100 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
                          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)', color: pct === 100 ? 'var(--clr-success)' : pct >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)' }}>
                            {correct}/{total} Correct  ({pct}%)
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', textAlign: 'left', maxWidth: 360, margin: '0 auto var(--space-5)' }}>
                            {clozeResults.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                                <span style={{ color: r.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{r.passed ? '✓' : '✗'}</span>
                                <span style={{ color: 'var(--clr-text-secondary)' }}>Blank {r.index}:</span>
                                <span style={{ fontWeight: 700, color: r.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{r.userAnswer || '(empty)'}</span>
                                {!r.passed && <><span style={{ color: 'var(--clr-text-muted)' }}>→</span><span style={{ color: 'var(--clr-accent-light)', fontWeight: 700 }}>{r.target}</span></>}
                              </div>
                            ))}
                          </div>
                          <button className="btn btn-primary" onClick={handleGenerateCloze} id="next-cloze-btn">
                            🔄 New Passage
                          </button>
                        </div>
                      )
                    })()
                  )}
                </div>
              )}

              {phase === 'cloze-generating' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)', marginBottom: 'var(--space-4)' }}>
                  <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                  <p style={{ color: 'var(--clr-text-secondary)' }}>Generating your passage with multiple blanks…</p>
                </div>
              )}

              {phase === 'cloze' && clozeData && (
                <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                    <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>✏️ Fill in All Blanks</div>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>
                      {Object.values(clozeAnswers).filter(v => v.trim()).length}/{clozeData.blanks.length} filled
                    </span>
                  </div>

                  {/* Word bank — reference only */}
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 'var(--space-2)' }}>
                      📋 WORD BANK — type these into the correct blanks:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                      {clozeData.word_bank.map((w, i) => (
                        <span key={i} style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: 'var(--font-size-sm)', color: 'var(--clr-accent-light)', fontWeight: 600 }}>
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Passage with inline inputs */}
                  <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
                    <ClozePassage
                      passage={clozeData.passage}
                      blanks={clozeData.blanks}
                      answers={clozeAnswers}
                      onAnswerChange={(idx, val) => setClozeAnswers(prev => ({ ...prev, [idx]: val }))}
                      submitted={false}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                    <button className="btn btn-secondary" onClick={() => { setPhase('idle'); resetCloze() }}>Skip</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitCloze}
                      disabled={!allClozeAnswered || clozeSubmitting}
                      id="submit-cloze-btn"
                    >
                      {clozeSubmitting ? 'Checking…' : 'Check All Answers'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cloze checked — show passage with results inline */}
              {phase === 'cloze-result' && clozeData && clozeResults && (
                <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: '0 0 var(--space-3)' }}>📋 Results</div>
                    <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)' }}>
                      <ClozePassage
                        passage={clozeData.passage}
                        blanks={clozeData.blanks}
                        answers={clozeAnswers}
                        onAnswerChange={() => {}}
                        submitted={true}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Progress bar (only for challenge/story, not cloze) */}
          {mode !== 'cloze' && dueWords.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
              <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🎉</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>All caught up!</div>
              <p style={{ color: 'var(--clr-text-secondary)' }}>No words due for review right now. Come back later or add more to your Study List.</p>
            </div>
          ) : mode !== 'cloze' ? (
            <>
              {/* Progress */}
              <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ flex: 1, height: 6, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ width: `${((currentIdx) / dueWords.length) * 100}%`, height: '100%', background: 'var(--clr-accent-gradient)', borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
                  {currentIdx}/{dueWords.length} done
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                {current?.status === 'mastered' && (
                  <div style={{ borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(251,191,36,0.08)', borderLeft: '3px solid #f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🔧</span>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: '#f59e0b' }}>Maintenance Check</div>
                      <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 1 }}>This word is fully mastered. Periodic check — pass to confirm it's truly acquired. Fail → back to Reviewing.</div>
                    </div>
                  </div>
                )}

                {/* Word Card */}
                {current && (
                  <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</span>
                        <SpeakButton text={current.vocab_master.word_phrase} size="md" title="Listen to pronunciation" />
                        <span className="badge badge-accent">{current.vocab_master.type?.replace('_', ' ')}</span>
                        {current.vocab_master.domain && <span className="badge badge-muted">{current.vocab_master.domain}</span>}
                      </div>
                      {current.vocab_master.definition && (
                        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>{current.vocab_master.definition}</p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 4 }}>Mastery</div>
                      <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, background: 'var(--clr-accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{current.mastery_level}</div>
                    </div>
                  </div>
                )}

                {error && <div className="alert alert-danger">⚠️ {error}</div>}

                {/* Phase: idle */}
                {phase === 'idle' && (
                  <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
                    <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>✍️</div>
                    {mode === 'story' && storyContext && (
                      <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.7 }}>
                        <div style={{ fontWeight: 700, color: 'var(--clr-accent-light)', marginBottom: 4 }}>📖 Story so far…</div>
                        {storyContext.slice(0, 280)}{storyContext.length > 280 ? '…' : ''}
                      </div>
                    )}
                    <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)' }}>
                      {current?.status === 'mastered'
                        ? <>This is a <strong style={{ color: '#f59e0b' }}>Maintenance Review</strong>. Prove you still remember <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong> — use it correctly in context.</>
                        : mode === 'story'
                          ? storyContext
                            ? <>The story continues… use <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong> in the next scene.</>
                            : <>Start an epic story using <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong>.</>
                          : <>Your AI coach will create a real-world scenario for you to write a sentence using <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong>.</>
                      }
                    </p>
                    <button className="btn btn-primary btn-lg" onClick={handleGenerateChallenge} id="start-challenge-btn">
                      {mode === 'story' ? '📖 Continue Story' : '🎯 Start Challenge'}
                    </button>
                  </div>
                )}

                {/* Phase: generating */}
                {phase === 'generating' && (
                  <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                    <p style={{ color: 'var(--clr-text-secondary)' }}>Creating your challenge scenario…</p>
                  </div>
                )}

                {/* Phase: challenge */}
                {phase === 'challenge' && challenge && (
                  <div className="card">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                      <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>📋 Your Challenge Scenario</div>
                      <SpeakButton text={challenge.challenge_prompt} size="md" title="Listen to scenario" />
                    </div>
                    <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', lineHeight: 1.8, color: 'var(--clr-text-primary)' }}>
                      {challenge.challenge_prompt}
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="challenge-sentence">
                        Write 1–2 sentences using <span style={{ color: 'var(--clr-accent-light)', fontWeight: 700 }}>"{challenge.target_word}"</span>:
                      </label>
                      <textarea
                        id="challenge-sentence"
                        className="form-textarea"
                        style={{ minHeight: 100 }}
                        placeholder="Type your sentence here…"
                        value={userSentence}
                        onChange={e => setUserSentence(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                      <button className="btn btn-secondary" onClick={() => { setPhase('idle'); setChallenge(null) }}>Skip</button>
                      <button className="btn btn-primary" onClick={handleSubmitSentence} disabled={!userSentence.trim()} id="submit-challenge-btn">
                        Submit Answer
                      </button>
                    </div>
                  </div>
                )}

                {/* Phase: evaluating */}
                {phase === 'evaluating' && (
                  <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                    <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                    <p style={{ color: 'var(--clr-text-secondary)' }}>Your AI coach is grading your answer…</p>
                  </div>
                )}

                {/* Phase: result */}
                {phase === 'result' && evalResult && (
                  <div className="card animate-fade-in" style={{ borderColor: evalResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                      <div style={{ fontSize: 48 }}>{evalResult.passed ? '🎉' : '💪'}</div>
                      <div>
                        <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: evalResult.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                          {evalResult.passed ? 'Great job!' : 'Keep practicing!'}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
                          Score: <strong>{evalResult.score}/100</strong>
                        </div>
                      </div>
                    </div>
                    {evalResult.feedback && (
                      <div style={{ position: 'relative' }}>
                        <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8, color: 'var(--clr-text-secondary)' }}>
                          {evalResult.feedback}
                        </div>
                        <div style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)' }}>
                          <SpeakButton text={evalResult.feedback} title="Listen to feedback" />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                      <button className="btn btn-primary" onClick={handleNext} id="next-word-btn">
                        {currentIdx + 1 >= dueWords.length ? '✅ Finish Session' : 'Next Word →'}
                      </button>
                      {evalResult.feedback && !shadowingActive && (
                        <button className="btn btn-secondary" id="shadowing-mode-btn" onClick={() => startShadowing(evalResult.feedback)}>
                          🎙 Shadowing Mode
                        </button>
                      )}
                    </div>

                    {/* Shadowing Panel */}
                    {shadowingActive && (
                      <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--space-5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                          <div className="section-title" style={{ margin: 0 }}>🎙 Shadowing Practice</div>
                          {phonetic && (
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                              {current?.vocab_master.word_phrase} {phonetic}
                            </span>
                          )}
                          {shadowingAttempts > 0 && <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>Attempt {shadowingAttempts}/3</span>}
                        </div>
                        {shadowingWordDiff.length > 0 ? (
                          <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', lineHeight: 2, display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {shadowingWordDiff.map((item, i) => (
                              <span key={i} style={{ color: item.hit ? 'var(--clr-success)' : 'var(--clr-danger)', fontWeight: item.hit ? 400 : 600 }}>{item.word}</span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8, color: 'var(--clr-text-secondary)' }}>
                            {shadowingText}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => startShadowing(shadowingText)} id="replay-tts-btn">🔊 Replay Audio</button>
                          <button
                            className={`btn btn-sm ${shadowingListening ? 'btn-danger' : 'btn-primary'}`}
                            onClick={startListening}
                            disabled={shadowingListening || shadowingAttempts >= 3}
                            id="start-listening-btn"
                          >
                            {shadowingListening ? '⏺ Listening…' : '🎙 Speak Now'}
                          </button>
                          {shadowingAttempts >= 3 && <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', alignSelf: 'center' }}>Max attempts reached</span>}
                        </div>
                        {recognizedText && (
                          <div style={{ marginBottom: 'var(--space-4)' }}>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 4 }}>You said:</div>
                            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)', fontStyle: 'italic' }}>"{recognizedText}"</div>
                          </div>
                        )}
                        {shadowingScore !== null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, height: 8, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                              <div style={{ width: `${shadowingScore}%`, height: '100%', background: shadowingScore >= 70 ? 'var(--clr-success)' : shadowingScore >= 40 ? 'var(--clr-warning)' : 'var(--clr-danger)', borderRadius: 'var(--radius-full)', transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: shadowingScore >= 70 ? 'var(--clr-success)' : shadowingScore >= 40 ? 'var(--clr-warning)' : 'var(--clr-danger)' }}>{shadowingScore}%</div>
                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>{shadowingScore >= 70 ? '🎉 Excellent!' : shadowingScore >= 40 ? '👍 Good try!' : '💪 Try again!'}</div>
                          </div>
                        )}
                        {!window.SpeechRecognition && !window.webkitSpeechRecognition && (
                          <div className="alert alert-info" style={{ marginTop: 'var(--space-3)' }}>ℹ️ Speech recognition requires Chrome or Edge browser.</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  )
}
