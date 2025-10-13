export type UserPacket =
  | ({ banned: "temporal"; bannedUntil: Date, bannedGroups: string[], bannedGlobal: boolean } & BaseUserPacket)
  | ({ banned: "permanent"; bannedGroups: string[], bannedGlobal: boolean } & BaseUserPacket)
  | ({ banned: "none" } & BaseUserPacket);

interface BaseUserPacket {
  id: string;
  username: string;
  uuid: string;
  createdAt: Date;
  machineId: string;
  deviceId: string;
}