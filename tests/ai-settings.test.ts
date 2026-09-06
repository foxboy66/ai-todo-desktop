import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSettingsStore } from '../src/main/ai-settings';
import { defaultAiSettings } from '../src/shared/ai-settings';

let dir: string;
let store: AiSettingsStore;
const vault = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((s: string) => Buffer.from('encrypted:' + s)),
  decryptString: vi.fn((b: Buffer) => b.toString().slice(10)),
};
beforeEach(() => {
  vi.clearAllMocks();
  vault.isEncryptionAvailable.mockReturnValue(true);
  dir = mkdtempSync(join(tmpdir(), 'ai-todo-settings-'));
  store = new AiSettingsStore(join(dir, 'settings.json'), vault);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
describe('AI 设置持久化', () => {
  it('新安装默认离线且无需密钥', () => {
    expect(store.get()).toEqual(defaultAiSettings);
    expect(store.runtime().apiKey).toBe('');
    expect(store.save(defaultAiSettings).enabled).toBe(false);
    expect(vault.encryptString).not.toHaveBeenCalled();
  });
  it('启用必须提供密钥，校验失败不改变设置', () => {
    expect(() => store.save({ ...defaultAiSettings, enabled: true })).toThrow('API Key');
    expect(store.get()).toEqual(defaultAiSettings);
  });
  it('密钥加密保存，重启后恢复，关闭后不解密，重新启用保留密钥', () => {
    const publicSettings = store.save({ ...defaultAiSettings, enabled: true, apiKey: 'secret-test-key' });
    expect(publicSettings).not.toHaveProperty('apiKey');
    expect(readFileSync(join(dir, 'settings.json'), 'utf8')).not.toContain('secret-test-key');
    store = new AiSettingsStore(join(dir, 'settings.json'), vault);
    expect(store.runtime().apiKey).toBe('secret-test-key');
    store.save({ ...publicSettings, enabled: false });
    vault.decryptString.mockClear();
    expect(store.runtime().apiKey).toBe('');
    expect(vault.decryptString).not.toHaveBeenCalled();
    store.save({ ...publicSettings, enabled: true, apiKey: '' });
    expect(store.runtime().apiKey).toBe('secret-test-key');
    store.clear();
    expect(store.get()).toEqual(defaultAiSettings);
  });
  it.each(['http://api.example.com', 'https://user:pass@example.com', 'https://example.com?key=abc', 'broken'])('拒绝不安全地址 %s', (baseUrl) => {
    expect(() => store.save({ ...defaultAiSettings, baseUrl, enabled: true, apiKey: 'key' })).toThrow();
    expect(store.get().enabled).toBe(false);
  });
  it('加密不可用时允许本地模式，但不写入明文密钥', () => {
    vault.isEncryptionAvailable.mockReturnValue(false);
    expect(() => store.save({ ...defaultAiSettings, enabled: true, apiKey: 'key' })).toThrow('加密');
    expect(store.save(defaultAiSettings).enabled).toBe(false);
  });
});


describe('首次使用选择与升级兼容', () => {
  it('首次选择本地模式后持久化完成标记，清除数据后恢复首次状态', () => {
    expect(store.get().setupCompleted).toBe(false);
    store.save(defaultAiSettings);
    store = new AiSettingsStore(join(dir, 'settings.json'), vault);
    expect(store.get().setupCompleted).toBe(true);
    expect(store.get().enabled).toBe(false);
    store.clear();
    expect(store.get().setupCompleted).toBe(false);
  });
  it('旧版已保存设置升级后不重复询问，也不丢失密钥', () => {
    store.save({ ...defaultAiSettings, enabled: true, apiKey: 'legacy-key' });
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    delete saved.setupCompleted;
    writeFileSync(join(dir, 'settings.json'), JSON.stringify(saved));
    expect(store.get().setupCompleted).toBe(true);
    expect(store.runtime().apiKey).toBe('legacy-key');
  });
  it('损坏的设置可通过重新选择本地模式恢复，不阻止首次使用', () => {
    writeFileSync(join(dir, 'settings.json'), 'invalid JSON');
    expect(() => store.get()).toThrow();
    expect(store.save(defaultAiSettings)).toMatchObject({ enabled: false, setupCompleted: true, hasApiKey: false });
  });
});
