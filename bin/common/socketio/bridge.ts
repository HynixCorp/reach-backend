// bin/common/socketBridge.ts
import { Client as SocketClient } from "./client";

let socketClient: SocketClient | null = null;

export function registerSocketClient(client: SocketClient) {
  socketClient = client;
}

export const socketBridge = {
  getIO() {
    if (!socketClient) throw new Error("SocketClient not registered");
    return socketClient.getIO();
  }
};

// usage in server main: registerSocketClient(socketIOClient)
export { socketClient };
