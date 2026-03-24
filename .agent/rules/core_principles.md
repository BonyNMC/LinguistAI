# LinguistAI – Core Principles & Architectural Decisions

> **READ THIS FILE FIRST** before starting any new task. It contains critical architectural rules and user preferences that MUST be respected. Never override these without explicit user approval.

---

## 🏗️ Architecture Decisions

### Supabase Project
- **Project Name**: LinguistAI (SEPARATE from the "Portfolio" project)
- **Region**: To be confirmed after creation
- **Strict isolation**: All DB schema, Auth, Edge Functions, and storage are on the LinguistAI project only. Do NOT intermix with Portfolio.

### Frontend Stack
- **Framework**: React + Vite
- **Routing**: React Router v6
- **Styling**: Vanilla CSS only (NO Tailwind unless user explicitly requests)
- **Font**: Inter from Google Fonts
- **Design**: Premium, modern, dark mode, glassmorphism/micro-animations

### AI Integration (Multi-Provider)
- **NEVER call LLM APIs from the frontend/browser directly.**
- ALL AI calls (Google, Groq, Cerebras, OpenRouter, Mistral, Cloudflare) go through Supabase Edge Functions.
- **Provider-Agnostic Engine**: Edge Functions use a unified `callLLM()` helper that translates to each provider's specific API format.
- **Secure Key Storage**: API keys are stored ENCRYPTED (`api_key_encrypted` in `user_profiles`).
- **Encryption Secret**: Lives ONLY in the Edge Function environment variable (`ENCRYPTION_SECRET`). AES-256-GCM is used.
- **Internal JWT Validation**: Functions disable gateway `verify_jwt` and manually call `supabase.auth.getUser(token)` with the service role key. This supports modern `sb_publishable_*` keys which can cause 401s at the gateway.
- **Recall Prompt Strategy**: Prompts for `analyze-writing` must contain explicit, multi-stage rules for `<span class='mark-recall'>` to prevent hallucination. Rules must handle: (1) exact matches only, (2) logic for correct vs. incorrect usage, and (3) a fallback for empty study lists.

### Frontend Performance & Persistence
- **Writing Space State Persistence**: Use `sessionStorage` to preserve raw text, analysis results, and error states across internal tab navigation (React Router unmounting).
- **Session Cleanup**: Persistence is only cleared on explicit user "Clear" clicks or full tab/window closure.

---

## 🗄️ Database Schema (Canonical Reference)

### `user_profiles`
- `id` (uuid, PK, FK → auth.users.id)
- `target_level` (text, default 'B2') — CEFR scale: A1, A2, B1, B2, C1, C2
- `ai_persona` (text)
- `focus_topic` (text)
- `llm_provider` (text, default 'google') — e.g. google, groq, cerebras, openrouter, mistral, cloudflare
- `llm_model` (text, default 'gemini-2.0-flash')
- `api_key_encrypted` (text)
- `role` (text, default 'student') — CHECK: 'admin' | 'student'
- `account_status` (text, default 'pending') — CHECK: 'pending' | 'active' | 'suspended'

... [remaining tables: vocab_master, user_vocab_progress, user_writings unchanged]

---

## ⚡ Edge Functions (4 total — KEEP SEPARATE)

### 1. `save-api-key`
- Input: `{ raw_api_key }`
- Encrypts and saves to `user_profiles.api_key_encrypted`.
- Critical: Disables gateway JWT check; validates internally.

### 2. `analyze-writing`
- Input: `{ writing_text }`
- Hybrid Prompt + Multi-Provider support via `callLLM()`.
- Returns: `{ analysed_text_marked_up, recall_report, native_spoken_rewrite, new_vocabulary_suggestions }`

### 3. `generate-challenge` (Review Step 1)
- Fetches word + profile → `callLLM()` → scenario.
- Returns: `{ challenge_prompt, target_word }`

### 4. `evaluate-challenge` (Review Step 2)
- Evaluates sentence → SM-2 progression.
- Returns: `{ passed: bool, score: int, feedback: string }`

---

## 📅 Change Log

