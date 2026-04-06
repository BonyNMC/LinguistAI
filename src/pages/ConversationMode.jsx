import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// ── sessionStorage keys ──────────────────────────────────────────
const SS_SESSION_ID = 'linguist_conv_session_id'
const SS_MESSAGES   = 'linguist_conv_messages'
const SS_ANALYSIS   = 'linguist_conv_analysis'
const SS_PHASE      = 'linguist_conv_phase'

function readSS(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeSS(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const ERROR_TYPES = {
  grammar:      { label: 'Grammar',      color: 'var(--clr-danger)',  bg: 'rgba(239,68,68,0.1)' },
  vocab:        { label: 'Vocabulary',   color: 'var(--clr-warning)', bg: 'rgba(245,158,11,0.1)' },
  phrasal_verb: { label: 'Phrasal Verb', color: 'var(--clr-accent)',  bg: 'rgba(99,102,241,0.1)' },
  idiom:        { label: 'Idiom',        color: 'var(--clr-success)', bg: 'rgba(34,197,94,0.1)' },
  linking_word: { label: 'Linking Word', color: '#a78bfa',            bg: 'rgba(167,139,250,0.1)' },
}

// ── Message bubble ────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 'var(--space-3)' }}>
      {!isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius-full)', flexShrink: 0,
          background: 'var(--clr-accent-gradient)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, marginRight: 8, alignSelf: 'flex-end',
        }}>🤖</div>
      )}
      <div style={{
        maxWidth: '72%',
        background: isUser ? 'var(--clr-accent-gradient)' : 'var(--clr-bg-elevated)',
        color: isUser ? '#fff' : 'var(--clr-text-primary)',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        padding: 'var(--space-3) var(--space-4)',
        fontSize: 'var(--font-size-sm)',
        lineHeight: 1.7,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        {msg.content}
        {!isUser && <div style={{ marginTop: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <SpeakButton text={msg.content} title="Listen to this message" />
        </div>}
      </div>
      {isUser && (
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius-full)', flexShrink: 0,
          background: 'var(--clr-bg-elevated)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 14, marginLeft: 8, alignSelf: 'flex-end',
        }}>👤</div>
      )}
    </div>
  )
}

// ── Error highlight card ──────────────────────────────────────────
function ErrorCard({ item, onAdd, added }) {
  const style = ERROR_TYPES[item.type] || ERROR_TYPES.grammar
  return (
    <div style={{
      borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
      background: style.bg, borderLeft: `3px solid ${style.color}`,
      marginBottom: 'var(--space-3)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-2)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: style.color, background: style.bg, padding: '2px 8px', borderRadius: 99 }}>
          {style.label}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        <span style={{ textDecoration: 'line-through', color: 'var(--clr-danger)', fontSize: 'var(--font-size-sm)' }}>"{item.original}"</span>
        <span style={{ color: 'var(--clr-text-muted)' }}>→</span>
        <span style={{ color: 'var(--clr-success)', fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>"{item.corrected}"</span>
        <SpeakButton text={item.corrected} title={`Listen: "${item.corrected}"`} />
      </div>
      {item.explanation && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', margin: 0 }}>{item.explanation}</p>
      )}
    </div>
  )
}

// ── Vocab suggestion card ─────────────────────────────────────────
function VocabCard({ word, onAdd, added }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 700, color: 'var(--clr-text-primary)' }}>{word.word}</span>
        <SpeakButton text={word.word} title={`Listen to "${word.word}"`} />
        <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>{(word.type || 'vocab').replace('_', ' ')}</span>
      </div>
      <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-3)' }}>{word.definition}</p>
      <button
        className={`btn btn-sm ${added ? 'btn-secondary' : 'btn-primary'}`}
        onClick={() => !added && onAdd(word)}
        disabled={added}
        id={`add-conv-word-${word.word?.replace(/\s+/g, '-')}`}
      >
        {added ? '✓ Added' : '+ Add to Study List'}
      </button>
    </div>
  )
}

