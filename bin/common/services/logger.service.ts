import "colorts/lib/string";
import fs from "fs-extra";
import path from "path";
import { EventEmitter } from "events";

/**
 * Log levels for the logging service
 */
export enum LogLevel {
  DEBUG = "DEBUG",
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  FATAL = "FATAL",
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, any>;
  stack?: string;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  logDir: string;
  maxLogFileSize: number; // in bytes
  maxLogFiles: number;
  logToConsole: boolean;
  logLevel: LogLevel;
}

/**
 * Centralized logging service for Reach Backend
 * 
 * Features:
 * - Persistent file logging with rotation
 * - Automatic log saving on shutdown/crash
 * - Console output with colors
 * - Structured log entries
 * - Event emission for external handlers
 */
class LoggerService extends EventEmitter {
  private static instance: LoggerService;
  private config: LoggerConfig;
  private currentLogFile: string;
  private logBuffer: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  private constructor() {
    super();
    
    this.config = {
      logDir: process.env.LOG_DIR || "./logs",
      maxLogFileSize: parseInt(process.env.MAX_LOG_SIZE || "10485760"), // 10MB default
      maxLogFiles: parseInt(process.env.MAX_LOG_FILES || "30"),
      logToConsole: process.env.LOG_TO_CONSOLE !== "false",
      logLevel: (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO,
    };

    this.currentLogFile = this.generateLogFileName();
    this.initializeLogDir();
    this.startFlushInterval();
    this.setupShutdownHandlers();
  }

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  /**
   * Initialize log directory
   */
  private initializeLogDir(): void {
    const logPath = this.getLogDirPath();
    if (!fs.existsSync(logPath)) {
      fs.mkdirSync(logPath, { recursive: true });
    }
  }

  /**
   * Get absolute path to log directory
   */
  private getLogDirPath(): string {
    return path.resolve(process.cwd(), this.config.logDir);
  }

  /**
   * Generate log file name with timestamp
   */
  private generateLogFileName(): string {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0];
    return `reach-${dateStr}.log`;
  }

  /**
   * Get full path to current log file
   */
  private getLogFilePath(): string {
    return path.join(this.getLogDirPath(), this.currentLogFile);
  }

