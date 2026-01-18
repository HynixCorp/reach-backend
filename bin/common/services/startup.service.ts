import "colorts/lib/string";
import os from "os";
import { logger } from "./logger.service";

/**
 * Startup Service
 * 
 * Provides aesthetic console output during server initialization
 */

interface StartupCheck {
  name: string;
  status: "ok" | "warning" | "error";
  message?: string;
}

interface StartupConfig {
  serviceName: string;
  version: string;
  environment: string;
  port: number | string;
}

/**
 * ASCII Art Banner for Reach Backend
 */
const BANNER = `
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║   ██████╗ ███████╗ █████╗  ██████╗██╗  ██╗    ██╗  ██╗               ║
║   ██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║    ╚██╗██╔╝               ║
║   ██████╔╝█████╗  ███████║██║     ███████║     ╚███╔╝                ║
║   ██╔══██╗██╔══╝  ██╔══██║██║     ██╔══██║     ██╔██╗                ║
║   ██║  ██║███████╗██║  ██║╚██████╗██║  ██║    ██╔╝ ██╗               ║
║   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝    ╚═╝  ╚═╝               ║
║                                                                       ║
║                    B A C K E N D   S E R V I C E                      ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
`.cyan;

/**
 * Print the startup banner
 */
export function printBanner(): void {
  console.log(BANNER);
}

/**
 * Print a section header
 */
function printSectionHeader(title: string): void {
  const line = "─".repeat(50);
  console.log(`\n┌${line}┐`.gray);
  console.log(`│ ${title.padEnd(48)} │`.gray);
  console.log(`└${line}┘`.gray);
}

/**
 * Print a check result with icon
 */
function printCheck(check: StartupCheck): void {
  const icon = check.status === "ok" ? "✓".green :
               check.status === "warning" ? "⚠".yellow : "✗".red;
  const statusColor = check.status === "ok" ? "OK".green :
                      check.status === "warning" ? "WARN".yellow : "FAIL".red;
  const name = check.name.padEnd(35);
  const message = check.message ? ` (${check.message})`.gray : "";
  
  console.log(`  ${icon} ${name} [${statusColor}]${message}`);
}

/**
 * Print system information
 */
export function printSystemInfo(config: StartupConfig): void {
  printSectionHeader("📋 System Information");
  
  const info = [
    { label: "Service", value: config.serviceName },
    { label: "Version", value: config.version },
    { label: "Environment", value: config.environment },
    { label: "Port", value: String(config.port) },
    { label: "Node Version", value: process.version },
    { label: "Platform", value: `${os.platform()} ${os.arch()}` },
    { label: "Hostname", value: os.hostname() },
    { label: "PID", value: String(process.pid) },
  ];

  for (const { label, value } of info) {
    console.log(`  ${"•".cyan} ${label.padEnd(15).gray} ${value.white}`);
  }
}

/**
 * Print environment variables check
 */
export function printEnvCheck(envVars: string[]): StartupCheck[] {
  printSectionHeader("🔐 Environment Variables");
  
  const checks: StartupCheck[] = [];
  
  for (const envVar of envVars) {
    const value = process.env[envVar];
    const status: "ok" | "warning" | "error" = value ? "ok" : "error";
    const check: StartupCheck = {
      name: envVar,
      status,
      message: value ? "configured" : "missing",
    };
    checks.push(check);
    printCheck(check);
  }
  
  return checks;
}

/**
 * Print database connection status
 */
export function printDatabaseStatus(databases: { name: string; connected: boolean; error?: string }[]): StartupCheck[] {
  printSectionHeader("🗄️  Database Connections");
  
  const checks: StartupCheck[] = [];
  
  for (const db of databases) {
    const check: StartupCheck = {
      name: db.name,
      status: db.connected ? "ok" : "error",
      message: db.connected ? "connected" : db.error || "failed",
    };
    checks.push(check);
    printCheck(check);
  }
  
  return checks;
}

