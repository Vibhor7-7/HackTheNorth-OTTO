// VG-1 and VG-14. One device WS endpoint, one active device, either dialect.

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import type { DeviceStatus, DeviceToServer, ServerToDevice } from "@otto/shared";
import { env } from "../env";
import { logger } from "../log";
import { publish } from "../bus";
import { nowIso } from "../ids";
import { DeviceSession, type DeviceTransport } from "./session";
import { encodeServerFrame, parseDeviceFrame, type Dialect } from "./protocol";

const log = logger("device");

interface Connection {
  ws: WebSocket;
  session: DeviceSession;
  dialect: Dialect;
  fw?: string;
  battery?: number;
  lastSeen: string;
}

/** VG-1: exactly one active device; a new connection replaces the old one. */
let active: Connection | undefined;

export function deviceStatus(): DeviceStatus {
  if (!active) return { connected: false, state: "idle" };
  return {
    connected: true,
    state: active.session.currentState,
    last_seen: active.lastSeen,
    battery: active.battery,
    fw: active.fw,
  };
}

function announce(): void {
  publish({ type: "device.updated", data: deviceStatus() });
}

export function attachDeviceGateway(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    // Nothing else in this server upgrades, so anything off /device is a mistake.
    if (url.pathname !== "/device") {
      socket.destroy();
      return;
    }

    if (url.searchParams.get("token") !== env.deviceToken) {
      log.warn("rejected device: bad token");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => onConnect(ws));
  });

  log.info("device gateway attached", { path: "/device" });
}

function onConnect(ws: WebSocket): void {
  if (active) {
    log.info("replacing existing device connection");
    const old = active;
    active = undefined;
    old.session.dispose("replaced by a new device connection");
    try { old.ws.close(); } catch { /* already gone */ }
  }

  // Dialect defaults to JSON and is corrected by the first text frame (VG-14).
  const conn: Connection = {
    ws,
    dialect: "json",
    lastSeen: nowIso(),
    session: undefined as unknown as DeviceSession,
  };

  const transport: DeviceTransport = {
    sendControl(msg: ServerToDevice) {
      if (ws.readyState !== WebSocket.OPEN) return;
      const frame = encodeServerFrame(msg, conn.dialect);
      if (frame !== undefined) ws.send(frame);
      if (msg.type === "state") announce();
    },
    sendAudio(frame: Buffer) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(frame, { binary: true });
    },
    isAlive: () => ws.readyState === WebSocket.OPEN,
  };

  conn.session = new DeviceSession(transport);
  active = conn;
  log.info("device connected");
  announce();

  ws.on("message", (data, isBinary) => {
    conn.lastSeen = nowIso();

    if (isBinary) {
      conn.session.onAudio(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
      return;
    }

    const parsed = parseDeviceFrame(String(data));
    if (!parsed) {
      log.warn("unparseable control frame", { frame: String(data).slice(0, 80) });
      return;
    }

    // First text frame decides the dialect for the rest of the connection.
    conn.dialect = parsed.dialect;
    dispatch(conn, parsed.msg);
  });

  ws.on("close", () => {
    if (active === conn) {
      active = undefined;
      announce();
    }
    conn.session.dispose("device disconnected");
    log.info("device disconnected");
  });

  ws.on("error", (err: Error) => log.error("device socket error", { error: err.message }));
}

// Synchronous: control frames must be handled in arrival order, and the audio
// frames behind ptt_start must not overtake it.
function dispatch(conn: Connection, msg: DeviceToServer): void {
  const { session } = conn;
  switch (msg.type) {
    case "hello":
      conn.fw = msg.fw;
      conn.battery = msg.battery;
      session.onHello({ fw: msg.fw, battery: msg.battery });
      announce();
      break;
    case "ptt_start":
      session.onPttStart();
      break;
    case "ptt_end":
      session.onPttEnd();
      break;
    case "ptt_cancel":
      session.onPttCancel();
      break;
    case "ping":
      session.onPing();
      break;
  }
}
