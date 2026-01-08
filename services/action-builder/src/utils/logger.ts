import * as fs from "fs";
import * as path from "path";

/**
 * File logger for persistent logging
 * Each instance manages its own log file, allowing parallel execution
 */
export class FileLogger {
  private logFile: string | null = null;
  private writeStream: fs.WriteStream | null = null;

  /**
   * Initialize with auto-generated filename
   */
  initialize(baseDir: string = ".", prefix: string = "action-builder"): string {
    const logsDir = path.join(baseDir, "logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const now = new Date();
    const timestamp =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0") +
      String(now.getHours()).padStart(2, "0") +
      String(now.getMinutes()).padStart(2, "0") +
      String(now.getSeconds()).padStart(2, "0");

    this.logFile = path.join(logsDir, `${prefix}_${timestamp}.log`);
    this.writeStream = fs.createWriteStream(this.logFile, { flags: "a" });

    return this.logFile;
  }

  /**
   * Initialize with explicit log file path
   */
  initializeWithPath(logFilePath: string): string {
    const logsDir = path.dirname(logFilePath);

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    this.logFile = logFilePath;
    this.writeStream = fs.createWriteStream(this.logFile, { flags: "a" });

    return this.logFile;
  }

  write(message: string): void {
    if (this.writeStream) {
      this.writeStream.write(message + "\n");
    }
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  getLogFile(): string | null {
    return this.logFile;
  }
}

/**
 * Global file logger instance for backward compatibility
 * Note: For parallel execution, create separate FileLogger instances
 */
export const fileLogger = new FileLogger();

export type LogLevel = "info" | "warn" | "error" | "debug";

/**
 * Check if message should be output to console
 *
 * Quiet mode (ACTION_BUILDER_QUIET=true):
 * - ActionRecorder logs (detailed browser/LLM operations) → file only
 * - Task-level logs (Coordinator/BuildTaskRunner/QueueWorker) → console + file
 * - Error/warn logs → always console + file
 */
function shouldOutputToConsole(level: LogLevel, message: string): boolean {
  // Always output errors and warnings to console
  if (level === "error" || level === "warn") {
    return true;
  }

  // If not in quiet mode, output everything to console
  if (process.env.ACTION_BUILDER_QUIET !== "true") {
    return true;
  }

  // In quiet mode, only output task-level logs to console
  const taskPrefixes = [
    "[Coordinator]",
    "[BuildTaskRunner",
    "[QueueWorker]",
    "[Metrics]",
  ];

  return taskPrefixes.some((prefix) => message.includes(prefix));
}

/**
 * Log a message with level and timestamp
 */
export function log(level: LogLevel, ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  const message =
    prefix +
    " " +
    args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg)))
      .join(" ");

  // Always write to file
  fileLogger.write(message);

  // Conditionally output to console based on quiet mode
  const outputToConsole = shouldOutputToConsole(level, message);

  if (outputToConsole) {
    switch (level) {
      case "error":
        console.error(prefix, ...args);
        break;
      case "warn":
        console.warn(prefix, ...args);
        break;
      case "debug":
        if (process.env.DEBUG) {
          console.log(prefix, ...args);
        }
        break;
      default:
        console.log(prefix, ...args);
    }
  }
}

/**
 * Log raw output without formatting (for tables, etc.)
 */
export function logRaw(message: string): void {
  fileLogger.write(message);
  console.log(message);
}
