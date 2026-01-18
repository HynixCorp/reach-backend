import "colorts/lib/string";
import path from "path";
import fs from "fs-extra";
import net from "net";
import { logger, LogLevel } from "./logger.service";

/**
 * Process Manager Configuration
 */
export interface ProcessManagerConfig {
  gracefulShutdownTimeoutMs: number;
  lockFilePath: string;
  maxCrashesBeforeExit: number;
  crashWindowMs: number;
}

/**
 * Process state tracking
 */
interface ProcessState {
  crashCount: number;
  lastCrashTime: number;
  startTime: number;
  pid: number;
  isHealthy: boolean;
  environment: "development" | "production" | "docker";
}

/**
 * Execution environment detection
 */
type ExecutionEnvironment = "development" | "production" | "docker";

/**
 * Process Manager Service v2
 * 
 * IMPORTANT: This service does NOT spawn child processes to restart.
 * 
 * Restart strategy by environment:
 * - Docker: Exit with code 1, let Docker/Kubernetes restart the container
 * - ts-node-dev (dev): Let ts-node-dev handle restarts automatically
 * - Production (non-Docker): Exit with code 1, systemd/pm2 should handle restarts
 * 
 * This prevents:
 * - Zombie processes running without console
 * - Infinite restart loops that overflow memory
 * - Port conflicts from multiple instances
 * - Orphan processes after compilation errors
 * 
 * Features:
 * - Lock file to prevent multiple instances
 * - Port availability checking before startup
 * - Crash tracking with cooldown
 * - Graceful shutdown with timeout
 * - Environment-aware exit strategies
 */
class ProcessManagerService {
  private static instance: ProcessManagerService;
  private config: ProcessManagerConfig;
  private state: ProcessState;
  private isShuttingDown: boolean = false;
  private lockFileHandle: number | null = null;

  private constructor() {
    const stateDir = path.resolve(process.cwd(), "logs", "state");
    
    this.config = {
      gracefulShutdownTimeoutMs: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT_MS || "10000"),
      lockFilePath: path.join(stateDir, "reach-server.lock"),
      maxCrashesBeforeExit: parseInt(process.env.MAX_CRASHES_BEFORE_EXIT || "5"),
      crashWindowMs: parseInt(process.env.CRASH_WINDOW_MS || "60000"), // 1 minute
    };

