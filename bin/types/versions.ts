/**
 * Version system types for experience instances
 */

export interface InstanceVersion {
  versionHash: string;
  instanceId: string;
  versionNumber: number;
  createdAt: Date;
  createdBy: string;
  active: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedBy?: string;
  approvedAt?: Date;
  experiencePackage: {
    packageFolder: string;
    packageZip: string | null;
    encrypted: boolean;
  } | null;
  assets?: {
    thumbnails: string[];
    videos: string[];
  };
  size: number;
  changelog?: string;
  downloadCount?: number;
  tags?: string[];
  notes?: string;
}

export interface InstanceLog {
  instanceId: string;
  action: "version_created" | "version_activated" | "version_deleted" | "instance_updated" | "version_approved" | "version_rejected";
  performedBy: string;
  timestamp: Date;
  versionHash?: string;
  versionNumber?: number;
  metadata?: Record<string, any>;
}

export interface FileDiffResult {
  added: Array<{ path: string; size: number }>;
  modified: Array<{ path: string; oldSize: number; newSize: number }>;
  deleted: Array<{ path: string; size: number }>;
  unchanged: number;
}

export type PlanType = "hobby" | "standard" | "pro";

export const VERSION_LIMITS: Record<PlanType, number> = {
  hobby: 3,
  standard: 10,
  pro: 20,
};

export interface VersionCheckResponse {
  hasUpdate: boolean;
  currentVersion: {
    versionHash: string;
    versionNumber: number;
    createdAt: string;
  } | null;
  latestVersion: {
    versionHash: string;
    versionNumber: number;
    createdAt: string;
    size: number;
    changelog?: string;
  } | null;
}
