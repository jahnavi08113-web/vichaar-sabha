// Shared configuration and normalization rules for provider adapters.
// All base URLs, API versions, headers, and timeouts live here in one place.

export const TIMEOUTS = {
  verifyMs: 10_000,   // 10 seconds timeout for key verification
  generateMs: 60_000, // 60 seconds timeout for test/generation call
};

export const PROVIDER_CONFIG = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    company: 'OpenAI',
    // Docs: https://platform.openai.com/docs/api-reference
    baseUrl: 'https://api.openai.com/v1',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    modelsPath: '/models',
    chatPath: '/chat/completions',
    keyPrefixHint: 'sk-',
  },
  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    company: 'Anthropic',
    // Docs: https://docs.anthropic.com/en/api/overview
    // Models API: https://docs.anthropic.com/en/api/models-list
    // Messages API: https://docs.anthropic.com/en/api/messages
    baseUrl: 'https://api.anthropic.com/v1',
    apiVersion: '2023-06-01',
    authHeader: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
    modelsPath: '/models?limit=100',
    messagesPath: '/messages',
    keyPrefixHint: 'sk-ant-',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    // Docs: https://ai.google.dev/api/models
    // GenerateContent: https://ai.google.dev/api/generate-content
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    authHeader: (key) => ({ 'x-goog-api-key': key }),
    modelsPath: '/models',
    keyPrefixHint: 'AIza',
  },
  xai: {
    id: 'xai',
    name: 'Grok',
    company: 'xAI',
    // Docs: https://docs.x.ai/api
    baseUrl: 'https://api.x.ai/v1',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    modelsPath: '/models',
    chatPath: '/chat/completions',
    keyPrefixHint: 'xai-',
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    company: 'Groq',
    // Docs: https://console.groq.com/docs/api-reference
    // Models list: https://console.groq.com/docs/models
    baseUrl: 'https://api.groq.com/openai/v1',
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    modelsPath: '/models',
    chatPath: '/chat/completions',
    keyPrefixHint: 'gsk_',
  },
};

/**
 * Normalise usage across providers.
 * Missing fields become null, never 0.
 * outputTokens MUST include reasoning/thinking tokens exactly once.
 */
export function normaliseUsage({
  inputTokens = null,
  outputTokens = null,
  reasoningTokens = null,
  cachedInputTokens = null,
  totalTokens = null,
  raw = {},
}) {
  const inp = typeof inputTokens === 'number' ? inputTokens : null;
  const out = typeof outputTokens === 'number' ? outputTokens : null;
  const tot = typeof totalTokens === 'number'
    ? totalTokens
    : (inp != null && out != null ? inp + out : null);

  return {
    inputTokens: inp,
    outputTokens: out,
    reasoningTokens: typeof reasoningTokens === 'number' ? reasoningTokens : null,
    cachedInputTokens: typeof cachedInputTokens === 'number' ? cachedInputTokens : null,
    totalTokens: tot,
    raw,
  };
}

/**
 * Maps HTTP status codes & provider error bodies to unified error objects.
 */
export function mapProviderError(status, data, providerId, key = '') {
  const rawMsg = data?.error?.message || data?.message || '';

  // Check Grok vs Groq cross-key confusion
  if (providerId === 'xai' && (/^gsk_/i.test(key) || /groq/i.test(rawMsg))) {
    return {
      code: 'invalid_key',
      message: "This key wasn't accepted. Did you mean Groq instead of Grok (xAI)?",
    };
  }
  if (providerId === 'groq' && (/^xai-/i.test(key) || /x\.?ai/i.test(rawMsg))) {
    return {
      code: 'invalid_key',
      message: "This key wasn't accepted. Did you mean Grok (xAI) instead of Groq?",
    };
  }

  if (status === 401) {
    return {
      code: 'invalid_key',
      message: "This key wasn't accepted. Check that you copied all of it.",
    };
  }
  if (status === 403) {
    return {
      code: 'no_access',
      message: "This key works, but doesn't have access to that model or project.",
    };
  }
  if (status === 429) {
    if (/quota|credit|billing|exceeded/i.test(rawMsg)) {
      return {
        code: 'quota',
        message: 'This account has no remaining credit or quota.',
      };
    }
    return {
      code: 'rate_limited',
      message: 'The provider is rate-limiting this key. Wait a moment and try again.',
    };
  }
  if (status === 404) {
    return {
      code: 'model_not_found',
      message: 'The specified model was not found.',
    };
  }
  if (status === 503) {
    return {
      code: 'unavailable',
      message: rawMsg || 'The model is currently experiencing high demand. Please try again in a moment.',
    };
  }
  if (/quota|insufficient_quota|credit_limit/i.test(rawMsg)) {
    return {
      code: 'quota',
      message: 'This account has no remaining credit or quota.',
    };
  }

  return {
    code: 'unknown',
    message: rawMsg || 'An unexpected error occurred.',
  };
}
