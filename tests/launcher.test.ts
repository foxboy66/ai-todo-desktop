import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Windows launcher', () => {
  it('uses Windows line endings and an ASCII PowerShell entry point', () => {
    const launcherPath = resolve(__dirname, '../启动 AI ToDo.bat')
    const launcher = readFileSync(launcherPath)

    expect(launcher.toString('ascii')).toContain('wscript.exe')
    expect(launcher.toString('ascii')).toContain('launch-ai-todo.vbs')
    expect(launcher.toString('ascii')).not.toContain('product\\')
    expect(launcher.includes(Buffer.from([0x0d, 0x0a]))).toBe(true)
    expect(launcher.toString('ascii')).not.toMatch(/(^|[^\r])\n/)
    const vbsLauncher = readFileSync(resolve(__dirname, '../launch-ai-todo.vbs'), 'ascii')
    expect(vbsLauncher).toContain('shell.Run command, 0, False')
    expect(vbsLauncher).toContain('launch-ai-todo.ps1')
    const powershellScript = readFileSync(resolve(__dirname, '../启动 AI ToDo.ps1'))
    expect([...powershellScript.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const powershellText = powershellScript.toString('utf8')
    expect(powershellText).toContain("'rebuild', 'better-sqlite3', '--runtime=electron'")
    expect(powershellText).toContain('Push-Location $productRoot')
    expect(powershellText).toContain('--dist-url=https://electronjs.org/headers')

    // Renderer behavior is covered by Playwright, independently of component file layout.
    const viteConfig = readFileSync(resolve(__dirname, '../vite.config.ts'), 'utf8')
    expect(viteConfig).toContain("base: './'")

    expect(powershellText).not.toContain('Read-Host')
    expect(powershellText).not.toContain('DEEPSEEK_API_KEY')
    expect(powershellText).not.toContain('gateway')
    expect(powershellText).toContain('function Hide-LauncherConsole')
    expect(powershellText).toContain("Invoke-Npm @('run', 'build')")
    expect(powershellText).toContain("Invoke-Npm @('start')")

    const envExample = readFileSync(resolve(__dirname, '../.env.example'), 'utf8')
    expect(envExample).toContain('DEEPSEEK_API_KEY=')
    const gitignore = readFileSync(resolve(__dirname, '../.gitignore'), 'utf8')
    expect(gitignore).toContain('.env')
  })
})
