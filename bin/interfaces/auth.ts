export type UserPacket =
  | ({ banned: "temporal"; bannedUntil: Date } & BaseUserPacket)
  | ({ banned: "permanent" } & BaseUserPacket)
  | ({ banned: "none" } & BaseUserPacket);

interface BaseUserPacket {
  id: string;
  username: string;
  uuid: string;
  createdAt: Date;
  machineId: string;
  deviceId: string;
  rol: "user" | "developer" | "collaborator" | "betatester";
}