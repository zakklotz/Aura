let io = null;
export function setIo(server) {
    io = server;
}
export function emitToBusiness(businessId, event, payload) {
    io?.to(`business:${businessId}`).emit(event, payload);
}
