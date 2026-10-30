import * as openai from './openai.mjs';
import * as anthropic from './anthropic.mjs';
import * as gemini from './gemini.mjs';
import * as xai from './xai.mjs';
import * as groq from './groq.mjs';
import { createFakeAdapter, fake } from './fake.mjs';

const ADAPTERS = {
  openai,
  anthropic,
  gemini,
  xai,
  groq,
};

export { fake };

export function getAdapter(providerId, { fake = false } = {}) {
  if (fake) {
    return createFakeAdapter(providerId);
  }
  const adapter = ADAPTERS[providerId];
  if (!adapter) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return adapter;
}
