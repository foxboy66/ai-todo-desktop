import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
const config = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
describe('Windows 分发配置', () => {
  it('包含安装与便携版，使用构建工具支持的文件名变量', () => {
    expect(config.build.win.target.map((item: { target: string }) => item.target)).toEqual(['nsis', 'portable']);
    for (const target of ['nsis', 'portable']) {
      const name = config.build[target].artifactName;
      expect(name).toContain('-' + target + '.');
      const macros = [...name.matchAll(/\$\{([^}]+)\}/g)].map(match => match[1]);
      expect(macros).toEqual(['version', 'arch', 'ext']);
    }
    expect(config.scripts.postinstall).toContain('install-app-deps');
    expect(config.build.asarUnpack).toContain('**/*.node');
  });
  it('仅打包构建结果，用户可选择安装位置且卸载保留数据', () => {
    expect(config.build.files).toEqual(['dist/**/*', 'package.json']);
    expect(config.build.nsis.allowToChangeInstallationDirectory).toBe(true);
    expect(config.build.nsis.deleteAppDataOnUninstall).toBe(false);
    expect(config.build.nsis.perMachine).toBe(false);
  });
});
