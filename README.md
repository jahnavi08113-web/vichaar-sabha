# Vichaar Sabha — frontend demo

An interactive, cinematic courtroom for ideas. **Paksh** argues for the idea, **Vipaksh** challenges it, and the **Judge** closes with a conditional verdict and one next experiment.

> This is a frontend-only demo. Every hearing is **scripted**, so nothing evaluates your idea live. Custom briefs get a generic, illustrative hearing.

## Run it

- **Quickest:** open `dist/index.html` in any modern browser. It's fully self-contained (artwork, CSS and JS inlined) and needs no network.
- **Develop:** Node 20+
  ```bash
  npm install
  npm run dev      # http://localhost:5173 — rebuilds when src/ changes (refresh to see it)
  npm run build    # writes dist/index.html
  ```

## What's inside

| Path | Purpose |
| --- | --- |
| `src/main.jsx` | App: welcome, scene camera, cards, speech bubble, dock, dialogs, keyboard |
| `src/data.js` | Roles, objection types, three sample cases + custom-idea script |
| `src/icons.jsx` | Interface icons and role seals (plus / star / slash) |
| `src/styles.css` | Glassmorphism UI, day/evening themes, motion, responsive rules |
| `public/assets/` | Original generated courtroom and character portraits (WebP) |
| `build.mjs` / `server.mjs` | esbuild bundle into a single HTML file; tiny preview server |

## Interactions

- **Welcome:** a short letterboxed intro, then *Enter the courtroom*.
- **Hearing:** five timed statements (about 8 s each) followed by the verdict. The camera pans and zooms toward whoever is speaking, with a ring and nameplate cue.
- **Controls:** Begin / Pause / Resume, Next, Replay, and the progress steps (click any step to jump). Keyboard: `Space` plays or pauses, `→` skips to the next statement.
- **Object:** challenge any advocate's claim as *demand unproven*, *alternative missing* or *practical risk*. The Judge gives a ruling, and it's added to the notes and transcript.
- **Record:** the composer adds notes or links. The paperclip, or *Evidence*, attaches files, which are listed by name only.
- **Cases:** *Edit brief* opens the docket. Pick one of four samples or enter your own idea.
- **Approval & plan:** the *Print & collect* sample ends in an approved verdict with a four-week starter plan and revisit conditions, and its objections can be overruled when the evidence already answers them.
- **Cast:** click a character or nameplate to see their profile.
- **Verdict:** possibility, open risk, next experiment, and the conditions that would change it. You can export the hearing as Markdown or copy it.
- **Settings:** day/evening light; optional sound cues (off by default).
- **Accessibility:** focus-trapped dialogs, `Esc` to close, a live region for statements, and support for reduced motion.

## Counsel & models (optional)

Configure different LLM providers and models separately for **Paksh**, **Vipaksh**, and the **Judge**.

- **5 Supported Providers:**
  - **OpenAI** (OpenAI)
  - **Claude** (Anthropic)
  - **Gemini** (Google AI Studio)
  - **Grok** (xAI)
  - **Groq** (Groq — fast inference for open models)

> **Grok vs. Groq:** Grok is xAI's proprietary model family (`grok-2`, `grok-beta`). Groq is a distinct company hosting open-weights models (`llama-3.3-70b-versatile`, `mixtral-8x7b-32768`, etc.) on custom LPU hardware. They use different endpoints, different keys, and different model lists; Vichaar Sabha never merges or aliases them.

### Running with Models

1. **Development with Live Providers:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173`. Keys entered in the Counsel & models dialog (`icon`) are verified by the local server and can be immediately reused across roles with one click.

2. **Fake Provider Mode (zero API credits required):**
   ```bash
   npm run dev:fake
   # or: VS_FAKE_PROVIDERS=1 npm run dev
   ```
   Simulates all 5 providers with canned models and in-character test responses. Useful for offline development, CI, and UI testing. Use key `bad` to simulate 401 authentication errors or `slow` to test timeouts.

3. **Environment Keys (`.env.local`):**
   Keys can be preloaded from the environment or a `.env.local` file in the project root:
   ```env
   OPENAI_API_KEY=sk-...
   ANTHROPIC_API_KEY=sk-ant-...
   GEMINI_API_KEY=AIzaSy...
   XAI_API_KEY=xai-...
   GROQ_API_KEY=gsk_...
   ```
   These are discovered on startup, verified in the background, and presented in the UI as reusable connections (labeled `from environment`). `.env.local` is gitignored.

### Security Model & Architecture

- **Keys held strictly in server memory:** API keys are never sent back to the browser, stored in `localStorage`, saved to disk, logged in console/files, or included in exports. The browser receives only masked hints (`••••7f2a`), provider metadata, and connection IDs.
- **Localhost bind & session token:** The proxy binds exclusively to `127.0.0.1`. On boot, a random session UUID is generated and injected into served HTML via `<meta name="vs-token">`. Every API route requires this token via the `X-VS-Token` header.
- **Host & origin validation:** Requests with unauthorized `Host` or `Origin` headers are rejected with HTTP 403.
- **Anti-SSRF & request guards:** The server only talks to fixed, hardcoded provider endpoints (no custom URLs) with a strict 64 KB JSON body limit and timeouts (10s verify, 60s generation).
- **Offline / standalone file fallback:** When opening `dist/index.html` via `file://`, the hearing remains fully functional in scripted mode; opening Counsel displays a graceful message explaining how to run `npm run dev`.

### Token & Usage Normalization

Different providers report token metrics differently. Vichaar Sabha normalizes all responses into a standard `{ inputTokens, outputTokens, reasoningTokens, totalTokens }` structure:

