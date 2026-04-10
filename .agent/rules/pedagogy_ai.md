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

### Vocabulary Suggestion Generation (MANDATORY — 2-step logic)
- Both `analyze-writing` (v20+) and `analyze-conversation` (v7+) use a **2-step approach** for `new_vocabulary_suggestions` / `vocabulary_suggestions`:
  - **STEP 1 — Error-linked items (highest priority)**: After identifying `error_highlights`, for every error whose type is `vocab`, `phrasal_verb`, `idiom`, or `linking_word`, add the **corrected form** as a vocabulary suggestion. These are the most pedagogically important items — the learner made these exact mistakes and should add them to their Study List.
  - **STEP 2 — Elevation items**: After error-linked items, add additional new words/phrases targeting i+1 CEFR complexity to help the learner grow beyond their current level. Total array: 4–6 items.
- **Type diversity rule** (across ALL items combined): MUST include at least 1 `phrasal_verb`, 1 `linking_word`, and 1 `idiom`.
- Valid types: `vocab` | `phrasal_verb` | `idiom` | `linking_word`
- ⚠️ `linking_word` (discourse connectors: *however, moreover, in contrast*) ≠ `linking_verb` (grammar term for BE/seem/appear). The former is correct.
- ⚠️ The DB constraint `vocab_master_type_check` only allows `linking_word`. Using `linking_verb` causes a DB insert error.
- ⚠️ Field 7 (`error_highlights`) prompt must explicitly remind the AI: "The corrected forms of vocab/phrasal_verb/idiom/linking_word errors MUST flow into vocabulary_suggestions."

### `creditVocabUsage()` — Mastery Credit on Usage (Phase 16)
- Both `analyze-writing` (v15+) and `analyze-conversation` (v2+) call this shared helper after AI analysis completes.
- **Logic**: Fetch all user words with `status IN ('learning', 'reviewing', 'new')`. For each word, perform a **case-insensitive whole-word regex match** against the user's text. If matched:
  - `mastery_level` += 10 (capped at 100)
  - `next_review_due_at` = now + `floor(mastery/20)` days (min 1 day)
  - `status` → `'reviewing'` if mastery ≥ 80; otherwise `'learning'`
- Returns `credited_words[]` array included in API response.
- **Frontend**: `AnalysisPanel` (ConversationMode) and `AnalysisResult` (WritingSpace) show a green **"🏅 Mastery Credited!"** banner listing credited words when `credited_words.length > 0`.
- This is a **reward-only** mechanism — no mastery is deducted here. Full SM-2 evaluation still happens in Review via `evaluate-challenge`.

### SRS Status Lifecycle (4-Stage Pipeline)
The vocabulary mastery system follows a strict 4-stage lifecycle:
```
new → learning (0–79) → reviewing (80–99) → mastered (100) → [maintenance loop]
```
- **`learning`** (0–79): Actively memorizing. Reviewed frequently via SM-2.
- **`reviewing`** (80–99): High retention, consolidation phase. Longer intervals. Can be reached via SM-2 or `creditVocabUsage()`.
- **`mastered`** (100): Fully acquired through repeated successful retrieval. Earned via SM-2 `calcNextReview`.
- **`suspended`**: User-paused word. Excluded from all queues.

**Status Transitions:**
- Pass SRS review at mastery 80-99 → stays `reviewing`, interval increases
- Pass SRS review at mastery ≥ 100 → `mastered`
- Fail SRS review at mastery < 10 → `learning` (lapsed)
- `creditVocabUsage()` in writing/conversation: mastery ≥ 80 → `reviewing`; otherwise `learning`

**Maintenance Review (Phase 19 — Ebbinghaus + SM-2):**
- Even `mastered` words are NOT immune to forgetting. No AUTOMATIC score decay (demotivating for busy learners).
- `mastered` words re-enter the Review queue every **90 days** (`MAINTENANCE_INTERVAL_DAYS = 90`).
- Max **3 maintenance words per session** (appended after regular queue) to avoid overwhelming learners.
- **Pass maintenance** → stay `mastered`, schedule next check in 90 days.
- **Fail maintenance** → mastery drops to **70**, status → `reviewing`, next review in 3 days.
- UI: A yellow **"🔧 Maintenance Check"** banner appears on the word card for `mastered` words.
- Logic: `calcMaintenanceResult(passed: bool)` — separate from `calcNextReview()` (no SM-2 EF progression).

### Native Rewrite = Comprehensible Input
- Instruct the AI to **naturally incorporate 1-2 of the session's focus words** into the rewrite where contextually appropriate.
- Concept: **Comprehensible Input (Krashen i+1)** (Learner sees their own study words used correctly in context) and **Output Hypothesis (Swain)**.

