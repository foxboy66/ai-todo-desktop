import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { defaultAiSettings, type AiSettingsInput, type AiRuntimeSettings } from '../shared/ai-settings';

type KeyVault = {
  isEncryptionAvailable: () => boolean;
  encryptString: (value: string) => Buffer;
  decryptString: (value: Buffer) => string;
};
const settingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().max(2048),
  model: z.string().trim().max(200),
  apiKey: z.string().trim().max(4096).optional(),
});

export class AiSettingsStore {
  constructor(private readonly path: string, private readonly vault: KeyVault) {}

  private read() {
    if (!existsSync(this.path)) return { ...defaultAiSettings, encryptedKey: '' };
    const saved = JSON.parse(readFileSync(this.path, 'utf8'));
    const settings = settingsSchema.parse(saved);
    return { ...settings, encryptedKey: z.string().parse(saved.encryptedKey) };
  }

  get() {
    const { enabled, baseUrl, model, encryptedKey } = this.read();
    return { enabled, baseUrl, model, hasApiKey: Boolean(encryptedKey) };
  }

  runtime(): AiRuntimeSettings {
    const settings = this.read();
    return {
      enabled: settings.enabled,
      baseUrl: settings.baseUrl,
      model: settings.model,
      apiKey: settings.enabled && settings.encryptedKey
        ? this.vault.decryptString(Buffer.from(settings.encryptedKey, 'base64')) : '',
    };
  }

  save(input: AiSettingsInput) {
    const next = settingsSchema.parse(input);
    let encryptedKey = this.read().encryptedKey;
    if (next.enabled) {
      let url: URL;
      try { url = new URL(next.baseUrl); } catch { throw new Error('请输入有效的 API 地址。'); }
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error('API 地址必须使用 HTTPS，且不能包含账号、查询参数或片段。');
      }
      if (!next.model) throw new Error('请填写模型名称。');
      if (!next.apiKey && !encryptedKey) throw new Error('启用大模型前，请填写 API Key。');
    }
    if (next.apiKey) {
      if (!this.vault.isEncryptionAvailable()) throw new Error('系统密钥加密暂不可用，请使用本地模式。');
      encryptedKey = this.vault.encryptString(next.apiKey).toString('base64');
    }
    const saved = { enabled: next.enabled, baseUrl: next.baseUrl.replace(/\/+$/, ''), model: next.model, encryptedKey };
    writeFileSync(this.path + '.tmp', JSON.stringify(saved), { mode: 0o600 });
    renameSync(this.path + '.tmp', this.path);
    return this.get();
  }

  clear() {
    writeFileSync(this.path, JSON.stringify({ ...defaultAiSettings, encryptedKey: '' }), { mode: 0o600 });
  }
}
