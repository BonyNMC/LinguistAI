import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

const LLM_PROVIDERS = {
  google: {
    label: '✨ Google Gemini',
    badge: 'Recommended',
    badgeType: 'success',
    apiKeyLabel: 'Google AI Studio API Key',
    apiKeyLink: 'https://aistudio.google.com/app/apikey',
    apiKeyPlaceholder: 'AIza••••••••••••••••••••••••',
    models: [
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', tier: 'Free', desc: 'Fast & smart, free tier' },
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', tier: 'Free', desc: 'Fastest, lowest latency' },
      { value: 'gemini-2.5-pro-preview-03-25', label: 'Gemini 2.5 Pro Preview', tier: 'Paid', desc: 'Best quality (paid tier)' },
      { value: 'gemini-2.0-pro-exp', label: 'Gemini 2.0 Pro Exp', tier: 'Paid', desc: 'Premium experimental' },
    ],
  },
  groq: {
    label: '⚡ Groq',
    badge: 'Free',
    badgeType: 'accent',
    apiKeyLabel: 'Groq API Key',
    apiKeyLink: 'https://console.groq.com/keys',
    apiKeyPlaceholder: 'gsk_••••••••••••••••••••••••',
    models: [
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tier: 'Free', desc: '14,400 req/day free' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', tier: 'Free', desc: 'Ultra-fast, high limits' },
      { value: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 (Llama 70B)', tier: 'Free', desc: 'Reasoning model' },
      { value: 'qwen-qwq-32b', label: 'Qwen QwQ 32B', tier: 'Free', desc: 'Strong reasoning & writing' },
      { value: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', tier: 'Free', desc: 'Latest Llama 4 model' },
    ],
  },
  cerebras: {
    label: '🧠 Cerebras',
    badge: 'Free',
    badgeType: 'accent',
    apiKeyLabel: 'Cerebras API Key',
    apiKeyLink: 'https://cloud.cerebras.ai/',
    apiKeyPlaceholder: 'csk-••••••••••••••••••••••••',
    models: [
      { value: 'llama3.3-70b', label: 'Llama 3.3 70B', tier: 'Free', desc: '14k req/day, very fast' },
      { value: 'qwen-3-235b', label: 'Qwen 3 235B', tier: 'Free', desc: 'Massive model, free' },
      { value: 'llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', tier: 'Free', desc: 'Latest multimodal model' },
    ],
  },
  openrouter: {
    label: '🌐 OpenRouter',
    badge: 'Free Tier',
    badgeType: 'accent',
    apiKeyLabel: 'OpenRouter API Key',
    apiKeyLink: 'https://openrouter.ai/settings/keys',
    apiKeyPlaceholder: 'sk-or-v1-••••••••••••••••••••',
    models: [
      { value: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B (Free)', tier: 'Free', desc: 'Google Gemma 3, no cost' },
      { value: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick (Free)', tier: 'Free', desc: 'Meta Llama 4, free tier' },
      { value: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (Free)', tier: 'Free', desc: 'Very capable, free' },
      { value: 'microsoft/mai-ds-r1:free', label: 'MAI-DS-R1 (Free)', tier: 'Free', desc: 'Microsoft reasoning model' },
      { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'Paid', desc: 'Premium via OpenRouter' },
    ],
  },
  mistral: {
    label: '🌀 Mistral',
    badge: '1B tokens/mo free',
    badgeType: 'success',
    apiKeyLabel: 'Mistral API Key',
    apiKeyLink: 'https://console.mistral.ai/api-keys/',
    apiKeyPlaceholder: '••••••••••••••••••••••••••',
    models: [
      { value: 'mistral-small-latest', label: 'Mistral Small', tier: 'Free', desc: '1B tokens/month free' },
      { value: 'open-mistral-nemo', label: 'Mistral Nemo', tier: 'Free', desc: 'Open model, generous free tier' },
      { value: 'mistral-large-latest', label: 'Mistral Large', tier: 'Paid', desc: 'Best Mistral model' },
      { value: 'codestral-latest', label: 'Codestral', tier: 'Free (beta)', desc: 'Specialized for code' },
    ],
  },
  cloudflare: {
    label: '☁️ Cloudflare Workers AI',
    badge: '10k req/day free',
    badgeType: 'accent',
    apiKeyLabel: 'Cloudflare API Token',
    apiKeyLink: 'https://dash.cloudflare.com/profile/api-tokens',
    apiKeyPlaceholder: '••••••••••••••••••••••••••',
    models: [
      { value: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B (Fast)', tier: 'Free', desc: '10k neurons/day' },
      { value: '@cf/qwen/qwen2.5-72b-instruct', label: 'Qwen 2.5 72B', tier: 'Free', desc: 'Strong multilingual model' },
      { value: '@cf/mistral/mistral-7b-instruct-v0.2', label: 'Mistral 7B v0.2', tier: 'Free', desc: 'Reliable, fast inference' },
    ],
  },
}

export default function Settings() {
  const { session } = useAuth()
  const [profile, setProfile] = useState({
    target_level: 'B2',
    ai_persona: 'A native-speaking professional coach',
    focus_topic: 'General Professional English',
    llm_provider: 'google',
    llm_model: 'gemini-2.0-flash',
    cefr_detected: null,
    cefr_confidence: 0,
    writing_samples_count: 0,
  })
  const [apiKey, setApiKey] = useState('')
  const [cfAccountId, setCfAccountId] = useState('')
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null)
  const [keyMsg, setKeyMsg] = useState(null)
  const [publicProfile, setPublicProfile] = useState({ display_name: '', show_on_leaderboard: true })
  const [savingPublic, setSavingPublic] = useState(false)
  const [publicMsg, setPublicMsg] = useState(null)

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('target_level, ai_persona, focus_topic, llm_provider, llm_model, cefr_detected, cefr_confidence, writing_samples_count')
        .eq('id', session.user.id)
        .single()
      if (!error && data) setProfile(prev => ({ ...prev, ...data }))

      // Load public profile
      const { data: pub } = await supabase
        .from('user_public_profiles')
        .select('display_name, show_on_leaderboard')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (pub) setPublicProfile({ display_name: pub.display_name || '', show_on_leaderboard: pub.show_on_leaderboard ?? true })

      setLoadingProfile(false)
    }
    loadProfile()
  }, [session])

  function handleProviderChange(newProvider) {
    const firstModel = LLM_PROVIDERS[newProvider]?.models[0]?.value ?? ''
    setProfile(p => ({ ...p, llm_provider: newProvider, llm_model: firstModel }))
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await supabase
      .from('user_profiles')
      .update({
        target_level: profile.target_level,
        ai_persona: profile.ai_persona,
        focus_topic: profile.focus_topic,
        llm_provider: profile.llm_provider,
        llm_model: profile.llm_model,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id)
    setSavingProfile(false)
    if (!error) {
      // Clear Daily Mission cache so it regenerates with the new focus_topic/persona
      sessionStorage.removeItem('linguist_daily_mission')
    }
    setProfileMsg(error
      ? { type: 'danger', text: error.message }
      : { type: 'success', text: '✅ Settings saved! Your Daily Mission will refresh with the new topic.' }
    )
    setTimeout(() => setProfileMsg(null), 4000)
  }

  async function handleSaveApiKey(e) {
    e.preventDefault()
    const keyToSave = profile.llm_provider === 'cloudflare'
      ? `${cfAccountId}::${apiKey.trim()}`
      : apiKey.trim()
    if (!keyToSave) return
    setSavingKey(true)
    setKeyMsg(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke('save-api-key', {
        body: { raw_api_key: keyToSave }
      })
      if (fnError) throw fnError
      if (data?.error) throw new Error(data.error)
      setApiKey('')
      setCfAccountId('')
      setKeyMsg({ type: 'success', text: `🔐 ${LLM_PROVIDERS[profile.llm_provider]?.label} API key saved securely!` })
    } catch (err) {
      setKeyMsg({ type: 'danger', text: err.message })
    } finally {
      setSavingKey(false)
      setTimeout(() => setKeyMsg(null), 6000)
    }
  }

  const currentProvider = LLM_PROVIDERS[profile.llm_provider]
  const currentModels = currentProvider?.models ?? []
  const currentModel = currentModels.find(m => m.value === profile.llm_model)

  if (loadingProfile) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Customize your AI coach and manage your account.</p>
        </div>
      </div>

      {/* ── Section A: AI Coach Customization ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
          <div style={{ fontSize: 24 }}>🎭</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>Your AI Coach Customization</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)' }}>Shape how your AI coach speaks and what context it uses.</div>
          </div>
          <span className="badge badge-success" style={{ marginLeft: 'auto' }}>Editable</span>
        </div>

        <form onSubmit={handleSaveProfile}>
          <div className="form-group">
            <label className="form-label" htmlFor="ai-persona">
              AI Persona <span className="form-label-sub">— Who is your AI coach?</span>
            </label>
            <input id="ai-persona" className="form-input"
              value={profile.ai_persona}
              onChange={e => setProfile(p => ({ ...p, ai_persona: e.target.value }))}
              placeholder="e.g. A strict British university professor" />
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 4 }}>
              Examples: "A friendly IT team leader" · "A strict British professor"
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="focus-topic">
              Current Focus Topic <span className="form-label-sub">— What domain are you writing in?</span>
            </label>
            <input id="focus-topic" className="form-input"
              value={profile.focus_topic}
              onChange={e => setProfile(p => ({ ...p, focus_topic: e.target.value }))}
              placeholder="e.g. Lean Six Sigma manufacturing" />
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 4 }}>
              Examples: "Agile software engineering" · "Marketing &amp; brand strategy"
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="target-level">Target CEFR Level</label>
            <select id="target-level" className="form-select"
              value={profile.target_level}
              onChange={e => setProfile(p => ({ ...p, target_level: e.target.value }))}>
              {CEFR_LEVELS.map(l => (
                <option key={l} value={l}>{l}{l === 'B2' ? ' (Recommended – Professional)' : ''}</option>
              ))}
            </select>
          </div>

          {/* ── AI Provider + Model ── */}
          <div style={{ borderTop: '1px solid var(--clr-border)', marginTop: 'var(--space-5)', paddingTop: 'var(--space-5)' }}>
            <div style={{ fontWeight: 600, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 8 }}>
              🤖 AI Provider &amp; Model
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 400 }}>— Choose your LLM engine</span>
            </div>

            {/* Provider grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              {Object.entries(LLM_PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleProviderChange(key)}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    borderRadius: 'var(--radius-md)',
                    border: profile.llm_provider === key
                      ? '2px solid var(--clr-accent)' : '1px solid var(--clr-border)',
                    background: profile.llm_provider === key
                      ? 'rgba(99,102,241,0.12)' : 'var(--clr-bg-raised)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all .15s',
                  }}
                >
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--clr-text-primary)', marginBottom: 4 }}>{p.label}</div>
                  <span className={`badge badge-${p.badgeType}`} style={{ fontSize: 10 }}>{p.badge}</span>
                </button>
              ))}
            </div>

            {/* Model selector */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="llm-model">Model</label>
              <select id="llm-model" className="form-select"
                value={profile.llm_model}
                onChange={e => setProfile(p => ({ ...p, llm_model: e.target.value }))}>
                {currentModels.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label} [{m.tier}] — {m.desc}
                  </option>
                ))}
              </select>
              {currentModel && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`badge badge-${currentModel.tier === 'Free' ? 'success' : 'warning'}`}>
                    {currentModel.tier}
                  </span>
                  <code style={{ fontSize: 11, background: 'var(--clr-bg-raised)', padding: '2px 8px', borderRadius: 4, color: 'var(--clr-text-muted)' }}>
                    {profile.llm_model}
                  </code>
                </div>
              )}
            </div>
          </div>

          {profileMsg && <div className={`alert alert-${profileMsg.type}`} style={{ marginTop: 'var(--space-4)' }}>{profileMsg.text}</div>}

          <button id="save-profile-btn" type="submit" className="btn btn-primary"
            style={{ marginTop: 'var(--space-5)' }} disabled={savingProfile}>
            {savingProfile ? <><span className="spinner" /> Saving…</> : '💾 Save Preferences'}
          </button>
        </form>
      </div>

      {/* ── Section B: System Lock Notice ── */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>🔒</div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--clr-warning)', marginBottom: 4 }}>System-Locked Prompt Logic</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', lineHeight: 1.7 }}>
              JSON output format, CEFR evaluation rules, and your active recall word list are managed automatically to ensure stable, structured AI responses.
            </div>
          </div>
          <span className="badge badge-warning" style={{ marginLeft: 'auto', flexShrink: 0 }}>System Managed</span>
        </div>
      </div>

      {/* ── Section B2: CEFR Language Profile ── */}
      {profile.writing_samples_count >= 1 && (
        <div className="card" style={{ marginBottom: 'var(--space-6)', borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <div style={{ fontSize: 24 }}>🎯</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>Your Language Profile</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)' }}>Detected automatically from your writing samples.</div>
            </div>
            <span className="badge badge-accent" style={{ marginLeft: 'auto' }}>AI Detected</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
            {/* CEFR Badge */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: 'var(--radius-full)',
                background: 'var(--clr-accent-gradient)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: '#fff',
                boxShadow: '0 0 24px rgba(99,102,241,0.4)',
              }}>
                {profile.cefr_detected || '?'}
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 6 }}>Detected Level</div>
            </div>

            {/* Stats */}
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-3)' }}>
                Based on <strong style={{ color: 'var(--clr-text-primary)' }}>{profile.writing_samples_count}</strong> writing {profile.writing_samples_count === 1 ? 'sample' : 'samples'} analyzed.
              </div>
              {/* Confidence bar */}
              <div style={{ marginBottom: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>Confidence</span>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-accent-light)' }}>
                    {profile.cefr_confidence < 100 ? `${profile.cefr_confidence}%` : '✓ High'}
                  </span>
                </div>
                <div style={{ height: 6, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ width: `${profile.cefr_confidence}%`, height: '100%', background: 'var(--clr-accent-gradient)', borderRadius: 'var(--radius-full)', transition: 'width 0.6s ease' }} />
                </div>
              </div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.6 }}>
                {profile.cefr_confidence < 30
                  ? '⚡ More writing samples will improve accuracy.'
                  : profile.cefr_confidence < 70
                    ? '📈 Profile is stabilizing. Keep writing!'
                    : '🎉 Profile is well-established.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Section C: API Key for Selected Provider ── */}
      <div className="card" style={{ borderColor: 'rgba(99,102,241,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <div style={{ fontSize: 24 }}>🔑</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>{currentProvider?.apiKeyLabel ?? 'API Key'}</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)' }}>
              For <strong>{currentProvider?.label}</strong> · Encrypted on server, never stored in plain text
            </div>
          </div>
          {currentProvider?.apiKeyLink && (
            <a href={currentProvider.apiKeyLink} target="_blank" rel="noopener noreferrer"
              className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>
              Get Key ↗
            </a>
          )}
        </div>

        <div className="card" style={{ background: 'var(--clr-bg-base)', marginBottom: 'var(--space-5)', padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.8 }}>
            🛡️ <strong style={{ color: 'var(--clr-text-secondary)' }}>Security Flow:</strong> HTTPS → AES-256-GCM encryption on server → stored as ciphertext. Decrypted only inside the Edge Function at call time.
          </div>
        </div>

        <form onSubmit={handleSaveApiKey}>
          {profile.llm_provider === 'cloudflare' && (
            <div className="form-group">
              <label className="form-label" htmlFor="cf-account-id">Cloudflare Account ID</label>
              <input id="cf-account-id" className="form-input" type="text"
                placeholder="abcdef1234567890abcdef1234567890"
                value={cfAccountId} onChange={e => setCfAccountId(e.target.value)} autoComplete="off" />
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 4 }}>
                Found in Cloudflare Dashboard → right sidebar
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="provider-api-key">API Key</label>
            <input id="provider-api-key" className="form-input" type="password"
              placeholder={currentProvider?.apiKeyPlaceholder ?? '••••••••••••••••••••'}
              value={apiKey} onChange={e => setApiKey(e.target.value)} autoComplete="off" />
          </div>

          {keyMsg && <div className={`alert alert-${keyMsg.type}`}>{keyMsg.text}</div>}

          <button id="save-api-key-btn" type="submit" className="btn btn-primary"
            disabled={savingKey || !apiKey.trim() || (profile.llm_provider === 'cloudflare' && !cfAccountId.trim())}>
            {savingKey ? <><span className="spinner" /> Securing key…</> : `🔐 Save ${currentProvider?.label ?? ''} Key`}
          </button>
        </form>
      </div>

      {/* ── Section D: Leaderboard Identity ── */}
      <div className="card" style={{ marginTop: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
          <div style={{ fontSize: 24 }}>🏆</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--font-size-lg)' }}>Leaderboard Identity</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)' }}>Control how you appear in the Leaderboard.</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="display-name">Display Name</label>
          <input
            id="display-name" className="form-input"
            value={publicProfile.display_name}
            onChange={e => setPublicProfile(p => ({ ...p, display_name: e.target.value }))}
            placeholder={session.user.email?.split('@')[0] || 'Your name'}
            maxLength={32}
          />
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 4 }}>Leave blank to use your email prefix. Max 32 characters.</div>
        </div>

        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 0 }}>
          <input
            type="checkbox" id="show-on-leaderboard"
            checked={publicProfile.show_on_leaderboard}
            onChange={e => setPublicProfile(p => ({ ...p, show_on_leaderboard: e.target.checked }))}
            style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
          />
          <label htmlFor="show-on-leaderboard" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', cursor: 'pointer' }}>
            Show me on the Leaderboard
          </label>
        </div>

        {publicMsg && <div className={`alert alert-${publicMsg.type}`} style={{ marginTop: 'var(--space-4)' }}>{publicMsg.text}</div>}

        <button
          id="save-public-profile-btn" className="btn btn-primary"
          style={{ marginTop: 'var(--space-5)' }}
          disabled={savingPublic}
          onClick={async () => {
            setSavingPublic(true)
            setPublicMsg(null)
            const { error } = await supabase
              .from('user_public_profiles')
              .upsert({
                user_id: session.user.id,
                display_name: publicProfile.display_name.trim() || null,
                show_on_leaderboard: publicProfile.show_on_leaderboard,
                updated_at: new Date().toISOString()
              }, { onConflict: 'user_id' })
            setSavingPublic(false)
            setPublicMsg(error
              ? { type: 'danger', text: error.message }
              : { type: 'success', text: '✅ Leaderboard identity saved!' }
            )
            setTimeout(() => setPublicMsg(null), 3000)
          }}
        >
          {savingPublic ? <><span className="spinner" /> Saving…</> : '🏆 Save Leaderboard Identity'}
        </button>
      </div>
    </div>
  )
}
