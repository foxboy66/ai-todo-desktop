# AI ToDo

[English](README.md)

AI ToDo 是一款本地优先的 Windows 桌面任务规划应用。它可以将任务列表转换为可执行的时间安排，将计划保存在本地 SQLite 数据库中，并在执行过程中提供倒计时、进度同步和任务结束提醒。

当前版本：**0.2.3**

## 功能特性

- 本地模式无需 API 密钥即可使用。
- 可在应用内设置中启用 AI 任务耗时估算。发送给模型网关的只有任务标题，计划、排程、提醒、进度和本地数据均保留在桌面应用中。
- 支持根据可用时间段排程，任务耗时可以跨时间段连续安排。
- 不在不同任务之间额外保留 15 分钟缓冲时间。
- 在确认计划界面修改任务时间后，会立即保存到本地草稿。
- 倒计时根据当前时刻和当前任务的实际结束时刻计算。
- 支持暂停和继续任务。
- 提前完成任务后，可以开始下一个任务，并自动重新安排后续时间段。
- 任务开始、进度同步和任务结束时，提供应用内弹窗和声音提醒。
- 使用本地 SQLite 持久化、系统托盘功能，以及 Electron safeStorage 加密保存 API 密钥。关闭窗口后，单击托盘图标即可恢复并切到前台；最小化窗口也会自动还原。

## 环境要求

- Windows 10 或 Windows 11（x64）
- Node.js 22 或更高版本
- npm

## 快速开始

```powershell
npm ci
npm run build
npm start
```

首次启动时，可以选择本地耗时估算，也可以在应用的 AI 设置中配置可选的 AI 服务。正常使用桌面应用不需要创建 `.env` 文件。

仓库中的 `gateway/` 是用于开发和兼容场景的可选独立网关，桌面应用正常运行不依赖它。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev:renderer` | 启动 Vite 渲染器开发服务 |
| `npm run build` | 构建 Electron 主进程和渲染器 |
| `npm start` | 启动构建后的桌面应用 |
| `npm run typecheck` | 执行 TypeScript 类型检查 |
| `npm test` | 执行单元测试和集成测试 |
| `npm run lint` | 执行 Oxlint 检查 |
| `npm run test:ui` | 执行 Playwright 渲染器测试 |
| `npm run test:desktop` | 对打包后的桌面应用执行冒烟测试 |
| `npm run verify` | 执行完整验证套件 |
| `npm run dist:win` | 构建 Windows NSIS 安装包和便携版程序 |

Windows 用户也可以直接使用以下启动脚本：

- `启动 AI ToDo.bat`
- `启动 AI ToDo.ps1`
- `launch-ai-todo.ps1`
- `launch-ai-todo.vbs`

启动脚本会自动安装依赖、在需要时重新构建 Electron 原生模块、构建应用并启动。

## 数据与隐私

应用会将本地数据库和设置保存在 Electron 的应用数据目录：

```text
%APPDATA%/ai-todo-desktop
```

在平台支持时，API 密钥会通过 Electron safeStorage 保存。AI 耗时估算是可选功能。启用后，任务标题可能会发送到配置的模型端点；桌面应用的估算请求不会发送任务备注、排程状态或本地数据库内容。

## 打包发布

执行 `npm run dist:win` 后，安装包和便携版程序会写入 `release/`。这些文件已被 Git 忽略，建议作为 GitHub Release 附件发布，不要提交到源码仓库。

源码仓库包含打包脚本和图标源文件，但不包含 `node_modules/`、`dist/`、`release/`、测试报告、本地数据库、`.env` 或历史安装包。

## 仓库结构

```text
.
├── build/                 # Electron 图标源文件
├── e2e/                   # Playwright UI 测试
├── gateway/               # 可选的独立开发网关
├── scripts/               # 打包和桌面冒烟测试脚本
├── src/
│   ├── main/              # Electron 主进程和持久化逻辑
│   ├── renderer/          # React 渲染器界面
│   └── shared/            # 排程和领域逻辑
├── tests/                 # 单元测试和集成测试
├── .github/workflows/     # 持续集成配置
├── package.json
├── LICENSE
└── README.md
```

## 参与贡献

欢迎提交问题反馈和 Pull Request。提交修改前请运行 `npm run verify`。请不要将用户数据、API 密钥、安装包和生成的构建文件提交到仓库。

详细流程请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

AI ToDo 使用 [MIT License](LICENSE) 开源。