  /**
   * Start periodic flush interval
   */
  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 5000); // Flush every 5 seconds
  }

  /**
   * Setup shutdown handlers for graceful logging
   */
  private setupShutdownHandlers(): void {
    const shutdownHandler = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;

      this.fatal("Server", `Server shutdown initiated: ${signal}`);
      await this.saveShutdownLog(signal);
      await this.flush();

      if (this.flushInterval) {
        clearInterval(this.flushInterval);
      }
    };

    // Graceful shutdown signals
    process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
    process.on("SIGINT", () => shutdownHandler("SIGINT"));
    process.on("SIGHUP", () => shutdownHandler("SIGHUP"));

    // Uncaught exception handler
    process.on("uncaughtException", async (error) => {
      this.fatal("Server", `Uncaught Exception: ${error.message}`, { stack: error.stack });
      await this.saveCrashLog(error, "uncaughtException");
      await this.flush();
      this.emit("crash", { type: "uncaughtException", error });
    });

    // Unhandled rejection handler
    process.on("unhandledRejection", async (reason, promise) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      this.fatal("Server", `Unhandled Rejection: ${errorMessage}`, { stack, promise: String(promise) });
      await this.saveCrashLog(reason as Error, "unhandledRejection");
      await this.flush();
      this.emit("crash", { type: "unhandledRejection", error: reason });
    });
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    return levels.indexOf(level) >= levels.indexOf(this.config.logLevel);
  }

  /**
   * Format log entry for file
   */
  private formatLogEntry(entry: LogEntry): string {
    const base = `[${entry.timestamp}] [${entry.level}] [${entry.component}] ${entry.message}`;
    if (entry.metadata) {
      return `${base} | ${JSON.stringify(entry.metadata)}`;
    }
    if (entry.stack) {
      return `${base}\n${entry.stack}`;
    }
    return base;
  }

  /**
   * Format log for console with colors
   */
  private formatConsoleLog(entry: LogEntry): string {
    const prefix = `[REACHX - ${entry.component}]`;
    const message = entry.message;
    
    switch (entry.level) {
      case LogLevel.DEBUG:
        return `${prefix} ${message}`.gray;
      case LogLevel.INFO:
        return `${prefix} ${message}`.green;
      case LogLevel.WARN:
        return `${prefix} ${message}`.yellow;
      case LogLevel.ERROR:
        return `${prefix} ${message}`.red;
      case LogLevel.FATAL:
        return `${prefix} ${message}`.bgRed.white;
      default:
        return `${prefix} ${message}`;
    }
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    component: string,
    message: string,
    metadata?: Record<string, any>
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      metadata,
      stack: metadata?.stack,
    };
  }

  /**
   * Add log entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);

    if (this.config.logToConsole) {
      console.log(this.formatConsoleLog(entry));
    }

    this.emit("log", entry);
  }

  /**
   * Flush buffer to file
   */
  public async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return;

    const logFile = this.getLogFilePath();
    const entries = this.logBuffer.splice(0, this.logBuffer.length);
    const content = entries.map((e) => this.formatLogEntry(e)).join("\n") + "\n";

    try {
      await fs.appendFile(logFile, content);
      await this.rotateLogsIfNeeded();
    } catch (error) {
      console.error("[REACHX - Logger] Failed to flush logs:".red, error);
    }
  }

  /**
   * Rotate logs if file size exceeds limit
   */
  private async rotateLogsIfNeeded(): Promise<void> {
    const logFile = this.getLogFilePath();
    
    try {
      const stats = await fs.stat(logFile);
      
      if (stats.size >= this.config.maxLogFileSize) {
        const timestamp = Date.now();
        const rotatedName = `reach-${timestamp}.log`;
        const rotatedPath = path.join(this.getLogDirPath(), rotatedName);
        
        await fs.rename(logFile, rotatedPath);
        this.currentLogFile = this.generateLogFileName();
        
        await this.cleanOldLogs();
      }
    } catch (error) {
      // File doesn't exist yet, ignore
    }
  }

  /**
   * Clean old log files exceeding max limit
   */
  private async cleanOldLogs(): Promise<void> {
    const logDir = this.getLogDirPath();
    
    try {
      const files = await fs.readdir(logDir);
      const logFiles = files
        .filter((f) => f.startsWith("reach-") && f.endsWith(".log"))
        .sort()
        .reverse();

      if (logFiles.length > this.config.maxLogFiles) {
        const filesToDelete = logFiles.slice(this.config.maxLogFiles);
        for (const file of filesToDelete) {
          await fs.remove(path.join(logDir, file));
        }
      }
    } catch (error) {
      console.error("[REACHX - Logger] Failed to clean old logs:".red, error);
    }
  }

  /**
   * Save shutdown log
   */
  private async saveShutdownLog(signal: string): Promise<void> {
    const shutdownDir = path.join(this.getLogDirPath(), "shutdowns");
    await fs.ensureDir(shutdownDir);

    const shutdownLog = {
      timestamp: new Date().toISOString(),
      signal,
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      recentLogs: this.logBuffer.slice(-50),
    };

    const fileName = `shutdown-${Date.now()}.json`;
    await fs.writeJSON(path.join(shutdownDir, fileName), shutdownLog, { spaces: 2 });
  }

  /**
   * Save crash log
   */
  private async saveCrashLog(error: Error, type: string): Promise<void> {
    const crashDir = path.join(this.getLogDirPath(), "crashes");
    await fs.ensureDir(crashDir);

    const crashLog = {
      timestamp: new Date().toISOString(),
      type,
      error: {
        message: error?.message || String(error),
        stack: error?.stack,
        name: error?.name,
      },
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      recentLogs: this.logBuffer.slice(-100),
    };

    const fileName = `crash-${Date.now()}.json`;
    await fs.writeJSON(path.join(crashDir, fileName), crashLog, { spaces: 2 });
  }

  // ============ Public Logging Methods ============

  public debug(component: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    this.addToBuffer(this.createLogEntry(LogLevel.DEBUG, component, message, metadata));
  }

  public info(component: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    this.addToBuffer(this.createLogEntry(LogLevel.INFO, component, message, metadata));
  }

  public warn(component: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    this.addToBuffer(this.createLogEntry(LogLevel.WARN, component, message, metadata));
  }

  public error(component: string, message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    this.addToBuffer(this.createLogEntry(LogLevel.ERROR, component, message, metadata));
  }

  public fatal(component: string, message: string, metadata?: Record<string, any>): void {
    this.addToBuffer(this.createLogEntry(LogLevel.FATAL, component, message, metadata));
  }

  /**
   * Get recent logs from buffer with optional filtering
   */
  public getRecentLogs(count: number = 100, offset: number = 0, level?: string): LogEntry[] {
    let logs = [...this.logBuffer];
    
    // Filter by level if specified
    if (level) {
      const upperLevel = level.toUpperCase();
      logs = logs.filter((log) => log.level === upperLevel);
    }
    
    // Sort by timestamp descending (most recent first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Apply pagination
    return logs.slice(offset, offset + count);
  }

  /**
   * Get logs from file for a specific date
   */
  public async getLogsFromFile(date?: string): Promise<string[]> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    const logFile = path.join(this.getLogDirPath(), `reach-${targetDate}.log`);

    try {
      if (await fs.pathExists(logFile)) {
        const content = await fs.readFile(logFile, "utf-8");
        return content.split("\n").filter((line) => line.trim());
      }
    } catch (error) {
      this.error("Logger", `Failed to read log file: ${error}`);
    }

    return [];
  }
}

// Export singleton instance
export const logger = LoggerService.getInstance();

// Export convenience functions
export const log = {
  debug: (component: string, message: string, metadata?: Record<string, any>) =>
    logger.debug(component, message, metadata),
  info: (component: string, message: string, metadata?: Record<string, any>) =>
    logger.info(component, message, metadata),
  warn: (component: string, message: string, metadata?: Record<string, any>) =>
    logger.warn(component, message, metadata),
  error: (component: string, message: string, metadata?: Record<string, any>) =>
    logger.error(component, message, metadata),
  fatal: (component: string, message: string, metadata?: Record<string, any>) =>
    logger.fatal(component, message, metadata),
};

export default logger;
