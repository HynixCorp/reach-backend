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
  ownerID: string;
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
    discordCustom: boolean;
  };
  allowedUsersIDs: string[] | "public";
}

interface CurseforgeOrModrinthInstanceInformation {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: string;
  ownerID: string;
  status: "active" | "inactive" | "maintenance" | "testing" | "waiting";
  provider: "curseforge" | "modrinth";
  modsURLs: string[];
  application: {
    thumbnail: string;
    logo: string;
    gameVersion: string;
  };
  options: {
    discordCustom: boolean;
  };
  allowedUsersIDs: string[] | "public";
}

export type InstanceCode = ({
  limitedUsages: true;
  limitedUsagesValue: number;
} & InstanceCodeBase) | ({
  limitedUsages: false;
} & InstanceCodeBase);

interface InstanceCodeBase {
  id: string;
  code: string;
  ownerID: string;
  createdAt: Date;
  updatedAt: Date;
  limitedUsages: boolean;
}