### Metalinguistic Feedback & Explanations (Phase 18)
- The AI MUST provide explicit, rule-based grammatical or pragmatic explanations for every correction. It is not enough to just provide the "Corrected" version. 
- The `explanation` field in `error_highlights` fosters "Aha!" moments by revealing *why* the learner's usage was wrong.

### Contextual Tone & Register Evaluation (Phase 18)
- Language appropriateness depends entirely on context (e.g. casual chat vs. formal email). Both `analyze-writing` and `analyze-conversation` accept an optional `scenario_context` parameter string.
- The AI evaluates whether the register is appropriate for the given context, returning a `tone_evaluation` JSON block with feedback.

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

---

## 🌍 Phase 20 — Focus Topic & Mission Content Rules

### `focus_topic` Fallback (MANDATORY)
- When `profile.focus_topic` is **empty or not set**, Edge Functions MUST NOT default to `'General professional English'` — this biases all generated content toward work/office scenarios.
- **Correct fallback**: `'everyday life, hobbies, travel, and personal experiences'`
- This applies to: `generate-challenge` (v10+), `generate-daily-mission` (v2+), `chat-message`.

### `generate-daily-mission` Prompt Rules
- The prompt MUST include a `CRITICAL RULES` section explicitly stating: *do NOT default to office/work/business scenarios unless the learner's stated focus area is professional/work-related.*
- The generated `topic` MUST reflect the actual `focus_topic`, not a generic work fallback.

### Daily Mission Cache Invalidation
- `DailyVocabMissions.jsx` caches the mission in `sessionStorage` key `linguist_daily_mission` for the session.
- `Settings.jsx` **MUST** call `sessionStorage.removeItem('linguist_daily_mission')` on successful profile save (`handleSaveProfile`) so the new `focus_topic`/`ai_persona` takes effect immediately next time the user visits Writing or Conversation.

---

## 📖 Phase 21 — Tier 1: Graded Reading

### i+1 Reading Passage Generation
- `generate-reading` always targets **CEFR i+1** (one level above `cefr_detected`). Never i+2 or same level.
- The passage must **naturally embed** 2–3 of the user's current study words. The words must fit organically — never forced.
- 3 comprehension question types (MANDATORY): factual (directly stated), vocabulary-in-context, inference (reading between the lines).
- sessionStorage key `linguist_reading_session` caches the current reading session across React Router unmounts.

### Error Pattern Intelligence (Stats Page)
- Aggregates `error_highlights[]` from last 30 analyzed `user_writings` and `conversation_sessions`.
- Grouping by `type` (grammar/vocab/phrasal_verb/idiom/linking_word) reveals systemic weaknesses.
- Top 5 recurring specific errors are shown as `original → corrected` pairs.
- **Pure client-side** — no new API call. Data already exists from analyze-writing/analyze-conversation.

---

## ✏️ Phase 21 — Tier 1: Contextual Cloze Review

### Cloze Principles
- `generate-cloze` creates 2–3 sentences where the target word is replaced by `_____` (5 underscores).
- Context must provide enough inference for an attentive learner to guess the blank.
- **Typo tolerance**: frontend accepts user input where Levenshtein edit distance ≤ 1 from target (catches minor typos, not wild guesses).
- Cloze results update SRS (SM-2) the same as challenge mode.

---

## 🎙️ Phase 21 — Tier 2: Enhanced Shadowing

### Word-Level Diff
- After SpeechRecognition captures spoken input, compute word-level diff vs. target text.
- Each word color-coded: **green** = hit (spoken correctly), **red** = miss.
- IPA phonetic tooltip fetched from `https://api.dictionaryapi.dev/api/v2/entries/en/{word}` (free, no key needed). Fetched on `startShadowing()`.
- Max **3 attempts** per shadowing session — prevents infinite loop frustration.

---

## ✍️ Phase 21 — Tier 2: Writing Genre Scaffolding

### Genre Rules
- `GENRES` constant in `WritingSpace.jsx` defines 6 genres: General, Formal Email, Opinion Essay, Narrative, Product Review, Argument.
- **Selecting a genre**: auto-fills `scenarioContext` with `"This is a [Genre]. Please evaluate accordingly."` (only if scenarioContext is currently empty).
- **Structure outline + useful phrases** expand below genre selector.
- **Clickable phrases** insert into the textarea at current cursor position (appended to text).
- `genre` field is sent to `analyze-writing` via body — the Edge Function uses it in the `scenarioInstruction` to evaluate genre-appropriate register.
- ⚠️ `GENRES` is static frontend data — never stored in DB or Edge Functions.

