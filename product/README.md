# AI ToDo Desktop

本地优先的 Windows 任务管理软件。无需 API Key 即可录入任务、编辑耗时、自动排程、接收提醒、记录进度和调整计划。

## 下载与安装

Windows 10/11 x64 用户使用 0.2.1 发布文件：

- **AI-ToDo-0.2.1-x64-nsis.exe**：安装版，可选择安装目录，创建桌面和开始菜单快捷方式，支持系统卸载。
- **AI-ToDo-0.2.1-x64-portable.exe**：便携版，双击即可运行，不需要安装。
- **SHA256SUMS.txt**：用于检查下载文件是否完整。

构建完成后这些文件位于本项目的 `release/`。可直接将 exe 分发给其他 Windows 用户，无需安装 Node.js、npm、数据库或 AI 网关。当前版本未做代码签名，Windows 可能显示未知发布者提示。便携版仍将数据存放在当前 Windows 用户目录，不会把密钥随 exe 携带到其他电脑。

## 开始使用

1. 首次打开软件会显示“欢迎使用 AI ToDo”，选择“不使用大模型”或“使用大模型估算耗时”，点击“开始使用”。本地模式无需登录或填写密钥；保存后不会重复询问。
2. 输入任务（分号或换行分隔），设置可用时间，点击“生成参考计划”。每个任务默认 **30 分钟**，手动新增计划也为 30 分钟。
3. 修改任务耗时和时间，确认计划后开始提醒。
4. 关闭窗口会隐藏至托盘；双击托盘图标或菜单中的“打开 AI ToDo”可恢复。完全退出请使用托盘菜单“退出”。

### 可选的大模型估时

点击窗口右上角的“本地模式”，打开“大模型设置”，选择“使用大模型估算耗时”。填写 API 地址、模型名称及 API Key 并保存。默认提供 DeepSeek 配置，也可填写兼容 Chat Completions 的服务（地址需包含该服务要求的 /v1 等前缀）。

- 仅生成任务时向所选服务发送任务名称，模型只负责预计耗时；排程、提醒、进度和重排在本机完成。
- 密钥由 Electron safeStorage 调用 Windows 系统加密后保存，不回显到界面。留空保留原密钥，输入新密钥可替换。
- 模型调用失败、超时或返回格式无效时，仍按每项 30 分钟生成任务，并提示回退结果。
- 选择“不使用大模型”并保存后，不再发起模型请求。已有任务的耗时保持原值。
- 所有新配置均在软件内完成，安装版不读取源码目录的 `.env`，也不依赖网关服务。从仅通过 .env 配置的旧启动方式迁移时，需在软件内重新填入密钥；已有软件内设置会继续保留。

### 数据位置

计划与提醒存放在 Electron `userData` 的 `ai-todo.sqlite` 中；Windows 通常为 `%APPDATA%/ai-todo-desktop/`。AI 设置存放在同目录的 `ai-settings.json`，密钥为加密内容。升级与卸载默认保留用户数据；“删除全部本地数据”会同时删除计划记录和保存的 AI 设置及密钥。

## 从源码运行

开发环境需要 Node.js 22 或更高版本：

```bash
npm ci
npm run build
npm start
```

也可双击项目根目录的“启动 AI ToDo.bat”。源码启动脚本安装依赖、匹配 Electron 的 SQLite 原生模块并构建后启动，不再要求 API Key。

`gateway/` 仅保留为独立开发服务，不属于桌面版运行依赖。`.env.example` 配置项只用于开发该网关；桌面模式选择始终在软件内完成。

## 测试与打包

在 `product/` 目录执行：

```bash
npm run verify       # 类型检查、单元测试、静态检查和浏览器回归
npm run pack:win     # 构建 release/win-unpacked 中的独立程序
npm run test:desktop # 验证真实 Electron、SQLite、加密设置、重启及托盘
npm run dist:win     # 完整验证并生成 Windows x64 安装版、便携版和 SHA256
```

Windows 浏览器测试默认使用 Microsoft Edge；可设置 `PLAYWRIGHT_CHANNEL`。桌面验收使用临时用户目录和假密钥，不调用付费模型。若要检查已安装的程序，可设置 `AI_TODO_TEST_EXE` 为该程序绝对路径后执行桌面验收。

构建需联网获取 Electron/NSIS 及原生依赖；运行本地模式无需联网。原生 SQLite 由 electron-builder 按 Electron 版本重建，并随程序打包。

发布前运行完整验证，检查 exe 与 SHA256SUMS.txt。公开下载时上传这三个文件，并注明版本和支持的系统。正式使用可信发布者签名时，由发布者在构建环境提供自己的代码签名证书；不要把证书或真实 API Key 放进仓库。

## 界面素材

应用沿用浅绿与纸白配色及本地猫咪素材。应用图标源文件为 `build/icon.svg`，运行 `node scripts/generate-icon.cjs` 可重新生成 PNG/ICO。猫咪素材生成记录见 `../docs/mascot-generation.md`。