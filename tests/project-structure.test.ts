import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');

describe('项目目录结构', () => {
  it('根目录只保留用户启动入口，启动实现集中在 scripts/launch', () => {
    expect(existsSync(resolve(root, '启动 AI ToDo.bat'))).toBe(true);
    expect(existsSync(resolve(root, 'launch-ai-todo.ps1'))).toBe(false);
    expect(existsSync(resolve(root, 'launch-ai-todo.vbs'))).toBe(false);
    expect(existsSync(resolve(root, '启动 AI ToDo.ps1'))).toBe(false);
    expect(existsSync(resolve(root, 'scripts/launch/launch-ai-todo.ps1'))).toBe(true);
    expect(existsSync(resolve(root, 'scripts/launch/launch-ai-todo.vbs'))).toBe(true);
  });

  it('开发脚本按职责归档，不在 scripts 根目录散放文件', () => {
    const filesAtScriptsRoot = readdirSync(resolve(root, 'scripts'), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    expect(filesAtScriptsRoot).toEqual([]);
    for (const relativePath of [
      'scripts/build/generate-icon.cjs',
      'scripts/build/release-checksums.cjs',
      'scripts/smoke/smoke-desktop.cjs',
      'scripts/smoke/smoke-installer.ps1',
      'scripts/smoke/smoke-portable.cjs',
      'scripts/test/test-store.cjs',
    ]) expect(existsSync(resolve(root, relativePath))).toBe(true);
  });
});
