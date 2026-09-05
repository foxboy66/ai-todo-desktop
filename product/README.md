# AI ToDo Desktop

AI 个性化 ToDo 的 MVP 桌面实现，按根目录产品设计文档和 `docs/AI_TODO_MVP_技术方案.md` 构建。

## 一键启动（Windows）

复制 `.env.example` 为 `.env`，填写 `DEEPSEEK_API_KEY`，然后双击项目根目录的 `启动 AI ToDo.bat`。启动脚本会自动读取 `product/.env`，配置好 API Key 后不会再次询问。

`.env` 只保存在本机，已被 Git 忽略，不要把真实 API Key 提交到仓库。
## 运行

```bash
npm install
npm run build
npm start
```

本地 AI 网关（可选）：

```bash
cd gateway
npm install
npm run dev
```

未配置 `AI_GATEWAY_URL` 时，桌面端使用本地确定性解析作为降级策略；配置后会调用网关的 `/parse_tasks` 接口。任务、计划版本、提醒节点和进度事件保存在 Electron `userData` 目录下的 SQLite 文件中。

## 验证

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

## 清新小猫主题与界面回归

桌面端的录入、确认和执行页面采用浅绿与纸白配色，侧栏配有戴绿色小方巾的奶油色小猫，支持小窗口自动重排。输入框、按钮具有键盘焦点提示；阻碍弹窗支持 Tab 循环和 Escape 关闭。

运行浏览器回归测试：

```bash
npm run test:ui
```

Windows 默认使用已安装的 Microsoft Edge。其他系统先运行 `npx playwright install chromium`；也可以通过 `PLAYWRIGHT_CHANNEL` 指定已安装的浏览器。

测试自动构建正式渲染器，并在 1440、1080、390 像素宽度下检查任务录入、时段增删、任务编辑、确认、进度、完成、阻碍重排、空状态和失败重试。仅 Electron IPC 边界使用测试替身，排程与解析使用原有领域函数；不会读写实际用户数据库或调用付费 AI 接口。测试截图输出到 `test-results/`。
