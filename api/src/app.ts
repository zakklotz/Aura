import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { clerkExpressMiddleware } from "./middleware/auth.js";
import { env } from "./lib/env.js";
import { sendAppError } from "./lib/errors.js";
import { authRouter } from "./modules/auth/router.js";
import { threadsRouter } from "./modules/threads/router.js";
import { messagesRouter } from "./modules/messages/router.js";
import { voicemailsRouter } from "./modules/voicemails/router.js";
import { settingsRouter } from "./modules/settings/router.js";
import { contactsRouter } from "./modules/contacts/router.js";
import { contactImportsRouter } from "./modules/contactImports/router.js";
import { devicesRouter } from "./modules/devices/router.js";
import { callsRouter } from "./modules/calls/router.js";
import { callSessionRouter } from "./modules/calls/sessionRouter.js";
import { twilioRouter } from "./modules/twilio/router.js";
import { mailboxRouter } from "./modules/mailbox/router.js";
import { setIo } from "./lib/socket.js";

export function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });
  io.on("connection", (socket) => {
    const businessId = typeof socket.handshake.auth?.businessId === "string" ? socket.handshake.auth.businessId : null;
    if (businessId) {
      socket.join(`business:${businessId}`);
    }
  });
  setIo(io);

  app.set("io", io);
  // Keep Render's health check independent from auth, DB-backed viewers, and provider setup.
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use(cors({ origin: true, credentials: true }));
  app.use(helmet());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(clerkExpressMiddleware);

  app.use("/api/auth", authRouter);
  app.use("/api/threads", threadsRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/contacts", contactsRouter);
  app.use("/api/contact-imports", contactImportsRouter);
  app.use("/api/devices", devicesRouter);
  app.use("/api/voice", callsRouter);
  app.use("/api/voicemails", voicemailsRouter);
  app.use("/api/mailbox", mailboxRouter);
  app.use("/api/call-session", callSessionRouter);
  app.use("/webhooks/twilio", twilioRouter);

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    sendAppError(res, err);
  });

  return { app, httpServer, io };
}

export function startServer() {
  const { app, httpServer } = createApp();
  httpServer.on("error", (error) => {
    // eslint-disable-next-line no-console
    console.error("Aura API failed to start", error);
  });
  httpServer.listen(env.port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Aura API listening on 0.0.0.0:${env.port}`);
  });
  return { app, httpServer };
}
