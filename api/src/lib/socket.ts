import type { Server } from "socket.io";

let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function emitToBusiness(businessId: string, event: string, payload: unknown) {
  io?.to(`business:${businessId}`).emit(event, payload);
}
