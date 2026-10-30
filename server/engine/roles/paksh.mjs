import { getSkill } from '../skill.mjs';
import { renderPrompt } from '../render.mjs';
import { extractJsonReply } from '../json-reply.mjs';
import { verifyQuotes } from '../verify-quotes.mjs';
import { validatePaksh } from '../validate-paksh.mjs';
import { logRequest, computeSha256 } from '../request-log.mjs';

function stripModelVerification(ledger) {
  let stripped = false;
  if (!ledger || !Array.isArray(ledger.items)) return false;

  for (const item of ledger.items) {
    if (!item || typeof item !== 'object') continue;
    if (
      'verified' in item ||
      'verification' in item ||
      'original_strength' in item ||
      'cap_reason' in item
    ) {
      delete item.verified;
      delete item.verification;
      delete item.original_strength;
      delete item.cap_reason;
      stripped = true;
    }
  }
  return stripped;
}

function sumTokens(a, b) {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return a + b;
}

export async function runOpening(ctx, deps = {}) {
  const {
    adapter,
    key,
    model,
    researchMode = 'case',
    signal,
    config: customConfig,
    canaries = [],
    sources = {},
    checkBudget,
    recordUsage,
  } = deps;

  if (!adapter) {
    throw new Error('Adapter is required to run Paksh opening');
  }

  const skill = getSkill();
  const cfg = customConfig || skill.config;

  const mode = researchMode === 'off' ? 'opening' : 'case_opening';
  const emptyLedger = { owner: 'paksh', items: [] };

  const promptSpec = renderPrompt({
    mode,
    caseData: ctx.case,
    ledger: researchMode === 'off' ? emptyLedger : null,
    config: cfg,
  });

  const estimatedInputTokens = Math.round(
    promptSpec.messages.reduce((acc, m) => acc + (m.content ? m.content.length : 0), 0) / 4
  );
  const maxOutputTokens = promptSpec.max_output_tokens;

  if (typeof checkBudget === 'function') {
    checkBudget(estimatedInputTokens + maxOutputTokens);
  }

  const promptSha256 = computeSha256(promptSpec.messages);

  let calls = 0;
  let retries = 0;
  let totalInputTokens = null;
  let totalOutputTokens = null;
  let totalTokens = null;

  const warnings = [];

  function recordCallUsage(usage) {
    if (usage) {
      const inTok = usage.inputTokens ?? usage.prompt_tokens ?? null;
      const outTok = usage.outputTokens ?? usage.completion_tokens ?? null;
      const totTok = usage.totalTokens ?? usage.total_tokens ?? (inTok != null && outTok != null ? inTok + outTok : null);

      totalInputTokens = sumTokens(totalInputTokens, inTok);
      totalOutputTokens = sumTokens(totalOutputTokens, outTok);
      totalTokens = sumTokens(totalTokens, totTok);

      if (typeof recordUsage === 'function' && totTok != null) {
        recordUsage(totTok);
      }
    }
  }

  const systemPrompt = promptSpec.messages.find(m => m.role === 'system')?.content || '';
  const userMessages = promptSpec.messages.filter(m => m.role !== 'system');

  // First call
  calls++;
  let res1;
  try {
    res1 = await adapter.generate({
      key,
      model,
      system: systemPrompt,
      messages: userMessages,
      temperature: promptSpec.temperature,
      maxOutputTokens,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      logRequest({
        hearingId: ctx.hearingId,
        role: 'paksh',
        stage: 'opening',
        provider: adapter.id,
        model,
        promptSha256,
        allowedInputs: ctx.allowedInputs,
        finishReason: 'aborted',
        status: 'aborted',
      });
      const abortErr = new Error('Hearing aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    logRequest({
      hearingId: ctx.hearingId,
      role: 'paksh',
      stage: 'opening',
      provider: adapter.id,
      model,
      promptSha256,
      allowedInputs: ctx.allowedInputs,
      finishReason: 'error',
      status: 'error',
    });
    throw err;
  }

  recordCallUsage(res1.usage);

  let parsed = null;
  let parseError = null;
  try {
    parsed = extractJsonReply(res1.text);
  } catch (err) {
    parseError = err.message;
  }

  let openingCandidate = null;
  let ledgerCandidate = null;
  let initialValidation = { valid: false, errors: [], warnings: [] };

  if (!parseError && parsed) {
    if (mode === 'case_opening') {
      ledgerCandidate = parsed.ledger;
      openingCandidate = parsed.opening;
    } else {
      ledgerCandidate = emptyLedger;
      openingCandidate = parsed;
    }

    if (stripModelVerification(ledgerCandidate)) {
      warnings.push('model-supplied verification fields removed');
    }

    if (ledgerCandidate) {
      ledgerCandidate = verifyQuotes(ledgerCandidate, ctx.case, sources);
    }

    const valLedger = ledgerCandidate
      ? validatePaksh('ledger', ledgerCandidate, null, { config: cfg })
      : { valid: false, errors: ['Missing ledger in combined response'] };

    const valOpening = openingCandidate
      ? validatePaksh('opening', openingCandidate, ledgerCandidate, {
          config: cfg,
          requireVerified: true,
          canaries,
        })
      : { valid: false, errors: ['Missing opening in combined response'] };

    initialValidation = {
      valid: valLedger.valid && valOpening.valid,
      errors: [...valLedger.errors, ...valOpening.errors],
      warnings: [...warnings, ...valLedger.warnings, ...valOpening.warnings],
    };
  }

  const isTruncated = res1.finishReason === 'length';
  const needsRepair = isTruncated || parseError != null || !initialValidation.valid;

  if (!needsRepair) {
    logRequest({
      hearingId: ctx.hearingId,
      role: 'paksh',
      stage: 'opening',
      provider: adapter.id,
      model,
      promptSha256,
      allowedInputs: ctx.allowedInputs,
      usage: res1.usage,
      finishReason: res1.finishReason,
      status: 'ok',
      retry: false,
    });

    return {
      status: 'ok',
      role: 'paksh',
      opening: openingCandidate,
      ledger: ledgerCandidate,
      warnings: initialValidation.warnings,
      errors: [],
      usage: {
        calls,
        retries,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
      },
      model,
      provider: adapter.id,
      allowedInputs: ctx.allowedInputs,
      promptSha256,
    };
  }

  // Log initial failed attempt
  logRequest({
    hearingId: ctx.hearingId,
    role: 'paksh',
    stage: 'opening',
    provider: adapter.id,
    model,
    promptSha256,
    allowedInputs: ctx.allowedInputs,
    usage: res1.usage,
    finishReason: res1.finishReason,
    status: isTruncated ? 'truncated' : 'invalid',
    retry: false,
  });

  // Exactly ONE bounded repair call
  calls++;
  retries++;

  const failureReasons = [];
  if (isTruncated) failureReasons.push('Reply was truncated due to output length limits');
  if (parseError) failureReasons.push(`Reply was not valid JSON (${parseError})`);
  if (initialValidation.errors.length > 0) failureReasons.push(...initialValidation.errors);

  const repairUserContent =
    userMessages[0].content +
    `\n\nYour previous reply failed these checks: ${failureReasons.join('; ')}. Return corrected JSON only.`;

  const repairMessages = [{ role: 'user', content: repairUserContent }];
  const repairSha256 = computeSha256([{ role: 'system', content: systemPrompt }, ...repairMessages]);

  if (typeof checkBudget === 'function') {
    checkBudget(Math.round(repairUserContent.length / 4) + maxOutputTokens);
  }

  let res2;
  try {
    res2 = await adapter.generate({
      key,
      model,
      system: systemPrompt,
      messages: repairMessages,
      temperature: promptSpec.temperature,
      maxOutputTokens,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) {
      logRequest({
        hearingId: ctx.hearingId,
        role: 'paksh',
        stage: 'opening',
        provider: adapter.id,
        model,
        promptSha256: repairSha256,
        allowedInputs: ctx.allowedInputs,
        finishReason: 'aborted',
        status: 'aborted',
        retry: true,
      });
      const abortErr = new Error('Hearing aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    logRequest({
      hearingId: ctx.hearingId,
      role: 'paksh',
      stage: 'opening',
      provider: adapter.id,
      model,
      promptSha256: repairSha256,
      allowedInputs: ctx.allowedInputs,
      finishReason: 'error',
      status: 'error',
      retry: true,
    });
    throw err;
  }

  recordCallUsage(res2.usage);

  let repairParsed = null;
  let repairParseError = null;
  try {
    repairParsed = extractJsonReply(res2.text);
  } catch (err) {
    repairParseError = err.message;
  }

  let repairValidation = { valid: false, errors: [], warnings: [] };
  let repairOpening = null;
  let repairLedger = null;

  if (!repairParseError && repairParsed) {
    if (mode === 'case_opening') {
      repairLedger = repairParsed.ledger;
      repairOpening = repairParsed.opening;
    } else {
      repairLedger = emptyLedger;
      repairOpening = repairParsed;
    }

    if (stripModelVerification(repairLedger)) {
      warnings.push('model-supplied verification fields removed');
    }

    if (repairLedger) {
      repairLedger = verifyQuotes(repairLedger, ctx.case, sources);
    }

    const valLedger = repairLedger
      ? validatePaksh('ledger', repairLedger, null, { config: cfg })
      : { valid: false, errors: ['Missing ledger in repaired response'] };

    const valOpening = repairOpening
      ? validatePaksh('opening', repairOpening, repairLedger, {
          config: cfg,
          requireVerified: true,
          canaries,
        })
      : { valid: false, errors: ['Missing opening in repaired response'] };

    repairValidation = {
      valid: valLedger.valid && valOpening.valid,
      errors: [...valLedger.errors, ...valOpening.errors],
      warnings: [...warnings, ...valLedger.warnings, ...valOpening.warnings],
    };
  }

  const repairTruncated = res2.finishReason === 'length';

  if (!repairTruncated && !repairParseError && repairValidation.valid) {
    logRequest({
      hearingId: ctx.hearingId,
      role: 'paksh',
      stage: 'opening',
      provider: adapter.id,
      model,
      promptSha256: repairSha256,
      allowedInputs: ctx.allowedInputs,
      usage: res2.usage,
      finishReason: res2.finishReason,
      status: 'ok',
      retry: true,
    });

    return {
      status: 'ok',
      role: 'paksh',
      opening: repairOpening,
      ledger: repairLedger,
      warnings: repairValidation.warnings,
      errors: [],
      usage: {
        calls,
        retries,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens,
      },
      model,
      provider: adapter.id,
      allowedInputs: ctx.allowedInputs,
      promptSha256: repairSha256,
    };
  }

  // Still invalid after 1 repair
  const finalErrors = [];
  if (repairTruncated) finalErrors.push('Repair reply was truncated due to output length limits');
  if (repairParseError) finalErrors.push(`Repair reply was not valid JSON (${repairParseError})`);
  if (repairValidation.errors.length > 0) finalErrors.push(...repairValidation.errors);

  logRequest({
    hearingId: ctx.hearingId,
    role: 'paksh',
    stage: 'opening',
    provider: adapter.id,
    model,
    promptSha256: repairSha256,
    allowedInputs: ctx.allowedInputs,
    usage: res2.usage,
    finishReason: res2.finishReason,
    status: 'incomplete',
    retry: true,
  });

  return {
    status: 'incomplete',
    role: 'paksh',
    opening: null,
    ledger: null,
    warnings: repairValidation.warnings,
    errors: finalErrors.length > 0 ? finalErrors : ['Failed validation after repair'],
    usage: {
      calls,
      retries,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
    },
    model,
    provider: adapter.id,
    allowedInputs: ctx.allowedInputs,
    promptSha256: repairSha256,
  };
}
