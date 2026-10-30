import crypto from 'node:crypto';

// In-memory request log store
const logs = [];

export function computeSha256(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('sha256').update(text, 'utf-8').digest('hex');
}

export function logRequest(data) {
  const {
    hearingId,
    role,
    stage,
    provider,
    model,
    prompt,
    promptSha256,
    allowedInputs = [],
    usage = null,
    finishReason = null,
    status = 'ok',
    retry = false,
  } = data;

  const sha = promptSha256 || (prompt ? computeSha256(prompt) : null);

  const entry = {
    id: crypto.randomUUID(),
    hearingId: hearingId || null,
    timestamp: new Date().toISOString(),
    role,
    stage,
    provider,
    model,
    promptSha256: sha,
    allowedInputs: Array.isArray(allowedInputs) ? [...allowedInputs] : [],
    usage: usage
      ? {
          inputTokens: usage.inputTokens ?? usage.prompt_tokens ?? null,
          outputTokens: usage.outputTokens ?? usage.completion_tokens ?? null,
          totalTokens: usage.totalTokens ?? usage.total_tokens ?? null,
        }
      : null,
    finishReason,
    status,
    retry: Boolean(retry),
  };

  if (process.env.VS_LOG_PROMPTS === '1' && prompt) {
    entry.prompt = prompt;
  }

  logs.push(entry);
  return entry;
}

export function getHearingLogs(hearingId) {
  if (!hearingId) return [];
  return logs.filter(l => l.hearingId === hearingId);
}

export function getAllLogs() {
  return [...logs];
}

export function clearLogs() {
  logs.length = 0;
}
