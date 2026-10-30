import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseUsage } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_SWAP_FIXTURE_PATH = path.resolve(
  __dirname,
  '../../skills/paksh-advocate/examples/skill-swap/case-opening.json'
);

let cachedSkillSwap = null;
function getSkillSwapFixture() {
  if (!cachedSkillSwap) {
    if (fs.existsSync(SKILL_SWAP_FIXTURE_PATH)) {
      cachedSkillSwap = JSON.parse(fs.readFileSync(SKILL_SWAP_FIXTURE_PATH, 'utf-8'));
    }
  }
  return cachedSkillSwap;
}

const FAKE_MODELS = {
  openai: [
    { id: 'gpt-4o', label: 'gpt-4o' },
    { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { id: 'o3-mini', label: 'o3-mini' },
    { id: 'o1', label: 'o1' },
  ],
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  gemini: [
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  ],
  xai: [
    { id: 'grok-2-1212', label: 'grok-2-1212' },
    { id: 'grok-2-mini-1212', label: 'grok-2-mini-1212' },
    { id: 'grok-beta', label: 'grok-beta' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
    { id: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant' },
    { id: 'qwen-2.5-32b', label: 'qwen-2.5-32b' },
    { id: 'deepseek-r1-distill-llama-70b', label: 'deepseek-r1-distill-llama-70b' },
  ],
};

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      const e = new Error('The request timed out. Please try again.');
      e.code = 'timeout';
      reject(e);
    });
  });
}

export const fake = {
  requests: [],
  queues: {
    paksh: [],
    vipaksh: [],
    judge: [],
  },
  queueReplies(role, replies) {
    if (!this.queues[role]) this.queues[role] = [];
    if (Array.isArray(replies)) {
      this.queues[role].push(...replies);
    } else {
      this.queues[role].push(replies);
    }
  },
  reset() {
    this.requests.length = 0;
    this.queues = { paksh: [], vipaksh: [], judge: [] };
  },
};

