import { Server } from "socket.io";
import { Server as HttpServer } from "node:http";

export class Client {
  private server: HttpServer;
  private io?: Server;
  private listeners: Array<(socket: any) => void> = [];

  constructor(server: HttpServer) {
    this.server = server;
  }

  public setup() {
    // Configurar Socket.IO con CORS
    this.io = new Server(this.server, {
      cors: {
        // origin: [
        //   "http://dashboard.reachsdk.local:3001",
        //   "http://localhost:3001",
        //   "http://localhost:3000"
        // ],
        methods: ["GET", "POST"],
        credentials: true
      }
    });

    // Solo una vez
    this.io.on("connection", (socket: any) => {

      // Ejecutar todos los listeners registrados
      this.listeners.forEach((listener) => listener(socket));

      socket.on("disconnect", () => {
        
      });
    });
  }

  public getIO(): Server {
    if (!this.io) {
      throw new Error("Socket.IO server not initialized. Call setup() first.");
    }
    return this.io;
  }

  // Registrar listeners sin duplicar "connection"
  public listenEvent(event: string, callback: (socket: any, ...args: any[]) => void) {
    this.listeners.push((socket) => {
      socket.on(event, (...args: any[]) => {
        callback(socket, ...args);
      });
    });
  }

  public emitToClient(socketId: string, event: string, ...args: any[]) {
    if (!this.io) {
      throw new Error("Socket.IO server not initialized. Call setup() first.");
    }
    this.io.to(socketId).emit(event, ...args);
  }
}