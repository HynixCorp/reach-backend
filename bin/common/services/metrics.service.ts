/**
 * Metrics Service
 * 
 * Collects and provides system metrics for the admin dashboard
 * Includes CPU, RAM, disk, network, and process information
 */

import os from "os";
import process from "process";
import { logger } from "./logger.service";

// ============ Types ============

export interface SystemMetrics {
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  uptime: UptimeMetrics;
}

export interface CpuMetrics {
  model: string;
  cores: number;
  speed: number;
  usage: number;
  loadAverage: number[];
}

export interface MemoryMetrics {
  total: number;
  used: number;
  free: number;
  usagePercent: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  rss: number;
}

export interface DiskMetrics {
  // Note: Full disk metrics require additional packages
  // This provides basic info from process
  cwd: string;
}

export interface NetworkMetrics {
  interfaces: NetworkInterface[];
  hostname: string;
}

export interface NetworkInterface {
  name: string;
  addresses: string[];
}

export interface UptimeMetrics {
  system: number;
  process: number;
  systemFormatted: string;
  processFormatted: string;
}

export interface ProcessMetrics {
  pid: number;
  ppid: number;
  title: string;
  version: string;
  versions: NodeJS.ProcessVersions;
  arch: string;
  platform: string;
  execPath: string;
  execArgv: string[];
  argv: string[];
  cwd: string;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  env: {
    NODE_ENV: string;
    PORT: string;
  };
}

export interface TrafficMetrics {
  totalRequests: number;
  requestsPerMinute: number;
  averageResponseTime: number;
  statusCodes: Record<string, number>;
  endpoints: EndpointStats[];
  lastHour: HourlyStats[];
}

export interface EndpointStats {
  path: string;
  method: string;
  count: number;
  avgResponseTime: number;
  errorRate: number;
}

export interface HourlyStats {
  hour: string;
  requests: number;
  errors: number;
  avgResponseTime: number;
}

// ============ In-Memory Traffic Storage ============

interface RequestRecord {
  timestamp: Date;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
}

class TrafficTracker {
  private requests: RequestRecord[] = [];
  private maxRecords = 10000; // Keep last 10k requests
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup old records every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  record(method: string, path: string, statusCode: number, responseTime: number): void {
    this.requests.push({
      timestamp: new Date(),
      method,
      path: this.normalizePath(path),
      statusCode,
      responseTime,
    });

    // Keep array size manageable
    if (this.requests.length > this.maxRecords) {
      this.requests = this.requests.slice(-this.maxRecords);
    }
  }

  private normalizePath(path: string): string {
    // Normalize paths by replacing IDs with :id
    return path
      .replace(/\/[a-f0-9]{24}/gi, "/:id") // MongoDB ObjectIds
      .replace(/\/[0-9a-f-]{36}/gi, "/:uuid") // UUIDs
      .replace(/\/\d+/g, "/:num"); // Numeric IDs
  }

  private cleanup(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    this.requests = this.requests.filter(r => r.timestamp > oneHourAgo);
  }

