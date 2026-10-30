import { PROVIDER_CONFIG, normaliseUsage, mapProviderError } from './config.mjs';

const cfg = PROVIDER_CONFIG.openai;

export async function verify(key, { signal } = {}) {
  try {
    const res = await fetch(`${cfg.baseUrl}${cfg.modelsPath}`, {
      method: 'GET',
      headers: cfg.authHeader(key),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: mapProviderError(res.status, data, 'openai', key) };
    }

    const list = Array.isArray(data.data) ? data.data : [];
    // Keep text-generation & chat models, drop embeddings, tts, whisper, dall-e, moderation, realtime
    const chatModels = list
      .map((m) => m.id)
      .filter((id) => {
        if (!/^(gpt-|o1|o3|chatgpt-)/i.test(id)) return false;
        if (/realtime|audio|embedding|tts|whisper|dall-e|moderation/i.test(id)) return false;
        return true;
      });

    // Sort with preference for current models
    chatModels.sort((a, b) => {
      const priority = (id) => {
        if (id.startsWith('gpt-4o-mini')) return 1;
        if (id.startsWith('gpt-4o')) return 2;
        if (id.startsWith('o3-mini')) return 3;
        if (id.startsWith('o1')) return 4;
        if (id.startsWith('gpt-4')) return 5;
        return 10;
      };
      const pa = priority(a);
      const pb = priority(b);
      return pa !== pb ? pa - pb : a.localeCompare(b);
    });

    const models = chatModels.map((id) => ({ id, label: id }));
    return { ok: true, models };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'The request timed out. Please try again.' } };
    }
    return { ok: false, error: { code: 'network', message: 'Unable to reach OpenAI. Check your connection.' } };
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

    const isOModel = /^(o1|o3)/i.test(model);
    const body = {
      model,
      messages: chatMessages,
      ...(isOModel ? { max_completion_tokens: maxOutputTokens } : { max_tokens: maxOutputTokens }),
      ...(temperature != null && !isOModel ? { temperature } : {}),
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
      const err = mapProviderError(res.status, data, 'openai', key);
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
      : rawReason === 'content_filter' ? 'safety'
      : rawReason || 'other';

    const rawUsage = data.usage || {};
    const usage = normaliseUsage({
      inputTokens: rawUsage.prompt_tokens,
      outputTokens: rawUsage.completion_tokens,
      reasoningTokens: rawUsage.completion_tokens_details?.reasoning_tokens,
      cachedInputTokens: rawUsage.prompt_tokens_details?.cached_tokens,
      totalTokens: rawUsage.total_tokens,
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
