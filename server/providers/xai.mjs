import { PROVIDER_CONFIG, normaliseUsage, mapProviderError } from './config.mjs';

const cfg = PROVIDER_CONFIG.xai;

export async function verify(key, { signal } = {}) {
  try {
    const res = await fetch(`${cfg.baseUrl}${cfg.modelsPath}`, {
      method: 'GET',
      headers: cfg.authHeader(key),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: mapProviderError(res.status, data, 'xai', key) };
    }

    const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.models) ? data.models : []);
    const models = list
      .filter((m) => m.id && /^grok/i.test(m.id))
      .map((m) => ({
        id: m.id,
        label: m.id,
      }));

    return { ok: true, models };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'The request timed out. Please try again.' } };
    }
    return { ok: false, error: { code: 'network', message: 'Unable to reach xAI. Check your connection.' } };
  }
}

export async function generate({ key, model, system, messages, maxOutputTokens = 60, temperature, signal } = {}) {
  try {
    const chatMessages = [];
    if (system) {
      chatMessages.push({ role: 'system', content: system });
    }
    for (const m of messages || []) {
      chatMessages.push({ role: m.role, content: m.content });
    }

    const body = {
      model,
      messages: chatMessages,
      max_tokens: maxOutputTokens,
      ...(temperature != null ? { temperature } : {}),
    };

    const res = await fetch(`${cfg.baseUrl}${cfg.chatPath}`, {
      method: 'POST',
      headers: {
        ...cfg.authHeader(key),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = mapProviderError(res.status, data, 'xai', key);
      const e = new Error(err.message);
      e.code = err.code;
      e.status = res.status;
      throw e;
    }

    const choice = data.choices?.[0];
    const text = choice?.message?.content || '';
    const rawReason = choice?.finish_reason;
    const finishReason = rawReason === 'stop' ? 'stop'
      : rawReason === 'length' ? 'length'
      : rawReason || 'other';

    const u = data.usage || {};
    // In xAI, completion_tokens includes reasoning tokens; completion_tokens_details is a breakdown only.
    const usage = normaliseUsage({
      inputTokens: u.prompt_tokens,
      outputTokens: u.completion_tokens,
      reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
      cachedInputTokens: u.prompt_tokens_details?.cached_tokens,
      totalTokens: u.total_tokens,
      raw: u,
    });

    return {
      text,
      model: data.model || model,
      finishReason,
      usage,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error('The request timed out. Please try again.');
      e.code = 'timeout';
      throw e;
    }
    throw err;
  }
}
