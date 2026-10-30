import { PROVIDER_CONFIG, normaliseUsage, mapProviderError } from './config.mjs';

const cfg = PROVIDER_CONFIG.gemini;

export async function verify(key, { signal } = {}) {
  try {
    const res = await fetch(`${cfg.baseUrl}${cfg.modelsPath}`, {
      method: 'GET',
      headers: cfg.authHeader(key),
      signal,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: mapProviderError(res.status, data, 'gemini', key) };
    }

    const list = Array.isArray(data.models) ? data.models : [];
    const models = list
      .filter((m) => {
        const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        if (!methods.includes('generateContent')) return false;
        const name = m.name || '';
        if (/embedding|aqa|imagen|tts/i.test(name)) return false;
        return true;
      })
      .map((m) => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          label: m.displayName || id,
        };
      });

    return { ok: true, models };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, error: { code: 'timeout', message: 'The request timed out. Please try again.' } };
    }
    return { ok: false, error: { code: 'network', message: 'Unable to reach Google Gemini. Check your connection.' } };
  }
}

export async function generate({ key, model, system, messages, maxOutputTokens = 60, temperature, signal } = {}) {
  try {
    let cleanModel = (model || '').replace(/^models\//, '');
    if (cleanModel === 'gemini-flash-3.8') {
      cleanModel = 'gemini-3.8-flash';
    }
    const contents = (messages || []).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const body = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens,
        ...(temperature != null ? { temperature } : {}),
      },
    };

    const res = await fetch(`${cfg.baseUrl}/models/${cleanModel}:generateContent`, {
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
      const err = mapProviderError(res.status, data, 'gemini', key);
      const e = new Error(err.message);
      e.code = err.code;
      e.status = res.status;
      throw e;
    }

    const candidate = data.candidates?.[0];
    const part = candidate?.content?.parts?.[0];
    const text = part?.text || '';

    const rawReason = candidate?.finishReason;
    const finishReason = rawReason === 'STOP' ? 'stop'
      : rawReason === 'MAX_TOKENS' ? 'length'
      : rawReason === 'SAFETY' ? 'safety'
      : rawReason ? rawReason.toLowerCase() : 'other';

    const u = data.usageMetadata || {};
    const candTokens = typeof u.candidatesTokenCount === 'number' ? u.candidatesTokenCount : null;
    const thoughtTokens = typeof u.thoughtsTokenCount === 'number' ? u.thoughtsTokenCount : 0;
    const outputTokens = candTokens != null ? candTokens + thoughtTokens : null;

    const usage = normaliseUsage({
      inputTokens: u.promptTokenCount,
      outputTokens,
      reasoningTokens: typeof u.thoughtsTokenCount === 'number' ? u.thoughtsTokenCount : null,
      cachedInputTokens: u.cachedContentTokenCount,
      totalTokens: u.totalTokenCount,
      raw: u,
    });

    return {
      text,
      model: cleanModel,
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