/**
 * Print service status
 */
export function printServiceStatus(services: { name: string; status: "ok" | "warning" | "error"; message?: string }[]): StartupCheck[] {
  printSectionHeader("⚙️  Services");
  
  const checks: StartupCheck[] = [];
  
  for (const service of services) {
    const check: StartupCheck = {
      name: service.name,
      status: service.status,
      message: service.message,
    };
    checks.push(check);
    printCheck(check);
  }
  
  return checks;
}

/**
 * Print API routes status
 */
export function printRoutes(routes: string[]): void {
  printSectionHeader("🛣️  API Routes");
  
  for (const route of routes) {
    console.log(`  ${"→".cyan} ${route.white}`);
  }
}

/**
 * Print startup summary
 */
export function printStartupSummary(checks: StartupCheck[]): void {
  printSectionHeader("📊 Startup Summary");
  
  const ok = checks.filter(c => c.status === "ok").length;
  const warnings = checks.filter(c => c.status === "warning").length;
  const errors = checks.filter(c => c.status === "error").length;
  const total = checks.length;
  
  console.log(`\n  ${"Total checks:".gray}  ${String(total).white}`);
  console.log(`  ${"✓".green} ${"Passed:".gray}       ${String(ok).green}`);
  console.log(`  ${"⚠".yellow} ${"Warnings:".gray}     ${String(warnings).yellow}`);
  console.log(`  ${"✗".red} ${"Failed:".gray}       ${String(errors).red}`);
  
  if (errors > 0) {
    console.log(`\n  ${"⚠️  Server started with errors. Some features may not work.".yellow}`);
  } else if (warnings > 0) {
    console.log(`\n  ${"ℹ️  Server started with warnings.".yellow}`);
  } else {
    console.log(`\n  ${"✅ All systems operational!".green}`);
  }
}

/**
 * Print ready message
 */
export function printReady(port: number | string): void {
  const line = "═".repeat(50);
  console.log(`\n╔${line}╗`.green);
  console.log(`║${"  🚀 REACH BACKEND IS READY".padEnd(50)}║`.green);
  console.log(`║${"".padEnd(50)}║`.green);
  console.log(`║${`  Listening on port ${port}`.padEnd(50)}║`.green);
  console.log(`║${`  Time: ${new Date().toLocaleString()}`.padEnd(50)}║`.green);
  console.log(`╚${line}╝\n`.green);
  
  // Log to file as well
  logger.info("Startup", `Server ready on port ${port}`);
}

/**
 * Print shutdown message
 */
export function printShutdown(reason: string): void {
  const line = "═".repeat(50);
  console.log(`\n╔${line}╗`.yellow);
  console.log(`║${"  ⏹️  SHUTTING DOWN".padEnd(50)}║`.yellow);
  console.log(`║${"".padEnd(50)}║`.yellow);
  console.log(`║${`  Reason: ${reason}`.padEnd(50)}║`.yellow);
  console.log(`║${`  Time: ${new Date().toLocaleString()}`.padEnd(50)}║`.yellow);
  console.log(`╚${line}╝\n`.yellow);
}

/**
 * Print error box
 */
export function printError(title: string, message: string): void {
  const line = "═".repeat(50);
  console.log(`\n╔${line}╗`.red);
  console.log(`║${"  ❌ ERROR".padEnd(50)}║`.red);
  console.log(`║${"".padEnd(50)}║`.red);
  console.log(`║${`  ${title}`.padEnd(50)}║`.red);
  console.log(`║${`  ${message.substring(0, 46)}...`.padEnd(50)}║`.red);
  console.log(`╚${line}╝\n`.red);
}

export default {
  printBanner,
  printSystemInfo,
  printEnvCheck,
  printDatabaseStatus,
  printServiceStatus,
  printRoutes,
  printStartupSummary,
  printReady,
  printShutdown,
  printError,
};
