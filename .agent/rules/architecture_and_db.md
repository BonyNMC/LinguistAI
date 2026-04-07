# LinguistAI – Architecture & Database Rules

## 🏗️ Technical Foundation
- **Supabase Project Name**: LinguistAI (SEPARATE from the "Portfolio" project).
- **Strict isolation**: All DB schema, Auth, Edge Functions, and storage are on the LinguistAI project only. Do NOT intermix with Portfolio.

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

## ⚡ Edge Functions (4 total — KEEP SEPARATE)
### 1. `save-api-key`
- Input: `{ raw_api_key }`
- Encrypts and saves to `user_profiles.api_key_encrypted`.
- Critical: Disables gateway JWT check; validates internally.

### 2. `analyze-writing` (v15 current)
- Input: `{ writing_text }`
- Hybrid Prompt + Multi-Provider support via `callLLM()`.
- After analysis: calls `creditVocabUsage()` to award +10 mastery for each study word found in the writing text.
- Returns: `{ analysed_text_marked_up, recall_report, native_spoken_rewrite, new_vocabulary_suggestions, cefr_estimate, credited_words[] }`

### 3. `generate-challenge` (Review Step 1)
- Fetches word + profile → `callLLM()` → scenario.
- Returns: `{ challenge_prompt, target_word }`

### 4. `evaluate-challenge` (Review Step 2)
- Evaluates sentence → SM-2 progression.
- Returns: `{ passed: bool, score: int, feedback: string }`

## 🔐 Commercial Access Model (BYOK)
- **BYOK**: Users provide their own API key. No credit system.
- **Access Gate**: `account_status` controls access. Defaults to `pending` on sign-up.
- **Roles**: `admin` (platform owner) and `student`. Admin manually set via SQL.
- **WaitingRoom**: The only page available to `pending`/`suspended` users. Shows purchase/wait instructions including: *"If you have already purchased the course, please allow up to 24 hours for account activation."*
- **Edge Function Gate**: Every Edge Function validates `account_status = 'active'` after internal JWT check before processing (returns HTTP 403 for non-active).

---

## 🗄️ Phase 15 — Additional DB Schema

### `user_profiles` (updated columns)
- `cefr_detected` (text, nullable) — AI-detected CEFR level: A1–C2
- `cefr_confidence` (int, default 0) — 0–100, increases with more samples
- `writing_samples_count` (int, default 0) — Total analyzed writing/conversation samples

### `conversation_sessions` (NEW)
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users.id, CASCADE)
- `title` (text, nullable) — AI-generated from analysis
- `messages` (jsonb, default `[]`) — Each item: `{ role: 'user'|'ai', content: text, timestamp: ISO }`
- `analysis` (jsonb, nullable) — Full `analyze-conversation` result
- `created_at`, `updated_at` (timestamptz)
- RLS: user sees own rows only

### `user_public_profiles` (NEW)
- `user_id` (uuid, PK, FK → auth.users.id)
- `display_name` (text, nullable) — Shown on Leaderboard; falls back to email prefix
- `show_on_leaderboard` (boolean, default true) — Privacy opt-out
- `updated_at` (timestamptz)
- RLS: user can write own row; all authenticated users can SELECT

### `leaderboard` (VIEW)
- Aggregates `user_vocab_progress`, `conversation_sessions`, `user_writings` per user
- Only includes `account_status = 'active'` AND `show_on_leaderboard = true`
- Key columns: `username`, `cefr_detected`, `target_level`, `total_mastery_points`, `words_mastered`, `total_activity_count`

## ⚡ Edge Functions (Phase 15 additions)

### 5. `chat-message` (NEW)
- Input: `{ session_id, message, messages_history[] }`
- AI replies as a natural conversation partner. **NEVER corrects grammar mid-chat.** Appends messages to `conversation_sessions`.
- Output: `{ reply: text, messages: updated_array }`

### 6. `analyze-conversation` (v2 current)
- Input: `{ session_id }`
- Reads all messages, analyzes ONLY [Learner] turns.
- After analysis: calls `creditVocabUsage()` to award +10 mastery for each study word found in the learner's messages.
- Returns: `{ cefr_estimate, strengths, improvement_areas[], error_highlights[], vocabulary_suggestions[], title, credited_words[] }`
- Also updates `user_profiles.cefr_detected` via Weighted Moving Average.

### Updated: `analyze-writing` (v14)
- Now returns `cefr_estimate` field.
- Updates `user_profiles` CEFR columns after each analysis.
- Prompt now uses `cefr_detected` + i+1 hypothesis for native rewrite and vocab suggestions.

### Updated: `generate-challenge` (v9)
- New optional params: `story_mode: bool`, `story_context: text|null`
- When `story_mode=true`: generates/continues a linked narrative across challenges.
- Returns `story_context` field for frontend to persist per session.

## ⚡ Edge Functions (Phase 16 additions)

### 7. `generate-daily-mission` (NEW)
- Input: none (reads user from JWT)
- Queries `user_vocab_progress` joined with `vocab_master`: top 5 rows ordered by `mastery_level ASC`, `next_review_due_at ASC` — same SM-2 priority as Active Recall.
- Only considers words with `status IN ('learning', 'reviewing')`.
- Calls LLM to generate a `{ topic, prompt }` — a mission briefing that naturally frames the context so the user practices the weak words.
- Fallback (no words): returns a generic intro mission with `no_words: true`.
- Output: `{ mission_words[], topic, prompt, no_words }`.
