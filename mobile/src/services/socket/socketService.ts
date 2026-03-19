import { io, type Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;

  connect(businessId: string | null): Socket {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io(process.env.EXPO_PUBLIC_SOCKET_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "", {
      transports: ["websocket"],
      auth: {
        businessId,
      },
    });

    return this.socket;
  }

  get current(): Socket | null {
    return this.socket;
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
