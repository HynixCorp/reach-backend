import { Client as SocketIOClient } from "./client";

export function setupListeners(socketIOClient: SocketIOClient) {
  socketIOClient.listenEvent("message", (socket, message) => {
    console.log(`Received message from ${socket.id}: ${message}`);
  });

  socketIOClient.listenEvent("custom_event", (socket, data) => {
    console.log(`Custom event from ${socket.id}:`, data);
  });
}
