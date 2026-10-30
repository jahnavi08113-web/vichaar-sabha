/**
 * Scripted placeholder roles for Vipaksh and Judge.
 * In Lean Hearing v1, these roles remain scripted and run in the same envelope.
 */
export async function runScriptedOpening(ctx, scriptedStatement = '') {
  return {
    status: 'ok',
    role: ctx.role,
    statement: scriptedStatement,
    claims: [],
    ledger: {
      owner: ctx.role,
      items: [],
    },
    warnings: [],
    usage: {
      calls: 0,
      retries: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}