| Provider | Prompt / Input Tokens | Output / Completion Tokens | Reasoning Tokens |
| --- | --- | --- | --- |
| **OpenAI** | `prompt_tokens` | `completion_tokens` | `completion_tokens_details.reasoning_tokens` (already in output) |
| **Anthropic** | `input_tokens` + `cache_creation_input_tokens` + `cache_read_input_tokens` | `output_tokens` | — |
| **Gemini** | `promptTokenCount` | `candidatesTokenCount` + `thoughtsTokenCount` | `thoughtsTokenCount` (explicitly added to candidates) |
| **xAI (Grok)** | `prompt_tokens` | `completion_tokens` | `completion_tokens_details.reasoning_tokens` (already in output) |
| **Groq** | `prompt_tokens` | `completion_tokens` | Timing details (`queue_time`, `prompt_time`, `completion_time`) preserved in `raw` |

## Live Paksh (preview)

Vichaar Sabha introduces the first live module of the Lean Hearing engine: **Paksh runs live** for the active case, generating an evidence-grounded opening argument. Vipaksh and the Judge remain scripted.

### What runs live vs. what is scripted

- **Live:** When you click **Hear Paksh live** on the case card (when connected via `npm run dev` or `npm run dev:fake` with Paksh assigned a verified provider/model), the server makes a live call to the configured LLM, verifies every cited quote against the case record, validates the schema and argumentation rules, and displays the evidence-checked opening dialog.
- **Scripted:** The courtroom simulation, pacing, dock controls, objections, Vipaksh challenger statements, and Judge rulings/verdicts remain fully scripted as before.

### How isolation works

Paksh is strictly isolated from the rest of the hearing to prevent prompt pollution and bias:
1. **Fresh call per role and stage:** Each model call is completely stateless—no shared chat threads, conversation history, or provider assistant objects are reused.
2. **Strict allow-list contexts:** The prompt builder exposes only allow-listed fields (`id`, `number`, `title`, `brief`, `goal`, `goal_type`, and exhibits with `id`, `kind`, `title`, `detail`, `url`, `text`). Scripted statements, rulings, verdicts, headlines, and notes are completely stripped.
3. **No access to opponent or outcome:** An opening prompt containing Vipaksh statements or `VE*` evidence citations is actively refused by the engine before execution.
4. **Independent memory & hearing separation:** Each hearing is isolated by a random UUID (`crypto.randomUUID()`); concurrent hearings cannot access each other's data or state.
5. **Auditable request log:** The server records the exact allowed input paths and the SHA-256 hash of every prompt, without storing raw idea text unless `VS_LOG_PROMPTS=1`.

### Evidence verification & caps

The engine (Node server code, not the LLM) verifies every piece of evidence cited in Paksh's ledger against the case exhibits:
- **Quote verification:** The quote matching algorithm performs unicode NFKC normalization, translation of punctuation, whitespace collapsing, and word-boundary matching. Quotes that match verbatim receive `Quote found`, while those matching after normalization receive `Quote found (formatting differs)`. Quotes not found in exhibits are downgraded to assertions (`Quote not found — counted as assertion`).
- **Found quote ≠ claim support:** *A found quote proves only that the words exist in the case record; it does NOT prove that they support the claim.* Evaluating whether the evidence truly supports the proposition remains the responsibility of the court.
- **Strict confidence caps:** Claims cannot be rated higher than the supporting evidence permits. High confidence strictly requires behavioral or empirical data; opinion evidence supports at most medium confidence; assertion-only evidence or unverified quotes cap claims at low confidence. Small sample sizes (`< 30`) are capped at opinion.
- **Code sets verification:** Model-submitted verification flags or ratings are stripped immediately before server-side verification with an auditable warning.

### Research modes

- **Case only (`case`, default):** Paksh reads only the provided case brief and exhibits. In a single combined call, it outputs both the evidence ledger and opening argument.
- **Off (`off`):** Disables the ledger entirely. Prompt is rendered with an empty ledger, requiring all claims to be framed strictly as assumptions (low confidence).

### Budgets & repair policy

- **Token budget:** Enforces a default limit of `8000` tokens per hearing (`VS_HEARING_TOKEN_BUDGET`). Calls exceeding the budget are refused with HTTP 429 (`budget_exceeded`).
- **Single bounded repair:** If the model reply is truncated (`finishReason: 'length'`), unparsable, or fails schema/rule validation, the engine issues **exactly one** repair call detailing the exact validation errors.
- **Incomplete policy:** If the repair attempt fails, the engine returns status `incomplete` and lists the errors. It **never** invents fallback claims or displays a partial opening.

### Source of truth & testing

The Paksh skill specification in `skills/paksh-advocate/` is the single source of truth for prompts, schemas, rules, and configuration:
- Run the full Node engine parity and route test suite:
  ```bash
  npm test
  ```
- Run the skill test suite (Python reference scripts & canary leak test):
  ```bash
  npm run test:skill
  ```
- **Leak test:** The canary test plants `ZEBRA-4471` across unauthorized fields (case scripts, rulings, verdicts, exhibit metadata, opponent outputs, and concurrent hearings). The test verifies that the canary is absent from all Paksh requests and responses, confirms that leaky prompts are refused, and validates that a positive control appears only in rebuttal prompts.


## Connecting a real backend later

Replace the static `script`, `rulings` and `verdict` in `src/data.js` with responses from your Lean Hearing engine (independent Paksh and Vipaksh calls, then the Judge). The UI only needs, per statement, `{ speaker, text, note }`; per objection category, a ruling string; and a `verdict` object of the same shape.
