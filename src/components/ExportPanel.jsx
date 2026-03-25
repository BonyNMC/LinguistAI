import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

// ── Helpers ──────────────────────────────────────────────────────────

function getDateRange(period) {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  const start = new Date(now)
  if (period === 'week') {
    // Monday of current week
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1
    start.setDate(now.getDate() - day)
    start.setHours(0, 0, 0, 0)
  } else if (period === '7days') {
    start.setDate(now.getDate() - 6)
    start.setHours(0, 0, 0, 0)
  } else if (period === '30days') {
    start.setDate(now.getDate() - 29)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'month') {
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else if (period === '3months') {
    start.setMonth(now.getMonth() - 2)
    start.setDate(1)
    start.setHours(0, 0, 0, 0)
  } else if (period === 'all') {
    return { start: null, end: null }
  }
  return { start, end }
}

function formatDateShort(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function estimateTokens(text) {
  // ~4 chars per token (rough GPT estimate)
  return Math.round(text.length / 4)
}

function formatTokenWarning(tokens) {
  if (tokens < 50000)  return { level: 'ok',     msg: `~${tokens.toLocaleString()} tokens — fits most AI context windows ✓` }
  if (tokens < 100000) return { level: 'warn',   msg: `~${tokens.toLocaleString()} tokens — large, may approach GPT-4 limits` }
  return                      { level: 'danger', msg: `~${tokens.toLocaleString()} tokens — likely exceeds most AI context windows ⚠️` }
}

function buildMarkdown({ writings, includeAnalysis, period, periodLabel }) {
  const header = [
    `# LinguistAI – Writing Export`,
    `**Period:** ${periodLabel}`,
    `**Entries:** ${writings.length}`,
    `**Exported:** ${new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`,
    includeAnalysis ? `**Content:** Raw writing + AI analysis` : `**Content:** Raw writing only`,
    '',
    '---',
    '',
    '> 💡 **Tip for AI analysis:** Paste this into ChatGPT or Gemini and ask:',
    '> *"Analyse the progression in my writing across these entries. What has improved? What patterns do you see?"*',
    '',
    '---',
    '',
  ].join('\n')

  const entries = writings.map((w, i) => {
    const date = new Date(w.created_at)
    const dateStr = date.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    const wordCount = w.writing_raw?.trim().split(/\s+/).length ?? 0
    const lines = [
      `## Entry ${String(i + 1).padStart(2, '0')} · ${dateStr} · ${wordCount} words`,
      '',
      w.writing_raw ?? '',
    ]
    if (includeAnalysis && w.writing_analysed) {
      const a = w.writing_analysed
      if (a.native_spoken_rewrite) {
        lines.push('', '**💬 Native Rewrite:**', '', a.native_spoken_rewrite)
      }
      if (a.recall_report) {
        lines.push('', '**🎯 AI Recall Report:**', '', a.recall_report)
      }
    }
    lines.push('', '---', '')
    return lines.join('\n')
  }).join('\n')

  return header + entries
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── PERIOD OPTIONS ────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: 'week',    label: 'This week' },
  { value: '7days',  label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: 'month',  label: 'This month' },
  { value: '3months',label: 'Last 3 months' },
  { value: 'all',    label: 'All time' },
]

// ── Main Export Panel ─────────────────────────────────────────────────
export default function ExportPanel({ currentText }) {
  const { session } = useAuth()
  const [period, setPeriod]               = useState('week')
  const [includeAnalysis, setIncAnalysis] = useState(false)
  const [loading, setLoading]             = useState(false)
  const [preview, setPreview]             = useState(null) // { count, tokens, warning }
  const [open, setOpen]                   = useState(false)

  async function fetchAndPreview() {
    setLoading(true)
    setPreview(null)
    const { start, end } = getDateRange(period)
    let query = supabase
      .from('user_writings')
      .select('id, writing_raw, writing_analysed, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
    if (start) query = query.gte('created_at', start.toISOString())
    if (end)   query = query.lte('created_at', end.toISOString())

    const { data, error } = await query
    setLoading(false)
    if (error) { alert('Error fetching writings: ' + error.message); return }

    const writings = data ?? []
    const { start: s, end: e } = getDateRange(period)
    const label = period === 'all'
      ? 'All time'
      : `${formatDateShort(s)} → ${formatDateShort(e)}`

    const md = buildMarkdown({ writings, includeAnalysis, period, periodLabel: label })
    const tokens = estimateTokens(md)
    const warning = formatTokenWarning(tokens)
    setPreview({ writings, count: writings.length, tokens, warning, md, label, start: s, end: e })
  }

  function handleDownload() {
    if (!preview) return
    const { start, end } = preview
    const fromStr = start ? isoDate(start) : 'all'
    const toStr   = end   ? isoDate(end)   : new Date().toISOString().slice(0, 10)
    const suffix  = includeAnalysis ? '_with-analysis' : ''
    const filename = `LinguistAI_${fromStr}_to_${toStr}_${preview.count}entries${suffix}.md`
    triggerDownload(preview.md, filename)
  }

  // Save current textarea text (even without API analysis)
  function handleSaveCurrent() {
    if (!currentText?.trim()) return
    const now = new Date()
    const dateStr = isoDate(now)
    const timeStr = now.toTimeString().slice(0, 5).replace(':', '-')
    const wordCount = currentText.trim().split(/\s+/).length
    const content = [
      `# LinguistAI – Writing Draft`,
      `**Saved:** ${now.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`,
      `**Words:** ${wordCount}`,
      '',
      '---',
      '',
      currentText,
    ].join('\n')
    triggerDownload(content, `LinguistAI_draft_${dateStr}_${timeStr}.md`)
  }

  return (
    <div className="export-panel card">
      {/* Header toggle */}
      <button
        className="export-panel-toggle"
        onClick={() => { setOpen(o => !o); setPreview(null) }}
        id="export-toggle-btn"
      >
        <span>📥</span>
        <span>Export My Writings</span>
        <span className="export-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="export-panel-body animate-fade-in">
          {/* Save current draft — always visible even without API */}
          {currentText?.trim() && (
            <div className="export-save-draft">
              <span className="export-draft-label">💾 Save current draft</span>
              <button
                className="btn btn-sm btn-secondary"
                onClick={handleSaveCurrent}
                id="save-draft-btn"
              >
                Download Draft (.md)
              </button>
            </div>
          )}

          <hr className="export-divider" />

          {/* Period filter */}
          <div className="export-row">
            <label className="form-label" htmlFor="export-period">Export period</label>
            <select
              id="export-period"
              className="form-select export-select"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPreview(null) }}
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Include analysis toggle */}
          <div className="export-checkbox-row">
            <label className="export-checkbox-label" htmlFor="export-analysis">
              <input
                id="export-analysis"
                type="checkbox"
                checked={includeAnalysis}
                onChange={e => { setIncAnalysis(e.target.checked); setPreview(null) }}
              />
              Include AI analysis (native rewrite + recall report)
            </label>
            <span className="export-hint">Default: raw writing only</span>
          </div>

          {/* Preview / Download */}
          {!preview ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={fetchAndPreview}
              disabled={loading}
              id="export-preview-btn"
            >
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Fetching…</> : '🔍 Preview & Check Size'}
            </button>
          ) : (
            <div className="export-preview">
              <div className={`export-token-badge token-${preview.warning.level}`}>
                {preview.warning.msg}
              </div>
              <div className="export-meta">
                <span>📄 {preview.count} entr{preview.count !== 1 ? 'ies' : 'y'}</span>
                <span>·</span>
                <span>{preview.label}</span>
              </div>
              {preview.count === 0 ? (
                <p className="export-empty">No writings found for this period.</p>
              ) : (
                <div className="export-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleDownload}
                    id="export-download-btn"
                  >
                    ⬇️ Download .md
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreview(null)}
                  >
                    Change filter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
