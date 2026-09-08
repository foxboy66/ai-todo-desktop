import { useState } from 'react';
import type { AiSettings } from '../shared/ai-settings';

export function AiSettingsForm({ settings, onSaved, onClose, firstRun = false }: {
  settings: AiSettings;
  firstRun?: boolean;
  onSaved: (settings: AiSettings) => void;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl);
  const [model, setModel] = useState(settings.model);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <form className="ai-settings-form" onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await window.aiTodo.saveAiSettings({ enabled, baseUrl, model, apiKey });
      setApiKey('');
      onSaved(saved);
    } catch {
      setError('设置未保存。请检查 API 地址、模型名称和密钥；系统加密不可用时可选择本地模式。');
    } finally { setSaving(false); }
  }}>
    <h2>{firstRun ? "欢迎使用 AI ToDo" : "大模型设置"}</h2>
    <p>{firstRun ? "先选择任务耗时的估算方式。无需 API Key 也能使用任务管理、排程和提醒，之后可随时在设置中更改。" : "默认不使用大模型，新任务耗时为 30 分钟，可随时手动修改。"}</p>
    <fieldset disabled={saving}>
      <legend>任务耗时估算方式</legend>
      <label className="mode-option"><input type="radio" name="ai-mode" checked={!enabled} onChange={() => setEnabled(false)} />不使用大模型</label>
      <label className="mode-option"><input type="radio" name="ai-mode" checked={enabled} onChange={() => setEnabled(true)} />使用大模型估算耗时</label>
      {enabled && <div className="ai-fields">
        <p>生成任务时，仅将任务名称发送给你配置的服务。排程、提醒和进度记录仍在本机完成。</p>
        <label>API 地址<input type="url" required value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com" /></label>
        <label>模型名称<input required value={model} onChange={(e) => setModel(e.target.value)} /></label>
        <label>API Key<input type="password" autoComplete="off" spellCheck={false} required={!settings.hasApiKey} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={settings.hasApiKey ? '已保存，留空保留原密钥' : '输入你的 API Key'} /></label>
        <small>密钥由系统加密保存在本机。使用兼容 Chat Completions 的接口；地址包含服务所需的 /v1 等前缀。</small>
      </div>}
      {!enabled && <p>每项新任务默认 30 分钟，耗时可手动修改，无需联网或填写密钥。</p>}
    </fieldset>
    {error && <p role="alert">{error}</p>}
    <div className="form-footer">
      {!firstRun && <button type="button" className="secondary" disabled={saving} onClick={onClose}>取消</button>}
      <button type="submit" className="primary" disabled={saving}>{saving ? '正在保存…' : firstRun ? '开始使用' : '保存设置'}</button>
    </div>
  </form>;
}
