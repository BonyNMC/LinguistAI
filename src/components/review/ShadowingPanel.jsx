import { useState } from 'react'

/**
 * ShadowingPanel: Speech practice panel with word-level diff, IPA, max 3 attempts.
 * Owns all shadowing-related state internally.
 */
export default function ShadowingPanel({ feedbackText, currentWord, onClose }) {
  const [shadowingText, setShadowingText] = useState(feedbackText || '')
  const [recognizedText, setRecognizedText] = useState('')
  const [shadowingScore, setShadowingScore] = useState(null)
  const [shadowingWordDiff, setShadowingWordDiff] = useState([])
  const [shadowingListening, setShadowingListening] = useState(false)
  const [phonetic, setPhonetic] = useState(null)
  const [shadowingAttempts, setShadowingAttempts] = useState(0)
  const [active, setActive] = useState(false)

  function startShadowing(text) {
    setActive(true)
    setShadowingText(text)
    setShadowingScore(null)
    setRecognizedText('')
    setShadowingWordDiff([])
    // Fetch IPA phonetics for current word
    if (currentWord) {
      const word = currentWord.split(' ')[0]
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

  if (!active) {
    return (
      <button className="btn btn-secondary" id="shadowing-mode-btn" onClick={() => startShadowing(feedbackText)}>
        🎙 Shadowing Mode
      </button>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-5)', borderTop: '1px solid var(--clr-border)', paddingTop: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <div className="section-title" style={{ margin: 0 }}>🎙 Shadowing Practice</div>
        {phonetic && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)', background: 'rgba(99,102,241,0.1)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
            {currentWord} {phonetic}
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
  )
}
