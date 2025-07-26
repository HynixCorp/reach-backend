export type InstanceInformation =
  | ({
      status: "waiting";
      waitingUntil: Date;
    } & Omit<BaseInstanceInformation, "status">)
  | (BaseInstanceInformation & { status: Exclude<BaseInstanceInformation["status"], "waiting"> });

interface BaseInstanceInformation {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  currentVersion: string;
  status: "active" | "inactive" | "maintenance" | "testing" | "waiting";
  size: number;
  packageManifest: string;
  application: {
    minClientVersionRequired: string | "latest";
    thumbnail: string;
    logo: string;
    videos: VideoCardsProps[];
    gameVersion: string;
  };
  options: {
    isReachEnabled: boolean;
    isTestingEnabled: boolean;
  };
  allowedUsersIDs: string[] | "all";
}

interface VideoCardsProps {
  title: string;
  thumbnail: string;
  duration: string;
  url: string;
}