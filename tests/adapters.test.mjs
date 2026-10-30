import test from 'node:test';
import assert from 'node:assert/strict';
import * as openai from '../server/providers/openai.mjs';
import * as anthropic from '../server/providers/anthropic.mjs';
import * as gemini from '../server/providers/gemini.mjs';
import * as xai from '../server/providers/xai.mjs';
import * as groq from '../server/providers/groq.mjs';

function withMockFetch(mockFn, testFn) {
  const origFetch = globalThis.fetch;
  globalThis.fetch = mockFn;
  return Promise.resolve()
    .then(testFn)
    .finally(() => {
      globalThis.fetch = origFetch;
    });
}

// 1. OpenAI Adapter tests
test('OpenAI adapter: verify & generate headers, URLs, and usage', async () => {
  let recordedUrl = '';
  let recordedHeaders = {};
  let recordedBody = null;

  await withMockFetch(async (url, opts) => {
    recordedUrl = url.toString();
    recordedHeaders = opts.headers;
    recordedBody = opts.body ? JSON.parse(opts.body) : null;

    if (opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'gpt-4o' },
            { id: 'gpt-4o-mini' },
            { id: 'text-embedding-3-small' },
            { id: 'whisper-1' },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-123',
        model: 'gpt-4o',
        choices: [{ message: { content: 'Advocate Paksh here.' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 30,
          completion_tokens: 15,
          total_tokens: 45,
          completion_tokens_details: { reasoning_tokens: 5 },
          prompt_tokens_details: { cached_tokens: 10 },
        },
      }),
    };
  }, async () => {
    // Test verify
    const vRes = await openai.verify('sk-test-openai-key');
    assert.equal(vRes.ok, true);
    assert.equal(recordedUrl, 'https://api.openai.com/v1/models');
    assert.equal(recordedHeaders.Authorization, 'Bearer sk-test-openai-key');
    assert.ok(!recordedUrl.includes('sk-test-openai-key'));
    assert.deepEqual(vRes.models.map((m) => m.id), ['gpt-4o-mini', 'gpt-4o']);

    // Test generate
    const gRes = await openai.generate({
      key: 'sk-test-openai-key',
      model: 'gpt-4o',
      system: 'You are Paksh.',
      messages: [{ role: 'user', content: 'Intro' }],
    });
    assert.equal(recordedBody.messages[0].role, 'system');
    assert.equal(recordedBody.messages[0].content, 'You are Paksh.');
    assert.equal(recordedBody.messages[1].content, 'Intro');
    assert.equal(gRes.text, 'Advocate Paksh here.');
    assert.equal(gRes.usage.inputTokens, 30);
    // outputTokens already includes reasoning tokens in OpenAI
    assert.equal(gRes.usage.outputTokens, 15);
    assert.equal(gRes.usage.reasoningTokens, 5);
    assert.equal(gRes.usage.cachedInputTokens, 10);
    assert.equal(gRes.usage.totalTokens, 45);
  });
});

test('OpenAI adapter: error mapping 401, 403, 429', async () => {
  const testErr = async (status, msg, expectedCode) => {
    await withMockFetch(async () => ({
      ok: false,
      status,
      json: async () => ({ error: { message: msg } }),
    }), async () => {
      const res = await openai.verify('sk-bad');
      assert.equal(res.ok, false);
      assert.equal(res.error.code, expectedCode);
    });
  };

  await testErr(401, 'Incorrect API key', 'invalid_key');
  await testErr(403, 'Country unsupported', 'no_access');
  await testErr(429, 'Rate limit reached', 'rate_limited');
  await testErr(429, 'You exceeded your current quota', 'quota');
});

// 2. Anthropic Adapter tests
test('Anthropic adapter: verify & generate headers, URLs, and usage', async () => {
  let recordedUrl = '';
  let recordedHeaders = {};
  let recordedBody = null;

  await withMockFetch(async (url, opts) => {
    recordedUrl = url.toString();
    recordedHeaders = opts.headers;
    recordedBody = opts.body ? JSON.parse(opts.body) : null;

    if (opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'msg-123',
        model: 'claude-3-5-sonnet-20241022',
        content: [{ type: 'text', text: 'Challenger Vipaksh here.' }],
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 40,
          output_tokens: 20,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 5,
        },
      }),
    };
  }, async () => {
    const vRes = await anthropic.verify('sk-ant-test-key');
    assert.equal(vRes.ok, true);
    assert.equal(recordedUrl, 'https://api.anthropic.com/v1/models?limit=100');
    assert.equal(recordedHeaders['x-api-key'], 'sk-ant-test-key');
    assert.equal(recordedHeaders['anthropic-version'], '2023-06-01');
    assert.ok(!recordedUrl.includes('sk-ant-test-key'));
    assert.equal(vRes.models[0].id, 'claude-3-5-sonnet-20241022');

    const gRes = await anthropic.generate({
      key: 'sk-ant-test-key',
      model: 'claude-3-5-sonnet-20241022',
      system: 'You are Vipaksh.',
      messages: [{ role: 'user', content: 'Intro' }],
    });
    assert.equal(recordedBody.system, 'You are Vipaksh.');
    assert.equal(recordedBody.messages[0].content, 'Intro');
    assert.equal(gRes.text, 'Challenger Vipaksh here.');
    // Total input = input_tokens + cache_creation + cache_read = 40 + 10 + 5 = 55
    assert.equal(gRes.usage.inputTokens, 55);
    assert.equal(gRes.usage.cachedInputTokens, 5);
    assert.equal(gRes.usage.outputTokens, 20);
    assert.equal(gRes.usage.totalTokens, 75);
  });
});

