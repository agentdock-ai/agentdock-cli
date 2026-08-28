<div align="center">
  <img src="https://raw.githubusercontent.com/Muhammad-Zain01/agentdock/main/logo.png?v=50cf7f7" alt="AgentDock Logo" width="250" style="margin-bottom: 20px;"/>

  **Interactive CLI playground for testing AgentDock workflows.**

  [![version](https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000)](https://github.com/Muhammad-Zain01/agentdock-cli)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
</div>

<br />

AgentDock CLI provides a local interactive environment for testing agents, tools, sessions, and workspace operations through the AgentDock harness.

## ✨ Features

- **Interactive Agent Sessions:** Run prompts continuously in a local REPL.
- **Session Persistence:** Save and inspect the active session.
- **Workspace Tools:** Read, search, list, write, and update files inside a workspace.
- **Workspace File Tools:** Execute approved file operations inside the workspace.
- **TypeScript First:** Fully typed and built for Node.js applications.

## 🚀 Setup

Install the dependencies and build the CLI:

```bash
yarn install
yarn build
```

Create a `.env` file in this directory:

```env
OPENROUTER_API_KEY=your-key
# Optional: overrides the CLI's explicit catalog default.
OPENROUTER_MODEL=your-model-id
```

The CLI loads this file automatically. Do not commit it.

## 💻 Local Development

Run the CLI directly from TypeScript:

```bash
yarn dev
```

Run the typecheck and production build:

```bash
yarn typecheck
yarn build
```

## 🛠️ Usage

Start an interactive AgentDock session using the local `.sandbox` workspace:

```bash
yarn start
```

The CLI defaults to `.sandbox` in this project.

Once running, enter prompts continuously. Use `/help` for interactive commands. Use `/model` or `/models` to browse and select a model; the selected model is shown in the header.

Sessions are stored under `sessions/` and are ignored by git.

## 🧾 Debug Logging

Readable, colorized logs are written to `logs/agentdock-cli.log` when logging is enabled. Entries include their source module, such as `main` or `agent`:

```text
INFO  [main] agentdock-cli starting workspace=/Volumes/Code/Github/agentdock
DEBUG [agent] tool started tool=list_files
INFO  [agent] agent prompt completed durationMs=8312 chunks=17 tools=1
```

```bash
AGENTDOCK_LOGGING=true
tail -f logs/agentdock-cli.log
```

Set `AGENTDOCK_LOGGING=false` to disable file logging.

Reset the active log file when starting a fresh debugging session:

```bash
yarn logs:clear
```