    this.state = {
      crashCount: 0,
      lastCrashTime: 0,
      startTime: Date.now(),
      pid: process.pid,
      isHealthy: true,
      environment: this.detectEnvironment(),
    };
  }

  public static getInstance(): ProcessManagerService {
    if (!ProcessManagerService.instance) {
      ProcessManagerService.instance = new ProcessManagerService();
    }
    return ProcessManagerService.instance;
  }

  /**
   * Detect the execution environment
   */
  private detectEnvironment(): ExecutionEnvironment {
    // Check if running in Docker
    if (fs.existsSync("/.dockerenv") || process.env.DOCKER_CONTAINER === "true") {
      return "docker";
    }
    
    // Check if running with ts-node-dev (development)
    if (process.env.TS_NODE_DEV === "true" || process.argv.some(arg => arg.includes("ts-node-dev"))) {
      return "development";
    }
    
    // Check NODE_ENV
    if (process.env.NODE_ENV === "production") {
      return "production";
    }
    
    return "development";
  }

  /**
   * Check if a port is available
   */
  public async checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          resolve(false);
        } else {
          resolve(false);
        }
      });
      
      server.once("listening", () => {
        server.close(() => {
          resolve(true);
        });
      });
      
      server.listen(port, "0.0.0.0");
    });
  }

  /**
   * Acquire lock file to prevent multiple instances
   */
  private async acquireLockFile(): Promise<boolean> {
    const stateDir = path.dirname(this.config.lockFilePath);
    await fs.ensureDir(stateDir);

    try {
      // Check if lock file exists
      if (await fs.pathExists(this.config.lockFilePath)) {
        const lockContent = await fs.readFile(this.config.lockFilePath, "utf-8");
        const lockData = JSON.parse(lockContent);
        
        // If the lock file has the same PID as current process, it's from a previous
        // container run (Docker recycles PIDs). Treat as stale.
        if (lockData.pid === process.pid) {
          logger.warn("ProcessManager", 
            `Lock file has same PID as current process (${lockData.pid}). ` +
            `This is likely from a previous container run. Cleaning up.`
          );
          await fs.remove(this.config.lockFilePath);
        }
        // Check if the PID in lock file is still running (and it's a different PID)
        else if (this.isProcessRunning(lockData.pid)) {
          logger.error("ProcessManager", 
            `Another instance is running (PID: ${lockData.pid}). Exiting to prevent conflicts.`
          );
          return false;
        } else {
          // Stale lock file, remove it
          logger.warn("ProcessManager", 
            `Found stale lock file from PID ${lockData.pid}. Cleaning up.`
          );
          await fs.remove(this.config.lockFilePath);
        }
      }

      // Write new lock file
      const lockData = {
        pid: process.pid,
        startTime: new Date().toISOString(),
        environment: this.state.environment,
      };
      await fs.writeJSON(this.config.lockFilePath, lockData, { spaces: 2 });
      
      return true;
    } catch (error) {
      logger.error("ProcessManager", `Failed to acquire lock file: ${error}`);
      return false;
    }
  }

  /**
   * Release lock file on shutdown
   */
  private async releaseLockFile(): Promise<void> {
    try {
      if (await fs.pathExists(this.config.lockFilePath)) {
        const lockContent = await fs.readFile(this.config.lockFilePath, "utf-8");
        const lockData = JSON.parse(lockContent);
        
        // Only remove if it's our lock
        if (lockData.pid === process.pid) {
          await fs.remove(this.config.lockFilePath);
          logger.info("ProcessManager", "Lock file released.");
        }
      }
    } catch (error) {
      logger.error("ProcessManager", `Failed to release lock file: ${error}`);
    }
  }

  /**
   * Check if a process is running by PID
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 doesn't kill the process, just checks if it exists
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load previous crash state from file
   */
  private async loadCrashState(): Promise<void> {
    const stateFile = path.join(path.dirname(this.config.lockFilePath), "crash-state.json");
    
    try {
      if (await fs.pathExists(stateFile)) {
        const savedState = await fs.readJSON(stateFile);
        const now = Date.now();
        
        // Only restore crash count if within the window
        if (now - savedState.lastCrashTime < this.config.crashWindowMs) {
          this.state.crashCount = savedState.crashCount;
          this.state.lastCrashTime = savedState.lastCrashTime;
          
          logger.warn("ProcessManager", 
            `Restored crash state: ${this.state.crashCount}/${this.config.maxCrashesBeforeExit} crashes in window.`
          );
        } else {
          // Window expired, reset state
          await fs.remove(stateFile);
        }
      }
    } catch (error) {
      // State file doesn't exist or is corrupt, start fresh
    }
  }

  /**
   * Save crash state for next restart
   */
  private async saveCrashState(): Promise<void> {
    const stateFile = path.join(path.dirname(this.config.lockFilePath), "crash-state.json");
    
    try {
      await fs.writeJSON(stateFile, {
        crashCount: this.state.crashCount,
        lastCrashTime: this.state.lastCrashTime,
        savedAt: new Date().toISOString(),
      }, { spaces: 2 });
    } catch (error) {
      logger.error("ProcessManager", `Failed to save crash state: ${error}`);
    }
  }

  /**
   * Initialize the process manager with pre-flight checks
   */
  public async initialize(): Promise<boolean> {
    logger.info("ProcessManager", `Initializing process manager (environment: ${this.state.environment})`);
    this.state.startTime = Date.now();

    // Load previous crash state
    await this.loadCrashState();

    // Check if we've exceeded crash limit
    if (this.state.crashCount >= this.config.maxCrashesBeforeExit) {
      logger.fatal("ProcessManager", 
        `Max crashes (${this.config.maxCrashesBeforeExit}) exceeded within ${this.config.crashWindowMs}ms. ` +
        `Manual intervention required.`
      );
      await this.clearCrashState();
      return false;
    }

    // Acquire lock file
    const lockAcquired = await this.acquireLockFile();
    if (!lockAcquired) {
      return false;
    }

    // Check port availability
    const port = parseInt(process.env.PORT || "3000");
    const portAvailable = await this.checkPortAvailable(port);
    
    if (!portAvailable) {
      logger.fatal("ProcessManager", 
        `Port ${port} is already in use. Another service or orphan process may be running.`
      );
      await this.releaseLockFile();
      return false;
    }

    // Setup crash handlers - in Docker/production, we just log and exit cleanly
    // The container orchestrator (Docker/K8s) or process manager (pm2/systemd) handles restart
    this.setupCrashHandlers();
    this.setupSignalHandlers();

    logger.info("ProcessManager", 
      `Process manager ready. PID: ${process.pid}, Port: ${port}, ` +
      `Crashes: ${this.state.crashCount}/${this.config.maxCrashesBeforeExit}`
    );

    return true;
  }

  /**
   * Setup crash handlers that DON'T spawn new processes
   */
  private setupCrashHandlers(): void {
    // In development with ts-node-dev, it handles restarts
    // In Docker, container restart policy handles it
    // In production, systemd/pm2 handles it
    
    logger.on("crash", async (data) => {
      if (this.isShuttingDown) return;
      
      logger.error("ProcessManager", `Crash detected: ${data.type}`, { error: data.error });
      
      // Track crash
      this.state.crashCount++;
      this.state.lastCrashTime = Date.now();
      await this.saveCrashState();
      
      // Log environment-specific message
      switch (this.state.environment) {
        case "docker":
          logger.info("ProcessManager", 
            "Docker environment detected. Exiting with code 1 for container restart."
          );
          break;
        case "development":
          logger.info("ProcessManager", 
            "Development environment detected. ts-node-dev will handle restart."
          );
          break;
        case "production":
          logger.info("ProcessManager", 
            "Production environment detected. Process manager (pm2/systemd) should handle restart."
          );
          break;
      }

      // Clean exit - let external tool handle restart
      await this.performGracefulExit(1);
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT", "SIGHUP"];
    
    for (const signal of signals) {
      process.on(signal, async () => {
        if (this.isShuttingDown) return;
        
        logger.info("ProcessManager", `Received ${signal}, initiating graceful shutdown`);
        await this.performGracefulExit(0);
      });
    }
  }

  /**
   * Perform graceful exit with cleanup
   */
  private async performGracefulExit(exitCode: number): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info("ProcessManager", `Starting graceful shutdown (exit code: ${exitCode})`);

    // Set timeout for forced exit
    const forceExitTimeout = setTimeout(() => {
      logger.warn("ProcessManager", "Graceful shutdown timeout exceeded, forcing exit");
      process.exit(exitCode);
    }, this.config.gracefulShutdownTimeoutMs);

    try {
      // Release lock file
      await this.releaseLockFile();
      
      // Flush logs
      await logger.flush();
      
      // Clear timeout and exit
      clearTimeout(forceExitTimeout);
      
      logger.info("ProcessManager", "Graceful shutdown complete");
      process.exit(exitCode);
    } catch (error) {
      logger.error("ProcessManager", `Error during shutdown: ${error}`);
      clearTimeout(forceExitTimeout);
      process.exit(exitCode);
    }
  }

  /**
   * Clear crash state (called after successful startup)
   */
  public async clearCrashState(): Promise<void> {
    const stateFile = path.join(path.dirname(this.config.lockFilePath), "crash-state.json");
    try {
      if (await fs.pathExists(stateFile)) {
        await fs.remove(stateFile);
        this.state.crashCount = 0;
        this.state.lastCrashTime = 0;
        logger.info("ProcessManager", "Crash state cleared after successful startup");
      }
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Mark successful startup (clears crash counter after stable period)
   */
  public async markSuccessfulStartup(): Promise<void> {
    // Clear crash state after 30 seconds of stable operation
    setTimeout(async () => {
      if (!this.isShuttingDown && this.state.isHealthy) {
        await this.clearCrashState();
      }
    }, 30000);
  }

  /**
   * Get current process state
   */
  public getState(): ProcessState {
    return {
      ...this.state,
    };
  }

  /**
   * Mark process as unhealthy
   */
  public markUnhealthy(): void {
    this.state.isHealthy = false;
    logger.warn("ProcessManager", "Process marked as unhealthy");
  }

  /**
   * Mark process as healthy
   */
  public markHealthy(): void {
    this.state.isHealthy = true;
  }

  /**
   * Get uptime in seconds
   */
  public getUptime(): number {
    return Math.floor((Date.now() - this.state.startTime) / 1000);
  }

  /**
   * Get execution environment
   */
  public getEnvironment(): ExecutionEnvironment {
    return this.state.environment;
  }

  /**
   * Check if running in Docker
   */
  public isDocker(): boolean {
    return this.state.environment === "docker";
  }

  /**
   * Check if running in development mode
   */
  public isDevelopment(): boolean {
    return this.state.environment === "development";
  }

  /**
   * Force shutdown (for critical errors)
   */
  public async forceShutdown(reason: string): Promise<never> {
    logger.fatal("ProcessManager", `Force shutdown initiated: ${reason}`);
    await this.performGracefulExit(1);
    throw new Error("Force shutdown"); // This line won't execute, but TS needs it
  }
}

export const processManager = ProcessManagerService.getInstance();
export default processManager;