// 3. Gemini Adapter tests
test('Gemini adapter: verify & generate headers, URLs, and usage', async () => {
  let recordedUrl = '';
  let recordedHeaders = {};
  let recordedBody = null;

  await withMockFetch(async (url, opts) => {
    recordedUrl = url.toString();
    recordedHeaders = opts.headers;
    recordedBody = opts.body ? JSON.parse(opts.body) : null;

    if (opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: [
            { name: 'models/gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: 'Judge presiding.' }] },
          finishReason: 'STOP',
        }],
        usageMetadata: {
          promptTokenCount: 25,
          candidatesTokenCount: 15,
          thoughtsTokenCount: 8,
          cachedContentTokenCount: 5,
          totalTokenCount: 48,
        },
      }),
    };
  }, async () => {
    const vRes = await gemini.verify('AIza-test-gemini-key');
    assert.equal(vRes.ok, true);
    assert.equal(recordedUrl, 'https://generativelanguage.googleapis.com/v1beta/models');
    assert.equal(recordedHeaders['x-goog-api-key'], 'AIza-test-gemini-key');
    // Ensure key is NOT in the URL query string
    assert.ok(!recordedUrl.includes('AIza-test-gemini-key'));
    assert.equal(vRes.models.length, 1);
    assert.equal(vRes.models[0].id, 'gemini-2.0-flash');

    const gRes = await gemini.generate({
      key: 'AIza-test-gemini-key',
      model: 'gemini-2.0-flash',
      system: 'You are Judge.',
      messages: [{ role: 'user', content: 'Intro' }],
    });
    assert.equal(recordedBody.systemInstruction.parts[0].text, 'You are Judge.');
    assert.equal(recordedBody.contents[0].parts[0].text, 'Intro');
    assert.equal(gRes.text, 'Judge presiding.');
    // outputTokens = candidatesTokenCount (15) + thoughtsTokenCount (8) = 23
    assert.equal(gRes.usage.inputTokens, 25);
    assert.equal(gRes.usage.outputTokens, 23);
    assert.equal(gRes.usage.reasoningTokens, 8);
    assert.equal(gRes.usage.cachedInputTokens, 5);
    assert.equal(gRes.usage.totalTokens, 48);
  });
});

// 4. xAI Adapter tests
test('xAI adapter: verify, generate, and reasoning breakdown', async () => {
  let recordedUrl = '';
  let recordedHeaders = {};

  await withMockFetch(async (url, opts) => {
    recordedUrl = url.toString();
    recordedHeaders = opts.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Grok here.' }, finish_reason: 'stop' }],
        usage: {
          prompt_tokens: 35,
          completion_tokens: 18,
          total_tokens: 53,
          completion_tokens_details: { reasoning_tokens: 6 },
        },
      }),
    };
  }, async () => {
    const gRes = await xai.generate({
      key: 'xai-test-key',
      model: 'grok-2',
      messages: [{ role: 'user', content: 'Intro' }],
    });
    assert.equal(recordedHeaders.Authorization, 'Bearer xai-test-key');
    assert.equal(gRes.text, 'Grok here.');
    assert.equal(gRes.usage.inputTokens, 35);
    // In xAI, completion_tokens already includes reasoning tokens
    assert.equal(gRes.usage.outputTokens, 18);
    assert.equal(gRes.usage.reasoningTokens, 6);
    assert.equal(gRes.usage.totalTokens, 53);
  });
});

// 5. Groq Adapter tests
test('Groq adapter: drops whisper/guard models, preserves raw timing', async () => {
  await withMockFetch(async (url, opts) => {
    if (opts.method === 'GET') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { id: 'llama-3.3-70b-versatile', active: true },
            { id: 'whisper-large-v3', active: true },
            { id: 'llama-guard-3-8b', active: true },
          ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Groq here.' } }],
        usage: {
          prompt_tokens: 22,
          completion_tokens: 14,
          total_tokens: 36,
          queue_time: 0.002,
          prompt_time: 0.015,
        },
      }),
    };
  }, async () => {
    const vRes = await groq.verify('gsk_test_key');
    assert.equal(vRes.ok, true);
    assert.deepEqual(vRes.models.map((m) => m.id), ['llama-3.3-70b-versatile']);

    const gRes = await groq.generate({
      key: 'gsk_test_key',
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: 'Intro' }],
    });
    assert.equal(gRes.usage.inputTokens, 22);
    assert.equal(gRes.usage.outputTokens, 14);
    assert.equal(gRes.usage.totalTokens, 36);
    assert.equal(gRes.usage.raw.queue_time, 0.002);
  });
});

// 6. Grok vs Groq cross-key hint check
test('Grok vs Groq cross-key hint detection', async () => {
  await withMockFetch(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: { message: 'Invalid API key' } }),
  }), async () => {
    // Submit Groq key to xAI
    const res1 = await xai.verify('gsk_1234567890');
    assert.equal(res1.ok, false);
    assert.ok(res1.error.message.includes('Did you mean Groq instead of Grok (xAI)?'));

    // Submit xAI key to Groq
    const res2 = await groq.verify('xai-1234567890');
    assert.equal(res2.ok, false);
    assert.ok(res2.error.message.includes('Did you mean Grok (xAI) instead of Groq?'));
  });
});
