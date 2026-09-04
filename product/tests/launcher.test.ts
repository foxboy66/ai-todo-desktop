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
    expect(launcher.toString('ascii')).not.toMatch(/(^|[^\\r])\\n/)
  })
})
