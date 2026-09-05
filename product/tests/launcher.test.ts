import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Windows launcher', () => {
  it('uses Windows line endings and an ASCII PowerShell entry point', () => {
    const launcherPath = resolve(__dirname, '../../启动 AI ToDo.bat')
    const launcher = readFileSync(launcherPath)

    expect(launcher.toString('ascii')).toContain('powershell.exe')
    expect(launcher.toString('ascii')).toContain('product\\launch-ai-todo.ps1')
    expect(launcher.includes(Buffer.from([0x0d, 0x0a]))).toBe(true)
    expect(launcher.toString('ascii')).not.toMatch(/(^|[^\r])\n/)

    const powershellScript = readFileSync(resolve(__dirname, '../启动 AI ToDo.ps1'))
    expect([...powershellScript.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const powershellText = powershellScript.toString('utf8')
    expect(powershellText).toContain("'rebuild', 'better-sqlite3', '--runtime=electron'")
    expect(powershellText).toContain('Push-Location $productRoot')
    expect(powershellText).toContain('--dist-url=https://electronjs.org/headers')

    const viteConfig = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8')
    expect(viteConfig).toContain("base: './'")

    expect(powershellText).toContain('function Read-DotEnv')
    expect(powershellText).toContain("Join-Path $productRoot '.env'")
    expect(powershellText).toContain("$envConfig['DEEPSEEK_API_KEY']")
    expect(powershellText).toContain('（.env 未配置）')

    const envExample = readFileSync(resolve(__dirname, '../.env.example'), 'utf8')
    expect(envExample).toContain('DEEPSEEK_API_KEY=')
    const gitignore = readFileSync(resolve(__dirname, '../.gitignore'), 'utf8')
    expect(gitignore).toContain('.env')
  })
})
