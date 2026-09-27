<div align="center">
  <img src="https://raw.githubusercontent.com/Muhammad-Zain01/agentdock/main/logo.png?v=d971329" alt="Agentdock Logo" width="250" style="margin-bottom: 20px;"/>

**Interactive CLI playground for testing Agentdock workflows.**

[![version](https://img.shields.io/badge/version-0.1.0-blue.svg?cacheSeconds=2592000)](https://github.com/Muhammad-Zain01/agentdock-cli)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
</div>

<br />

Agentdock CLI is a local playground for a LangChain `createAgent` backed by a
LangGraph checkpointer. It consumes AgentDock events while keeping model
configuration, tools, workspace access, and persistence in the CLI application.

## ✨ Features

- **Interactive Agent Sessions:** Run prompts continuously in a local REPL.
- **Checkpointed Conversations:** Save and resume threads through LangGraph's SQLite saver.
- **Workspace Tools:** Read, search, list, write, and update files inside a workspace.
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

Start an interactive Agentdock session using the current working directory as the workspace:

```bash
yarn start
```

`yarn dev` uses a local `.sandbox` workspace for safe testing. The installed `agentdock` command uses the directory where it is launched as the workspace.

Once running, enter prompts continuously. Use `/help` for interactive commands. Use `/model` or `/models` to browse and select a model; the selected model is shown in the header.

Sessions are stored under `.agentdock/sessions/`, and LangGraph checkpoints are stored in the
SQLite database `.agentdock/checkpoints.sqlite` in the directory where the CLI is launched.
The CLI owns the SQLite saver and closes its database handle when it exits.
Approval requests resume through LangGraph using the same authorized thread.

Resume a saved session from the command line:

```bash
yarn dev --resume <session-id>
agentdock --resume <session-id>
```

Inside the CLI, use `/resume` to list saved sessions and `/resume <session-id>` to switch to one.

## 🧾 Debug Logging

Readable, colorized logs are written to `logs/agentdock-cli.log` when logging is enabled. Entries include their source module, such as `main` or `agent`:

```text
INFO  [main] agentdock-cli starting workspace=/Volumes/Code/Github/my-project
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
