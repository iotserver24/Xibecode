/**
 * Provider types and configurations for AI model providers.
 *
 * @module types/provider
 */

export const PROVIDER_CONFIGS = {
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-6',
    format: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    name: 'Anthropic',
    apiKeyUrl: 'https://platform.claude.com/settings/keys'
  },
  routingrun: {
    baseUrl: 'https://api.routing.run/v1',
    defaultModel: 'route/glm-5.1',
    format: 'openai',
    envKey: 'ROUTINGRUN_API_KEY',
    name: 'Routing.run',
    apiKeyUrl: 'https://app.routing.run/dashboard/keys'
  },
  zenllm: {
    baseUrl: 'https://api.zenllm.org/v1',
    defaultModel: 'zhipu/glm-5.1',
    format: 'openai',
    envKey: 'ZENLLM_API_KEY',
    name: 'zenllm.org',
    apiKeyUrl: 'https://zenllm.org/dashboard'
  },
  zai: {
    baseUrl: 'https://api.z.ai/api/paas/v4',
    defaultModel: 'glm-5.1',
    format: 'openai',
    envKey: 'ZAI_API_KEY',
    name: 'Zhipu AI (z.ai)',
    apiKeyUrl: 'https://z.ai/manage-apikey/apikey-list'
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    format: 'openai',
    envKey: 'OPENAI_API_KEY',
    name: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys'
  },
  alibaba: {
    baseUrl: 'https://coding-intl.dashscope.aliyuncs.com',
    defaultModel: 'qwen3.5-coder-plus',
    format: 'anthropic',
    envKey: 'ALIBABA_API_KEY',
    name: 'Alibaba (Qwen)',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey'
  },
  kimi: {
    baseUrl: 'https://api.moonshot.ai/anthropic',
    defaultModel: 'kimi-k2.6',
    format: 'anthropic',
    envKey: 'MOONSHOT_API_KEY',
    name: 'Moonshot (Kimi)',
    apiKeyUrl: 'https://platform.moonshot.ai/console/api-keys'
  },
  grok: {
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-0709',
    format: 'openai',
    envKey: 'XAI_API_KEY',
    name: 'Grok (xAI)',
    apiKeyUrl: 'https://console.x.ai'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4',
    format: 'openai',
    envKey: 'DEEPSEEK_API_KEY',
    name: 'DeepSeek',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys'
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    format: 'openai',
    envKey: 'OPENROUTER_API_KEY',
    name: 'OpenRouter',
    apiKeyUrl: 'https://openrouter.ai/keys'
  },
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.0-pro-preview',
    format: 'openai',
    envKey: 'GOOGLE_API_KEY',
    name: 'Google (Gemini)',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey'
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    format: 'openai',
    envKey: 'GROQ_API_KEY',
    name: 'Groq',
    apiKeyUrl: 'https://console.groq.com/keys'
  },
} as const;

export type ProviderType = keyof typeof PROVIDER_CONFIGS | 'custom';
