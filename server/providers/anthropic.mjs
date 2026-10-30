import { PROVIDER_CONFIG, normaliseUsage, mapProviderError } from './config.mjs';

const cfg = PROVIDER_CONFIG.anthropic;

export async function verify(key, { signal } = {}) {
  try {
    const res = await fetch(`${cfg.baseUrl}${cfg.modelsPath}`, {
      method: 'GET',
      headers: cfg.authHeader(key),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: mapProviderError(res.status, data, 'anthropic', key) };
    }

    const list = Array.isArray(data.data) ? data.data : [];
    // Keep Claude text generation models
    const models = list
      .filter((m) => m.id && /^claude/i.test(m.id))
      .map((m) => ({
        id: m.id,
        label: m.display_name || m.id,
      }));

    // If API returned empty for some reason, ensure fallback is not needed or return empty
    return { ok: true, models };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'The request timed out. Please try again.' } };
    }
    return { ok: false, error: { code: 'network', message: 'Unable to reach Anthropic. Check your connection.' } };
  }
}

export async function generate({ key, model, system, messages, maxOutputTokens = 60, temperature, signal } = {}) {
  try {
    const body = {
      model,
      max_tokens: maxOutputTokens,
      ...(system ? { system } : {}),
      messages: (messages || []).map((m) => ({ role: m.role, content: m.content })),
      ...(temperature != null ? { temperature } : {}),
    };

    const res = await fetch(`${cfg.baseUrl}${cfg.messagesPath}`, {
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
      const err = mapProviderError(res.status, data, 'anthropic', key);
      const e = new Error(err.message);
      e.code = err.code;
      e.status = res.status;
      throw e;
    }

    const textPart = Array.isArray(data.content) ? data.content.find((p) => p.type === 'text') : null;
    const text = textPart ? textPart.text : (typeof data.content === 'string' ? data.content : '');

    const stopReason = data.stop_reason;
    const finishReason = stopReason === 'end_turn' || stopReason === 'stop_sequence' ? 'stop'
      : stopReason === 'max_tokens' ? 'length'
      : stopReason || 'other';

    const rawUsage = data.usage || {};
    // Anthropic total input includes regular input + cache creation + cache read
    const baseIn = typeof rawUsage.input_tokens === 'number' ? rawUsage.input_tokens : null;
    const cacheCreate = typeof rawUsage.cache_creation_input_tokens === 'number' ? rawUsage.cache_creation_input_tokens : 0;
    const cacheRead = typeof rawUsage.cache_read_input_tokens === 'number' ? rawUsage.cache_read_input_tokens : 0;
    const inputTokens = baseIn != null ? baseIn + cacheCreate + cacheRead : null;

    const usage = normaliseUsage({
      inputTokens,
      outputTokens: rawUsage.output_tokens,
      reasoningTokens: null,
      cachedInputTokens: typeof rawUsage.cache_read_input_tokens === 'number' ? rawUsage.cache_read_input_tokens : null,
      totalTokens: (inputTokens != null && typeof rawUsage.output_tokens === 'number')
        ? inputTokens + rawUsage.output_tokens
        : null,
      raw: rawUsage,
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
