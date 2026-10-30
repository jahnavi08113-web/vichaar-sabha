/**
 * Robustly extract a single JSON object from an LLM reply string.
 * Strips markdown code fences (```json ... ```) and leading/trailing prose.
 */
export function extractJsonReply(text) {
  if (typeof text !== 'string') {
    throw new Error('Expected string reply from model');
  }

  let cleaned = text.trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // Continue to fence / block extraction
  }

  // Look for ```json ... ``` or ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    const candidate = fenceMatch[1].trim();
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch {
      cleaned = candidate;
    }
  }

  // Find outermost curly braces { ... }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (err) {
      throw new Error(`Failed to parse extracted JSON object: ${err.message}`);
    }
  }

  throw new Error('No valid JSON object found in model reply');
}