  getStats(): TrafficMetrics {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Filter to last hour
    const lastHourRequests = this.requests.filter(r => r.timestamp > oneHourAgo);
    const lastMinuteRequests = this.requests.filter(r => r.timestamp > oneMinuteAgo);

    // Calculate status code distribution
    const statusCodes: Record<string, number> = {};
    lastHourRequests.forEach(r => {
      const codeGroup = `${Math.floor(r.statusCode / 100)}xx`;
      statusCodes[codeGroup] = (statusCodes[codeGroup] || 0) + 1;
    });

    // Calculate endpoint stats
    const endpointMap = new Map<string, { count: number; totalTime: number; errors: number }>();
    lastHourRequests.forEach(r => {
      const key = `${r.method} ${r.path}`;
      const existing = endpointMap.get(key) || { count: 0, totalTime: 0, errors: 0 };
      existing.count++;
      existing.totalTime += r.responseTime;
      if (r.statusCode >= 400) existing.errors++;
      endpointMap.set(key, existing);
    });

    const endpoints: EndpointStats[] = Array.from(endpointMap.entries())
      .map(([key, stats]) => {
        const [method, path] = key.split(" ");
        return {
          path,
          method,
          count: stats.count,
          avgResponseTime: Math.round(stats.totalTime / stats.count),
          errorRate: Math.round((stats.errors / stats.count) * 100),
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20 endpoints

    // Calculate hourly stats
    const hourlyMap = new Map<string, { requests: number; errors: number; totalTime: number }>();
    lastHourRequests.forEach(r => {
      const hour = r.timestamp.toISOString().slice(0, 13) + ":00";
      const existing = hourlyMap.get(hour) || { requests: 0, errors: 0, totalTime: 0 };
      existing.requests++;
      existing.totalTime += r.responseTime;
      if (r.statusCode >= 400) existing.errors++;
      hourlyMap.set(hour, existing);
    });

    const lastHour: HourlyStats[] = Array.from(hourlyMap.entries())
      .map(([hour, stats]) => ({
        hour,
        requests: stats.requests,
        errors: stats.errors,
        avgResponseTime: Math.round(stats.totalTime / stats.requests),
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    // Calculate averages
    const totalResponseTime = lastHourRequests.reduce((sum, r) => sum + r.responseTime, 0);
    const avgResponseTime = lastHourRequests.length > 0
      ? Math.round(totalResponseTime / lastHourRequests.length)
      : 0;

    return {
      totalRequests: lastHourRequests.length,
      requestsPerMinute: lastMinuteRequests.length,
      averageResponseTime: avgResponseTime,
      statusCodes,
      endpoints,
      lastHour,
    };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ============ Metrics Service ============

class MetricsService {
  private static instance: MetricsService;
  private trafficTracker: TrafficTracker;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;
  private lastCpuTime: number = 0;

  private constructor() {
    this.trafficTracker = new TrafficTracker();
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = Date.now();
  }

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Record a request for traffic metrics
   */
  recordRequest(method: string, path: string, statusCode: number, responseTime: number): void {
    this.trafficTracker.record(method, path, statusCode, responseTime);
  }

  /**
   * Get system metrics (CPU, RAM, etc.)
   */
  getSystemMetrics(): SystemMetrics {
    const cpus = os.cpus();
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Calculate CPU usage
    const cpuUsage = this.calculateCpuUsage();

    // Get network interfaces
    const networkInterfaces = os.networkInterfaces();
    const interfaces: NetworkInterface[] = Object.entries(networkInterfaces)
      .filter(([_, addrs]) => addrs !== undefined)
      .map(([name, addrs]) => ({
        name,
        addresses: addrs!.map(addr => addr.address),
      }));

    return {
      cpu: {
        model: cpus[0]?.model || "Unknown",
        cores: cpus.length,
        speed: cpus[0]?.speed || 0,
        usage: cpuUsage,
        loadAverage: os.loadavg(),
      },
      memory: {
        total: totalMem,
        used: totalMem - freeMem,
        free: freeMem,
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      disk: {
        cwd: process.cwd(),
      },
      network: {
        interfaces,
        hostname: os.hostname(),
      },
      uptime: {
        system: os.uptime(),
        process: process.uptime(),
        systemFormatted: this.formatUptime(os.uptime()),
        processFormatted: this.formatUptime(process.uptime()),
      },
    };
  }

  /**
   * Get process-specific metrics
   */
  getProcessMetrics(): ProcessMetrics {
    return {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      version: process.version,
      versions: process.versions,
      arch: process.arch,
      platform: process.platform,
      execPath: process.execPath,
      execArgv: process.execArgv,
      argv: process.argv,
      cwd: process.cwd(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PORT: process.env.PORT || "3000",
      },
    };
  }

  /**
   * Get traffic metrics
   */
  getTrafficMetrics(): TrafficMetrics {
    return this.trafficTracker.getStats();
  }

  /**
   * Get all metrics combined
   */
  getAllMetrics(): {
    system: SystemMetrics;
    process: ProcessMetrics;
    traffic: TrafficMetrics;
    timestamp: string;
  } {
    return {
      system: this.getSystemMetrics(),
      process: this.getProcessMetrics(),
      traffic: this.getTrafficMetrics(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate CPU usage percentage
   */
  private calculateCpuUsage(): number {
    const currentUsage = process.cpuUsage(this.lastCpuUsage || undefined);
    const currentTime = Date.now();
    const timeDiff = currentTime - this.lastCpuTime;

    if (timeDiff === 0) return 0;

    // CPU usage in microseconds, convert to percentage
    const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // to ms
    const cpuPercent = Math.round((totalUsage / timeDiff) * 100);

    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;

    return Math.min(cpuPercent, 100);
  }

  /**
   * Format uptime to human readable string
   */
  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(" ");
  }

  /**
   * Format bytes to human readable string
   */
  formatBytes(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
}

// Export singleton
export const metricsService = MetricsService.getInstance();

// Export helper functions
export const recordRequest = (method: string, path: string, statusCode: number, responseTime: number) =>
  metricsService.recordRequest(method, path, statusCode, responseTime);

export const getSystemMetrics = () => metricsService.getSystemMetrics();
export const getProcessMetrics = () => metricsService.getProcessMetrics();
export const getTrafficMetrics = () => metricsService.getTrafficMetrics();
export const getAllMetrics = () => metricsService.getAllMetrics();

export default metricsService;