export function createFakeAdapter(providerId) {
  return {
    id: providerId,
    async verify(key, { signal } = {}) {
      if (/slow/i.test(key)) {
        await sleep(15_000, signal);
      } else {
        await sleep(50, signal);
      }

      if (/bad/i.test(key)) {
        return {
          ok: false,
          error: {
            code: 'invalid_key',
            message: "This key wasn't accepted. Check that you copied all of it.",
          },
        };
      }

      const models = FAKE_MODELS[providerId] || [
        { id: `${providerId}-default-model`, label: `${providerId}-default-model` },
      ];
      return { ok: true, models };
    },

    async generate({ key, model, system, messages, maxOutputTokens, temperature, signal } = {}) {
      if (/slow/i.test(key)) {
        await sleep(65_000, signal);
      } else {
        await sleep(75, signal);
      }

      if (/bad/i.test(key)) {
        const e = new Error("This key wasn't accepted. Check that you copied all of it.");
        e.code = 'invalid_key';
        e.status = 401;
        throw e;
      }

      // Record request for assertions
      fake.requests.push({
        provider: providerId,
        key,
        model,
        system,
        messages,
        options: { maxOutputTokens, temperature },
      });

      const s = (system || '').toLowerCase();
      const userText = (messages || []).map(m => m.content).join(' ');
      const isSimplePrompt = !system || (!s.includes('paksh') && !s.includes('vipaksh') && !s.includes('judge'));

      if (/trunc/i.test(key)) {
        const isRepair = userText.includes('Your previous reply failed');
        if (!isRepair) {
          return {
            text: '{"ledger": {"owner": "paksh", "items": [{"id": "PE1", "source": "exhibit"',
            model: model || `${providerId}-canned-model`,
            finishReason: 'length',
            usage: normaliseUsage({
              inputTokens: 120,
              outputTokens: maxOutputTokens || 100,
              totalTokens: (120 + (maxOutputTokens || 100)),
              raw: { fake: true },
            }),
          };
        }
      }

      // Determine role from system or messages
      let role = 'paksh';
      if (s.includes('you are vipaksh') || s.includes('challenger in vichaar sabha')) {
        role = 'vipaksh';
      } else if (s.includes('you are the judge') || s.includes('judge in vichaar sabha') || s.includes('i preside over vichaar sabha')) {
        role = 'judge';
      } else if (s.includes('you are paksh') || s.includes('advocate in vichaar sabha')) {
        role = 'paksh';
      } else if (fake.queues.paksh?.length > 0) {
        role = 'paksh';
      }

      // Check queued replies first
      if (fake.queues[role] && fake.queues[role].length > 0) {
        const queued = fake.queues[role].shift();
        let finishReason = 'stop';
        let text = '';
        if (typeof queued === 'string') {
          text = queued;
        } else if (queued && typeof queued === 'object') {
          if (queued.finishReason) finishReason = queued.finishReason;
          text = queued.text !== undefined ? queued.text : JSON.stringify(queued);
        }

        return {
          text,
          model: model || `${providerId}-canned-model`,
          finishReason,
          usage: normaliseUsage({
            inputTokens: 250,
            outputTokens: 200,
            totalTokens: 450,
            raw: { fake: true },
          }),
        };
      }

      if (userText.includes('In one sentence') || isSimplePrompt) {
        let testSentence = 'In one sentence, I stand ready to counsel the court on this idea.';
        if (s.includes('paksh')) {
          testSentence = "I am Paksh, advocate for what could be — bring me your rawest idea, and let's find the piece worth proving.";
        } else if (s.includes('vipaksh')) {
          testSentence = "I am Vipaksh, the court's challenger — I will ask where this breaks, so you only build what survives.";
        } else if (s.includes('judge')) {
          testSentence = 'I preside over Vichaar Sabha: we weigh what is known against what is hoped, and leave with one clear test.';
        }
        return {
          text: testSentence,
          model: model || `${providerId}-canned-model`,
          finishReason: 'stop',
          usage: normaliseUsage({
            inputTokens: 38,
            outputTokens: 21,
            totalTokens: 59,
            raw: { fake: true },
          }),
        };
      }

      // Live Paksh call
      const fixture = getSkillSwapFixture();

      // Check whether case_opening or opening
      let text = '';
      if (userText.includes('"ledger"') || userText.includes('<case>')) {
        // Build canned reply matching case if possible
        if (fixture) {
          // If the case is swap, return fixture as-is
          let payload = JSON.parse(JSON.stringify(fixture));
          const caseMatch = userText.match(/<case>([\s\S]*?)<\/case>/);
          if (caseMatch) {
            try {
              const caseObj = JSON.parse(caseMatch[1]);
              if (caseObj && caseObj.id !== 'swap') {
                // Adapt quotes to match target case if not swap
                const ex0 = caseObj.exhibits?.[0];
                if (ex0) {
                  payload.ledger.items[0].source = ex0.id;
                  payload.ledger.items[0].quote = ex0.detail || ex0.title;
                  payload.ledger.items[1].source = ex0.id;
                  payload.ledger.items[1].quote = ex0.title || ex0.detail;
                }
                if (caseObj.brief) {
                  payload.ledger.items[2].quote = caseObj.brief.slice(0, 50);
                }
                if (caseObj.goal) {
                  payload.ledger.items[3].quote = caseObj.goal.slice(0, 30);
                }
              }
            } catch {
              // Ignore parse error and use standard fixture
            }
          }
          text = JSON.stringify(payload);
        } else {
          text = '{"ledger":{"owner":"paksh","items":[]},"opening":{"mode":"opening","statement":"Ready to proceed."}}';
        }
      } else {
        // Simple opening object
        text = fixture ? JSON.stringify(fixture.opening) : '{"mode":"opening","statement":"Ready."}';
      }

      return {
        text,
        model: model || `${providerId}-canned-model`,
        finishReason: 'stop',
        usage: normaliseUsage({
          inputTokens: 380,
          outputTokens: 420,
          totalTokens: 800,
          raw: { fake: true },
        }),
      };
    },
  };
}
