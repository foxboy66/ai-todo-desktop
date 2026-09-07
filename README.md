# AI ToDo [简体中文](README.zh-CN.md)

AI ToDo is a local-first Windows desktop task planner. It turns a list of tasks into an executable schedule, keeps the plan in a local SQLite database, and provides countdowns, progress check-ins, and completion reminders while you work.

Current release: **0.2.3**

## Features

- Optional AI estimation through the in-app settings. Only task titles are sent to the configured model gateway; the plan, schedule, reminders, progress, and local data stay in the desktop app.
- Availability-window scheduling with tasks carried across windows when necessary.
- Countdown is calculated from the current time to the active task's actual end time.
- Start, progress-check, and task-end notifications use an in-app popup and sound.
- Local SQLite persistence, single-click system tray restore, and encrypted API-key storage through Electron safeStorage.

## Requirements

- Windows 10 or Windows 11 (x64)
- Node.js 22 or newer
- npm

## Quick start

```powershell
npm ci
npm run build
npm start
```

For the first launch, choose local estimation or configure an optional AI provider in the app's AI settings. The application does not require a .env file for normal desktop use.

The repository also includes a small optional gateway under gateway/ for development and compatibility scenarios. It is not required by the desktop runtime.

## Development commands

| Command | Purpose |
| --- | --- |
| npm run dev:renderer | Start the Vite renderer during UI development |
| npm run build | Build the Electron main process and renderer |
| npm start | Start the built desktop application |
| npm run typecheck | Run TypeScript checks |
| npm test | Run unit and integration tests |
| npm run lint | Run Oxlint |
| npm run test:ui | Run Playwright renderer tests |
| npm run test:desktop | Smoke-test the packaged desktop app |
| npm run verify | Run the complete verification suite |
| npm run dist:win | Build Windows NSIS and portable packages |

The launcher scripts are also available for Windows users:

- 启动 AI ToDo.bat
- 启动 AI ToDo.ps1
- launch-ai-todo.ps1
- launch-ai-todo.vbs

The launcher automatically installs dependencies, rebuilds Electron native modules when needed, builds the app, and starts it.

## Data and privacy

The app stores its local database and settings in Electron's application data directory:

```text
%APPDATA%/ai-todo-desktop
```

API keys are stored through Electron safeStorage when the platform supports it. AI estimation is optional. When enabled, task titles may be sent to the configured model endpoint; task notes, schedule state, and local database contents are not sent by the desktop app's estimation request.


## Repository layout

```text
.
├── build/                 # Electron icon sources
├── e2e/                   # Playwright UI tests
├── gateway/               # Optional standalone development gateway
├── scripts/               # Packaging and desktop smoke-test scripts
├── src/
│   ├── main/              # Electron main process and persistence
│   ├── renderer/          # React renderer UI
│   └── shared/            # Scheduling and domain logic
├── tests/                 # Unit and integration tests
├── .github/workflows/     # Continuous integration
├── package.json
├── LICENSE
└── README.md
```

## Contributing

Bug reports and pull requests are welcome. Please run npm run verify before submitting a change. 

See CONTRIBUTING.md for the project workflow.

## License

AI ToDo is released under the MIT License.
