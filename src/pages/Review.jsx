import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// ── SRS Status Lifecycle ─────────────────────────────────────────────────────
// new → learning (0–79) → reviewing (80–99) → mastered (100) → [maintenance]
//
// Maintenance Review (Ebbinghaus + SM-2 theory):
//   Even 'mastered' words are NOT immune to forgetting — they benefit from
//   ultra-long-interval review (every 90 days) to confirm true acquisition.
//   No AUTOMATIC score decay (demotivating, unfair for busy learners).
//   Decay only happens when the learner DEMONSTRATES forgetting by failing.
//
//   - Pass maintenance → stay mastered, schedule next maintenance in 90 days
//   - Fail maintenance → mastery drops to 70, status → 'reviewing'
//     (evidence-based: they forgot, must consolidate again)

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
    // Confirmed acquired → schedule next maintenance in 90 days
    nextDate.setDate(nextDate.getDate() + MAINTENANCE_INTERVAL_DAYS)
    return { mastery: 100, status: 'mastered', next_review_due_at: nextDate.toISOString() }
  } else {
    // Forgot → drop mastery, return to consolidation phase
    nextDate.setDate(nextDate.getDate() + 3)
    return { mastery: 70, status: 'reviewing', next_review_due_at: nextDate.toISOString() }
  }
}

