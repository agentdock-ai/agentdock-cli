import path from "node:path";
import pino, { type Logger } from "pino";

export type AppLogger = Logger;

export function createLogger(): AppLogger {
  if (process.env.AGENTDOCK_LOGGING === "false") {
    return pino({ level: "silent", name: "agentdock-cli" });
  }

  const logPath = path.resolve(process.cwd(), "logs/agentdock-cli.log");
  const messageFormat = [
    "[{module}] {msg}",
    "{if workspace} workspace={workspace}{end}",
    "{if sessionId} session={sessionId}{end}",
    "{if command} command={command}{end}",
    "{if promptLength} promptLength={promptLength}{end}",
    "{if modelId} model={modelId}{end}",
    "{if toolName} tool={toolName}{end}",
    "{if error} error={error}{end}",
    "{if durationMs} durationMs={durationMs}{end}",
    "{if chunkCount} chunks={chunkCount}{end}",
    "{if textLength} textLength={textLength}{end}",
    "{if toolCallCount} tools={toolCallCount}{end}",
  ].join("");
  const transport = pino.transport({
    target: "pino-pretty",
    options: {
      // Log files are opened in editors and do not render terminal color codes.
      colorize: false,
      destination: logPath,
      hideObject: false,
      ignore: "pid,hostname,name",
      messageFormat,
      mkdir: true,
      translateTime: "SYS:standard",
    },
  });

  return pino(
    {
      name: "agentdock-cli",
      level: "debug",
      redact: [
        "apiKey",
        "api_key",
        "authorization",
        "headers.authorization",
        "OPENROUTER_API_KEY",
      ],
    },
    transport,
  );
}