// ── Analysis Panel ────────────────────────────────────────────────
function AnalysisPanel({ analysis, onAddWord, addedWords }) {
  if (!analysis) return null
  const cefrColors = { A1:'#6ee7b7', A2:'#34d399', B1:'#60a5fa', B2:'#818cf8', C1:'#c084fc', C2:'#f472b6' }
  const level = analysis.cefr_estimate
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

      {/* CEFR + Strengths */}
      <div className="card" style={{ borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          {level && (
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{
                width: 72, height: 72, borderRadius: 'var(--radius-full)',
                background: `radial-gradient(circle, ${cefrColors[level] || '#818cf8'}, rgba(99,102,241,0.7))`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--font-size-xl)', fontWeight: 800, color: '#fff',
                boxShadow: `0 0 20px ${cefrColors[level] || '#818cf8'}66`,
              }}>{level}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 4 }}>Estimated</div>
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div className="section-title" style={{ color: 'var(--clr-success)' }}>💪 What you're doing well</div>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7, margin: 0 }}>
              {analysis.strengths}
            </p>
          </div>
        </div>
      </div>

      {/* Improvement areas */}
      {analysis.improvement_areas?.length > 0 && (
        <div className="card">
          <div className="section-title">🎯 Areas to Improve</div>
          <ol style={{ margin: 0, paddingLeft: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {analysis.improvement_areas.map((area, i) => (
              <li key={i} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>{area}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Error highlights */}
      {analysis.error_highlights?.length > 0 && (
        <div>
          <div className="section-title">✍️ Language Corrections</div>
          {analysis.error_highlights.map((item, i) => (
            <ErrorCard key={i} item={item} />
          ))}
        </div>
      )}

      {/* Vocab suggestions */}
      {analysis.vocabulary_suggestions?.length > 0 && (
        <div>
          <div className="section-title">✨ Vocabulary to Learn</div>
          <div className="grid-2">
            {analysis.vocabulary_suggestions.map((w, i) => (
              <VocabCard key={i} word={w} onAdd={onAddWord} added={addedWords.has(w.word)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main ConversationMode ─────────────────────────────────────────
export default function ConversationMode() {
  const { session } = useAuth()

  const [phase, setPhase]           = useState(() => readSS(SS_PHASE, 'chat'))  // 'chat' | 'analysis'
  const [sessionId, setSessionId]   = useState(() => readSS(SS_SESSION_ID, null))
  const [messages, setMessages]     = useState(() => readSS(SS_MESSAGES, []))
  const [analysis, setAnalysis]     = useState(() => readSS(SS_ANALYSIS, null))
  const [input, setInput]           = useState('')
  const [sending, setSending]       = useState(false)
  const [analyzing, setAnalyzing]   = useState(false)
  const [error, setError]           = useState('')
  const [addedWords, setAddedWords] = useState(new Set())
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  // Persist to sessionStorage
  useEffect(() => { writeSS(SS_PHASE, phase) }, [phase])
  useEffect(() => { writeSS(SS_SESSION_ID, sessionId) }, [sessionId])
  useEffect(() => { writeSS(SS_MESSAGES, messages) }, [messages])
  useEffect(() => { writeSS(SS_ANALYSIS, analysis) }, [analysis])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function ensureSession() {
    if (sessionId) return sessionId
    const { data, error: e } = await supabase
      .from('conversation_sessions')
      .insert({ user_id: session.user.id, messages: [] })
      .select('id').single()
    if (e) throw new Error('Failed to create session: ' + e.message)
    setSessionId(data.id)
    return data.id
  }

  async function handleSend() {
    if (!input.trim() || sending) return
    const userMsg = { role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setSending(true)
    setError('')

    try {
      const sid = await ensureSession()
      const { data, error: fnErr } = await supabase.functions.invoke('chat-message', {
        body: { session_id: sid, message: userMsg.content, messages_history: messages }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMessages(data.messages || newMessages)
    } catch (e) {
      setError(e.message || 'Failed to send message.')
      setMessages(newMessages) // keep user message even on error
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  async function handleFinishAndAnalyze() {
    if (messages.length === 0) return
    setAnalyzing(true)
    setError('')
    try {
      const sid = await ensureSession()
      const { data, error: fnErr } = await supabase.functions.invoke('analyze-conversation', {
        body: { session_id: sid }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setAnalysis(data)
      setPhase('analysis')
    } catch (e) {
      setError(e.message || 'Analysis failed.')
    } finally {
      setAnalyzing(false)
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
    } catch (e) {
      setError('Failed to add word: ' + e.message)
    }
  }

  function handleNewConversation() {
    setMessages([])
    setAnalysis(null)
    setSessionId(null)
    setPhase('chat')
    setError('')
    setAddedWords(new Set())
    ;[SS_SESSION_ID, SS_MESSAGES, SS_ANALYSIS, SS_PHASE].forEach(k => sessionStorage.removeItem(k))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const userMessageCount = messages.filter(m => m.role === 'user').length

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Conversation Mode</h1>
          <p className="page-subtitle">Chat naturally in English — get detailed language analysis after.</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginLeft: 'auto', flexWrap: 'wrap' }}>
          {phase === 'chat' && messages.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleFinishAndAnalyze}
              disabled={analyzing || userMessageCount < 1}
              id="finish-analyze-btn"
              title={userMessageCount < 1 ? 'Send at least one message first' : ''}
            >
              {analyzing ? <><span className="spinner" /> Analyzing…</> : '🔍 Finish & Analyze'}
            </button>
          )}
          {phase === 'analysis' && (
            <button className="btn btn-secondary" onClick={() => setPhase('chat')} id="back-to-chat-btn">
              ← Back to Chat
            </button>
          )}
          {(messages.length > 0 || analysis) && (
            <button className="btn btn-ghost" onClick={handleNewConversation} id="new-conversation-btn">
              🔄 New Conversation
            </button>
          )}
        </div>
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* ── Chat Phase ── */}
      {phase === 'chat' && (
        <>
          {messages.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)', marginBottom: 'var(--space-4)' }}>
              <div style={{ fontSize: 56, marginBottom: 'var(--space-4)' }}>💬</div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-3)' }}>Start a conversation</div>
              <p style={{ color: 'var(--clr-text-secondary)', maxWidth: 480, margin: '0 auto var(--space-4)' }}>
                Write anything in English. Talk about your day, your work, any topic. The AI won't correct you mid-chat — just enjoy the conversation!
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'center' }}>
                {['Tell me about your current project at work.', 'What are your goals for learning English?', 'Describe a challenge you faced recently.'].map(s => (
                  <button key={s} className="btn btn-ghost btn-sm" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="card" style={{
              padding: 'var(--space-5)', marginBottom: 'var(--space-4)',
              maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column',
            }}>
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {sending && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-3)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--clr-accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
                  <div style={{ background: 'var(--clr-bg-elevated)', borderRadius: '18px 18px 18px 4px', padding: '12px 16px' }}>
                    <div className="spinner" style={{ width: 16, height: 16 }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input bar */}
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                id="chat-input"
                className="form-textarea"
                style={{
                  flex: 1, minHeight: 56, maxHeight: 160, border: 'none',
                  padding: 0, background: 'transparent', resize: 'none',
                  fontSize: 'var(--font-size-sm)', lineHeight: 1.7,
                }}
                placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
              />
              <button
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                id="send-message-btn"
                style={{ flexShrink: 0, alignSelf: 'flex-end' }}
              >
                {sending ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '↑ Send'}
              </button>
            </div>
            {userMessageCount > 0 && (
              <div style={{ marginTop: 'var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                  {userMessageCount} message{userMessageCount !== 1 ? 's' : ''} sent
                </span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                  Ready to analyze? Click <strong>Finish & Analyze</strong> above.
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Analysis Phase ── */}
      {phase === 'analysis' && (
        <>
          {analyzing ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
              <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto var(--space-4)' }} />
              <p style={{ color: 'var(--clr-text-secondary)' }}>Your AI coach is analyzing the conversation…</p>
            </div>
          ) : (
            <AnalysisPanel analysis={analysis} onAddWord={handleAddWord} addedWords={addedWords} />
          )}
        </>
      )}
    </div>
  )
}