export default function Review() {
  const { session } = useAuth()
  const [dueWords, setDueWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | generating | challenge | evaluating | result | cloze-generating | cloze | cloze-result
  const [challenge, setChallenge] = useState(null)
  const [userSentence, setUserSentence] = useState('')
  const [evalResult, setEvalResult] = useState(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('challenge') // 'challenge' | 'story' | 'cloze'
  const [storyContext, setStoryContext] = useState(null)
  const [shadowingActive, setShadowingActive] = useState(false)
  const [shadowingText, setShadowingText] = useState('')
  const [recognizedText, setRecognizedText] = useState('')
  const [shadowingScore, setShadowingScore] = useState(null)
  const [shadowingListening, setShadowingListening] = useState(false)
  const [shadowingWordDiff, setShadowingWordDiff] = useState([]) // [{word, hit: bool}]
  const [phonetic, setPhonetic] = useState(null) // IPA string for current word
  const [shadowingAttempts, setShadowingAttempts] = useState(0)
  const [clozeData, setClozeData] = useState(null)
  const [clozeInput, setClozeInput] = useState('')
  const [clozeResult, setClozeResult] = useState(null) // {passed, userAnswer, target}

  useEffect(() => { fetchDue() }, [session])

  async function fetchDue() {
    setLoading(true)
    const now = new Date().toISOString()

    // 1. Regular SRS queue: learning + reviewing words due now
    const { data: regularWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .in('status', ['learning', 'reviewing'])
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(20)

    // 2. Maintenance queue: mastered words due for periodic check (every 90 days)
    //    Max 3 per session to avoid overwhelming the learner.
    const { data: maintenanceWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .eq('status', 'mastered')
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(3)

    // Maintenance words go at the END of the queue (regular review first)
    const allDue = [...(regularWords || []), ...(maintenanceWords || [])]
    setDueWords(allDue)
    setLoading(false)
  }

  const current = dueWords[currentIdx]

  async function handleGenerateChallenge() {
    setPhase('generating')
    setError('')
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    setShadowingActive(false)
    setShadowingScore(null)
    setShadowingWordDiff([])
    setShadowingAttempts(0)
    setRecognizedText('')
    setClozeData(null)
    setClozeInput('')
    setClozeResult(null)
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
    setClozeData(null)
    setClozeInput('')
    setClozeResult(null)
    setShadowingActive(false)
    setShadowingScore(null)
    setShadowingWordDiff([])
    setShadowingAttempts(0)
    setRecognizedText('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-cloze', {
        body: { vocab_id: current.vocab_master.id }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setClozeData(data)
      setPhase('cloze')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
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
        update = {
          ...update,
          mastery_level: mastery,
          ef_factor: ef,
          repetitions: reps,
          next_review_due_at,
          times_used_in_writing: (current.times_used_in_writing || 0) + 1,
        }
        if (status) update.status = status
      }

      await supabase.from('user_vocab_progress').update(update).eq('id', current.id)
    } catch (e) {
      setError(e.message)
      setPhase('challenge')
    }
  }

  function handleSubmitCloze() {
    if (!clozeInput.trim() || !clozeData) return
    const userAns = clozeInput.trim().toLowerCase()
    const target = clozeData.target_word.toLowerCase()
    // Accept if exact match or edit distance 1 (typo tolerance)
    const editDist = (a, b) => {
      const m = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
      )
      for (let i = 1; i <= a.length; i++)
        for (let j = 1; j <= b.length; j++)
          m[i][j] = a[i-1] === b[j-1] ? m[i-1][j-1] : 1 + Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1])
      return m[a.length][b.length]
    }
    const passed = userAns === target || editDist(userAns, target) <= 1
    setClozeResult({ passed, userAnswer: clozeInput.trim(), target: clozeData.target_word })
    setPhase('cloze-result')

    // Update SRS same as challenge
    const quality = passed ? 4 : 1
    let update = { last_reviewed_at: new Date().toISOString() }
    if (current.status === 'mastered') {
      const { mastery, status, next_review_due_at } = calcMaintenanceResult(passed)
      update = { ...update, mastery_level: mastery, status, next_review_due_at }
    } else {
      const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
        current.mastery_level, quality, current.ef_factor, current.repetitions
      )
      update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at }
      if (status) update.status = status
    }
    supabase.from('user_vocab_progress').update(update).eq('id', current.id)
  }

  function handleNext() {
    if (currentIdx + 1 >= dueWords.length) {
      fetchDue()
      setCurrentIdx(0)
      if (mode === 'story') setStoryContext(null)
    } else {
      setCurrentIdx(i => i + 1)
    }
    setPhase('idle')
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    setError('')
    setShadowingActive(false)
    setShadowingScore(null)
    setShadowingWordDiff([])
    setShadowingAttempts(0)
    setRecognizedText('')
    setClozeData(null)
    setClozeInput('')
    setClozeResult(null)
  }

  function startShadowing(text) {
    setShadowingText(text)
    setShadowingActive(true)
    setShadowingScore(null)
    setShadowingWordDiff([])
    setRecognizedText('')
    setShadowingListening(false)
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-US'
    utt.rate = 0.85
    window.speechSynthesis.speak(utt)
    // Fetch IPA for current word
    const wordToFetch = current?.vocab_master?.word_phrase?.split(' ')[0]
    if (wordToFetch) {
      fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(wordToFetch)}`)
        .then(r => r.json())
        .then(d => {
          const ipa = d?.[0]?.phonetics?.find(p => p.text)?.text
          if (ipa) setPhonetic(ipa)
        })
        .catch(() => {})
    }
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setError('Speech recognition is not supported in this browser (Chrome/Edge only).'); return }
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 1
    setShadowingListening(true)
    setRecognizedText('')
    setShadowingScore(null)
    setShadowingWordDiff([])
    rec.onresult = (e) => {
      const spoken = e.results[0][0].transcript
      setRecognizedText(spoken)
      const targetWords = shadowingText.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).filter(Boolean)
      const spokenWords = spoken.toLowerCase().replace(/[^a-z\s]/g,'').split(/\s+/).filter(Boolean)
      const hits = spokenWords.filter(w => targetWords.includes(w)).length
      const score = targetWords.length > 0 ? Math.round((hits / targetWords.length) * 100) : 0
      setShadowingScore(score)
      // Word-level diff for highlighting
      const diff = targetWords.map(w => ({ word: w, hit: spokenWords.includes(w) }))
      setShadowingWordDiff(diff)
      setShadowingAttempts(a => a + 1)
      setShadowingListening(false)
    }
    rec.onerror = () => { setShadowingListening(false) }
    rec.onend = () => { setShadowingListening(false) }
    rec.start()
  }

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
        {/* Mode toggles */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {[{ id: 'challenge', label: '✍️ Challenge' }, { id: 'story', label: '📖 Story' }, { id: 'cloze', label: '✏️ Cloze' }].map(m => (
            <button
              key={m.id}
              id={`mode-${m.id}-btn`}
              onClick={() => { setMode(m.id); if (m.id !== 'story') setStoryContext(null) }}
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

      {dueWords.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🎉</div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>All caught up!</div>
          <p style={{ color: 'var(--clr-text-secondary)' }}>No words due for review right now. Come back later or add more to your Study List.</p>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ flex: 1, height: 6, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{ width: `${((currentIdx) / dueWords.length) * 100}%`, height: '100%', background: 'var(--clr-accent-gradient)', borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
              {currentIdx + 1} / {dueWords.length}
            </span>
          </div>

          {current && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Maintenance banner */}
              {current.status === 'mastered' && (
                <div style={{
                  borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)',
                  background: 'rgba(251,191,36,0.08)', borderLeft: '3px solid #f59e0b',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 18 }}>🔧</span>
                  <div>
                    <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: '#f59e0b' }}>Maintenance Check</div>
                    <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 1 }}>
                      This word is fully mastered. This is your periodic check — pass to confirm it’s truly acquired. Fail → back to Reviewing.
                    </div>
                  </div>
                </div>
              )}
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

              {error && <div className="alert alert-danger">⚠️ {error}</div>}

              {/* Phase: idle */}
              {phase === 'idle' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
                  <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>
                    {mode === 'cloze' ? '✏️' : '✍️'}
                  </div>
                  {mode === 'story' && storyContext && (
                    <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.7 }}>
                      <div style={{ fontWeight: 700, color: 'var(--clr-accent-light)', marginBottom: 4 }}>📖 Story so far…</div>
                      {storyContext.slice(0, 280)}{storyContext.length > 280 ? '…' : ''}
                    </div>
                  )}
                  {mode === 'cloze' && (
                    <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', maxWidth: 400, margin: '0 auto var(--space-4)' }}>
                      AI will give you a sentence with a blank. Fill in <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong> without being told what the word is.
                    </p>
                  )}
                  {mode !== 'cloze' && (
                    <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)' }}>
                      {current.status === 'mastered'
                        ? <>This is a <strong style={{ color: '#f59e0b' }}>Maintenance Review</strong>. Prove you still remember <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong> — use it correctly in context.</>
                        : mode === 'story'
                          ? storyContext
                            ? <>The story continues… use <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong> in the next scene.</>
                            : <>Start an epic story using <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong>.</>
                          : <>Your AI coach will create a real-world scenario for you to write a sentence using <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong>.</>
                      }
                    </p>
                  )}
                  <button
                    className="btn btn-primary btn-lg"
                    onClick={mode === 'cloze' ? handleGenerateCloze : handleGenerateChallenge}
                    id="start-challenge-btn"
                  >
                    {mode === 'story' ? '📖 Continue Story' : mode === 'cloze' ? '✏️ Start Cloze' : '🎯 Start Challenge'}
                  </button>
                </div>
              )}


              {/* Phase: generating */}
              {(phase === 'generating' || phase === 'cloze-generating') && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                  <p style={{ color: 'var(--clr-text-secondary)' }}>
                    {phase === 'cloze-generating' ? 'Creating your cloze exercise…' : 'Creating your challenge scenario…'}
                  </p>
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
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitSentence}
                      disabled={!userSentence.trim()}
                      id="submit-challenge-btn"
                    >
                      Submit Answer
                    </button>
                  </div>
                </div>
              )}

              {/* Phase: cloze */}
              {phase === 'cloze' && clozeData && (
                <div className="card">
                  <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0, marginBottom: 'var(--space-3)' }}>✏️ Fill in the Blank</div>
                  <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', lineHeight: 2, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)', marginBottom: 'var(--space-4)' }}>
                    {clozeData.cloze_text}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                      Hint: it's a <strong>{clozeData.hint_label}</strong>{clozeData.word_count > 1 ? ` (${clozeData.word_count} words)` : ''}
                    </span>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="cloze-input">Your answer:</label>
                    <input
                      id="cloze-input"
                      className="form-input"
                      placeholder={`Type the missing ${clozeData.hint_label}…`}
                      value={clozeInput}
                      onChange={e => setClozeInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && clozeInput.trim() && handleSubmitCloze()}
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                    <button className="btn btn-secondary" onClick={() => { setPhase('idle'); setClozeData(null) }}>Skip</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitCloze}
                      disabled={!clozeInput.trim()}
                      id="submit-cloze-btn"
                    >
                      Check Answer
                    </button>
                  </div>
                </div>
              )}

              {/* Phase: cloze-result */}
              {phase === 'cloze-result' && clozeResult && (
                <div className="card animate-fade-in" style={{ borderColor: clozeResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: 48 }}>{clozeResult.passed ? '🎉' : '💪'}</div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: clozeResult.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                        {clozeResult.passed ? 'Correct!' : 'Not quite!'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
                        The answer was: <strong style={{ color: 'var(--clr-accent-light)' }}>{clozeResult.target}</strong>
                        {!clozeResult.passed && <> — you wrote: <em style={{ color: 'var(--clr-danger)' }}>{clozeResult.userAnswer}</em></>}
                      </div>
                    </div>
                  </div>
                  {clozeData?.definition && (
                    <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
                      💡 <strong>{clozeResult.target}</strong>: {clozeData.definition}
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleNext} id="next-word-btn">
                    {currentIdx + 1 >= dueWords.length ? '✅ Finish Session' : 'Next Word →'}
                  </button>
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
                      {currentIdx + 1 >= dueWords.length ? '\u2705 Finish Session' : 'Next Word \u2192'}
                    </button>
                    {evalResult.feedback && !shadowingActive && (
                      <button className="btn btn-secondary" id="shadowing-mode-btn" onClick={() => startShadowing(evalResult.feedback)}>
                        🎙 Shadowing Mode
                      </button>
                    )}
                  </div>

                  {shadowingActive && (
                    <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--space-5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                        <div className="section-title" style={{ margin: 0 }}>🎙 Shadowing Practice</div>
                        {phonetic && (
                          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                            {current.vocab_master.word_phrase} {phonetic}
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
          )}
        </>
      )}
    </div>
  )
}
