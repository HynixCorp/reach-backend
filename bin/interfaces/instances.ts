export type InstanceInformation =
  | ({
    status: "waiting";
    waitingUntil: Date;
  } & Omit<BaseInstanceInformation, "status">)
  | (BaseInstanceInformation & { status: Exclude<BaseInstanceInformation["status"], "waiting"> });

type BaseInstanceInformation =
  | ReachInstanceInformation
  | CurseforgeOrModrinthInstanceInformation;

interface ReachInstanceInformation {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: string;
  status: "active" | "inactive" | "maintenance" | "testing" | "waiting";
  provider: "reach";
  size: number;
  packageManifest: string;
  application: {
    thumbnail: string;
    logo: string;
    gameVersion: string;
  };
  options: {
    isReachEnabled: boolean;
    isTestingEnabled: boolean;
  };
  allowedUsersIDs: string[] | "all";
}

interface CurseforgeOrModrinthInstanceInformation {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: string;
  status: "active" | "inactive" | "maintenance" | "testing" | "waiting";
  provider: "curseforge" | "modrinth";
  modsURLs: string[];
  application: {
    thumbnail: string;
    logo: string;
    gameVersion: string;
  };
  options: {
    isReachEnabled: boolean;
    isTestingEnabled: boolean;
  };
  allowedUsersIDs: string[] | "all";
}