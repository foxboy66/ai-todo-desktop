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
