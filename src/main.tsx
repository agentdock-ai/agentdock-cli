import { loadEnvFile } from "node:process";
import { CliApplication } from "./application/cli-application.js";
import { cliUsage, parseCliOptions } from "./config/cli-options.js";
import { createLogger } from "./infrastructure/logging/logger.js";

const environmentError = loadEnvironment();
const logger = createLogger().child({ module: "main" });

async function main(): Promise<void> {
  try {
    if (environmentError) throw environmentError;
    const options = parseCliOptions(process.argv.slice(2));
    if (options.command === "help") {
      console.log(cliUsage);
      return;
    }
    await new CliApplication().run(options);
  } catch (error: unknown) {
    logger.error({ err: error }, "agentdock-cli failed");
    console.error(error instanceof Error ? error.message : String(error));
    console.error(cliUsage);
    process.exitCode = 1;
  }
}

void main();

function loadEnvironment(): unknown {
  try {
    loadEnvFile();
    return null;
  } catch (error: unknown) {
    return isFileNotFound(error) ? null : error;
  }
}

function isFileNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
