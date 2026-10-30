export const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    company: 'OpenAI',
    color: '#10a37f',
    keyHint: 'Starts with sk-',
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Claude',
    company: 'Anthropic',
    color: '#d97757',
    keyHint: 'Starts with sk-ant-',
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    company: 'Google',
    color: '#4285f4',
    keyHint: 'From Google AI Studio',
    keysUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'xai',
    name: 'Grok',
    company: 'xAI',
    color: '#1d9bf0',
    keyHint: 'From the xAI console',
    keysUrl: 'https://console.x.ai/',
  },
  {
    id: 'groq',
    name: 'Groq',
    company: 'Groq',
    color: '#f55036',
    keyHint: 'Starts with gsk_',
    keysUrl: 'https://console.groq.com/keys',
  },
];

export const PROVIDER_MAP = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
