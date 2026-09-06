export type AiSettings = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
};

export type AiSettingsInput = Omit<AiSettings, 'hasApiKey'> & { apiKey?: string };
export type AiRuntimeSettings = Omit<AiSettings, 'hasApiKey'> & { apiKey: string };

export const defaultAiSettings: AiSettings = {
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  hasApiKey: false,
};