| Date | Decision |
|------|----------|
| 2026-03-23 | Confirmed isolated project "LinguistAI". |
| 2026-03-23 | Multi-Provider Support added: Groq, Cerebras, OpenRouter, Mistral, Cloudflare, Google. |
| 2026-03-23 | Fixed 401 Unauthorized by disabling gateway JWT verification and using internal token validation. |
| 2026-03-23 | Database updated: `llm_provider` added, `gemini_model` renamed to `llm_model`. |
| 2026-03-23 | Implemented explicit Recall Prompt Strategy to fix AI hallucinations in marking study words. |
| 2026-03-23 | Added `sessionStorage` persistence to Writing Space to survive component unmounting. |
| 2026-03-24 | **Phase 11**: Transitioned to commercial BYOK course app. Added `role` and `account_status` to `user_profiles`. |
| 2026-03-24 | New sign-up default: `role='student'`, `account_status='pending'`. All new users locked until admin activates. |
| 2026-03-24 | Admin bootstrap: first admin set manually via SQL in Supabase Dashboard. No self-service promotion. |
| 2026-03-24 | WaitingRoom page: authenticated `pending`/`suspended` users hard-redirected here, cannot access core pages. |
| 2026-03-24 | All 4 Edge Functions now check `account_status = 'active'`; return HTTP 403 for non-active users. |

---

## 🔐 Commercial Access Model (Phase 11)

- **BYOK**: Users provide their own API key. No credit system.
- **Access Gate**: `account_status` controls access. Defaults to `pending` on sign-up.
- **Roles**: `admin` (platform owner) and `student`. Admin manually set via SQL.
- **WaitingRoom**: The only page available to `pending`/`suspended` users. Shows purchase/wait instructions including: *"If you have already purchased the course, please allow up to 24 hours for account activation."*
- **Edge Function Gate**: Every Edge Function validates `account_status = 'active'` after JWT check before processing.



---

## ??? Text-to-Speech (Phase 12)

Web Speech API is used for TTS � zero cost, zero external dependency, works natively in Chrome/Edge/Safari.

**Implementation:**
- `src/components/SpeakButton.jsx` exports `useSpeech()` hook and `<SpeakButton text="..." />` component
- Always cancel previous utterance before starting a new one (`window.speechSynthesis.cancel()`)
- Default: `lang="en-US"`, `rate=0.9`

**TTS placements:**
- Writing Space: Native Rewrite section (?? medium button) + each suggested vocab card
- Review: Word phrase card (?? medium), challenge prompt (?? medium), AI feedback (?? inline)
- Study List: Each word phrase row

## ?? Mobile Responsive (Phase 12)

- **= 640px**: Sidebar hides behind hamburger (?) button in a fixed top bar. Overlay closes sidebar on tap. `.mobile-topbar` shown, `.sidebar` slides from left.
- **= 900px**: Narrow sidebar (200px), single-column grids.
- Tables scroll horizontally via `.data-table-wrapper` and `.admin-table-wrapper`.
- All nav items call `closeMenu()` on click to close sidebar after navigation.

---

## ?? Active Recall & Pedagogy Design (Phase 12)

### SM-2 Focus Word Selection
The `analyze-writing` Edge Function selects only the **top 5 priority words** for the Active Recall Report, ranked by:
1. Lowest `mastery_level` first (least confident words)
2. Earliest `next_review_due_at` (most overdue by SM-2 schedule)

This prevents recall fatigue as the vocabulary list grows. The remaining study words are still highlighted (green spans) in the Analysed Text, but the Report only judges the 5 focus words.

### Native Rewrite = Vocabulary Model (Comprehensible Input)
The Native Rewrite prompt instructs the AI to **naturally incorporate 1-2 of the session's focus words** into the rewrite � only where contextually appropriate. This implements:
- **Comprehensible Input (Krashen i+1)**: Learner sees their own study words used correctly in a native-speaker model of their real work context
- **Output Hypothesis (Swain)**: Writing forces the brain to search for opportunities to use vocabulary ? deeper consolidation
- **Spaced Repetition (SM-2)**: Only the most-due words are surfaced each session

### HTML Safety Rule
`recall_report` and `native_spoken_rewrite` are PLAIN TEXT fields � no HTML spans.
Only `analysed_text_marked_up` may contain HTML (mark-error, mark-recall, mark-suggestion spans).
Frontend enforces this with a `stripHtml()` sanitizer in WritingSpace.jsx as a safety net.

| 2026-03-24 | Implemented SM-2 focus word selection (top 5) for Active Recall Report. Updated Native Rewrite to model study vocabulary in context. Added HTML sanitization for plain-text fields. |
