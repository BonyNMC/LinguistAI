# LinguistAI – Pedagogy & AI Integration Rules

## 🤖 AI Integration Architecture (Multi-Provider)
- **NEVER call LLM APIs from the frontend/browser directly.**
- ALL AI calls (Google, Groq, Cerebras, OpenRouter, Mistral, Cloudflare) go through Supabase Edge Functions.
- **Provider-Agnostic Engine**: Edge Functions use a unified `callLLM()` helper that translates to each provider's specific API format.
- **Secure Key Storage**: API keys are securely stored (`api_key_encrypted` via AES-256-GCM using Edge Function ENV `ENCRYPTION_SECRET`).
- **Internal JWT Validation**: Functions disable gateway `verify_jwt` and manually call `supabase.auth.getUser(token)` with the service role key to support modern `sb_publishable_*` keys.

## 🧠 Active Recall & Pedagogy Design
### SM-2 Focus Word Selection
- The `analyze-writing` Edge Function selects only the **top 5 priority words** for the Active Recall Report, ranked by:
  1. Lowest `mastery_level` first (least confident words)
  2. Earliest `next_review_due_at` (most overdue by SM-2 schedule)
- Remaining study words are still highlighted (green spans) in `analysed_text_marked_up`, but the Report only judges the 5 focus words to prevent fatigue.

### Recall Prompt Strategy
- Prompts for `analyze-writing` must contain explicit, multi-stage rules for `<span class='mark-recall'>` to prevent hallucination.
- Rules must handle: (1) exact matches only, (2) logic for correct vs. incorrect usage, and (3) a fallback for empty study lists.

### Native Rewrite = Comprehensible Input
- Instruct the AI to **naturally incorporate 1-2 of the session's focus words** into the rewrite where contextually appropriate.
- Concept: **Comprehensible Input (Krashen i+1)** (Learner sees their own study words used correctly in context) and **Output Hypothesis (Swain)**.

---

## 🎯 Phase 15 — Pedagogy Extensions

### CEFR Implicit Profiling
- Every call to `analyze-writing` and `analyze-conversation` returns `cefr_estimate` (A1–C2 string).
- The Edge Function updates `user_profiles.cefr_detected` using a **Weighted Moving Average**: old score weight caps at 9x, new sample is 1x. Prevents one outlier bài viết thay đổi level đột ngột.
- `cefr_confidence` increases linearly up to 100 (full confidence at 10 samples).
- **NEVER** manually hardcode a CEFR level into prompts — always read `cefr_detected` from DB at runtime.

### i+1 Input Hypothesis in Prompts
- Both `analyze-writing` and `generate-challenge` compute `i+1 = one CEFR level above cefr_detected`.
- Native rewrite vocabulary and challenge complexity should target this level.
- `generate-challenge` reads `cefr_detected`; if null, falls back to `target_level`.

### Affective Filter — Conversation Mode
- `chat-message` Edge Function: AI acts as a casual conversation partner.
- **STRICT RULE:** AI must NEVER correct grammar, vocabulary, or fluency during the chat phase. Not even implicitly.
- Corrections ONLY happen in `analyze-conversation` after the user submits the full session.
- `analyze-conversation` returns `error_highlights[]` with types: `grammar | vocab | phrasal_verb | idiom | linking_word`.

### Story Mode (Linked Challenges)
- `generate-challenge` supports `story_mode: bool` + `story_context: string|null`.
- First call: `story_context=null` → AI creates opening scene, returns `story_context`.
- Subsequent calls: pass previous `story_context` → AI continues the same narrative.
- Frontend holds `story_context` in React state. Reset on Finish Session or Story Mode toggle off.
- `story_context` is NOT persisted to DB — session-only state.

### Shadowing (Micro-Speech)
- After Review challenge result, learner can practice pronouncing the AI feedback.
- Uses **Web Speech API** (SpeechSynthesisUtterance for TTS, SpeechRecognition for input).
- Score = word overlap % between target text and recognized speech. Purely client-side, no backend.
- Only works on Chrome/Edge — show informational alert for unsupported browsers.
