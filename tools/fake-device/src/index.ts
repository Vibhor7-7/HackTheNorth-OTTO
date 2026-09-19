// DEV-1. Streams the laptop mic to the gateway as PCM s16le 24 kHz with
// ptt_start / ptt_end on a keypress, and plays downstream PCM back.
//
// Deliberately speaks the canonical JSON protocol (7.1). To exercise the VG-14
// legacy path instead, run with LEGACY=true.

import { spawn, type ChildProcess } from "node:child_process";
import { WebSocket } from "ws";
import { DEVICE_SAMPLE_RATE, type ServerToDevice } from "@otto/shared";

const URL_ = process.env.OTTO_URL ?? "ws://localhost:3000/device";
const TOKEN = process.env.DEVICE_TOKEN ?? "dev-device-token";
const LEGACY = process.env.LEGACY === "true";
/** macOS avfoundation by default; override for Linux (`alsa` / `pulse`). */
const INPUT_FORMAT = process.env.FFMPEG_INPUT_FORMAT ?? "avfoundation";
const INPUT_DEVICE = process.env.FFMPEG_INPUT_DEVICE ?? ":0";

const url = `${URL_}?token=${encodeURIComponent(TOKEN)}`;
const ws = new WebSocket(url);

let mic: ChildProcess | undefined;
let speaker: ChildProcess | undefined;
let talking = false;

const send = (json: Record<string, unknown>, legacy: string) =>
  ws.send(LEGACY ? legacy : JSON.stringify(json));

ws.on("open", () => {
  console.log(`connected to ${URL_} (${LEGACY ? "legacy" : "json"} protocol)`);
  send({ type: "hello", fw: "fake-1.0.0", sample_rate: DEVICE_SAMPLE_RATE, battery: 1 }, "HELLO");
  help();
});

ws.on("message", (data, isBinary) => {
  if (isBinary) {
    play(Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer));
    return;
  }

  const text = String(data);
  if (!text.startsWith("{")) { console.log(`<- ${text}`); handleLegacy(text); return; }

  const msg = JSON.parse(text) as ServerToDevice;
  switch (msg.type) {
    case "speak_start": startSpeaker(); break;
    case "speak_end":   stopSpeaker(msg.reason); break;
    case "transcript":  console.log(`   ${msg.role}: ${msg.text}`); break;
    case "state":       console.log(`   [${msg.value}]`); break;
    case "error":       console.error(`   error ${msg.code}: ${msg.message}`); break;
    default:            console.log(`<- ${msg.type}`);
  }
});

ws.on("close", () => { console.log("disconnected"); cleanup(); process.exit(0); });
ws.on("error", (err: Error) => { console.error(`socket error: ${err.message}`); process.exit(1); });

function handleLegacy(text: string): void {
  if (text.startsWith("AUDIO_START")) startSpeaker();
  else if (text.startsWith("AUDIO_END")) stopSpeaker("done");
}

// ---- mic ------------------------------------------------------------------

function startTalking(): void {
  if (talking) return;
  talking = true;
  send({ type: "ptt_start" }, "START");
  console.log("-> ptt_start (press space again to send)");

  mic = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", INPUT_FORMAT, "-i", INPUT_DEVICE,
    "-ar", String(DEVICE_SAMPLE_RATE), "-ac", "1",
    "-f", "s16le", "-acodec", "pcm_s16le", "pipe:1",
  ], { stdio: ["ignore", "pipe", "inherit"] });

  mic.stdout?.on("data", (chunk: Buffer) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(chunk, { binary: true });
  });
}

function stopTalking(cancel = false): void {
  if (!talking) return;
  talking = false;
  mic?.kill("SIGKILL");
  mic = undefined;
  if (cancel) { send({ type: "ptt_cancel" }, "CANCEL"); console.log("-> ptt_cancel"); }
  else { send({ type: "ptt_end" }, "STOP"); console.log("-> ptt_end"); }
}

// ---- speaker --------------------------------------------------------------

function startSpeaker(): void {
  if (speaker) return;
  speaker = spawn("ffplay", [
    "-hide_banner", "-loglevel", "error", "-nodisp", "-autoexit",
    "-f", "s16le", "-ar", String(DEVICE_SAMPLE_RATE), "-ch_layout", "mono", "-i", "pipe:0",
  ], { stdio: ["pipe", "ignore", "inherit"] });
  speaker.on("close", () => { speaker = undefined; });
}

function play(pcm: Buffer): void {
  startSpeaker();
  speaker?.stdin?.write(pcm);
}

function stopSpeaker(reason: string): void {
  console.log(`   speak_end (${reason})`);
  speaker?.stdin?.end();
  // FW-6: a barge-in kills playback immediately rather than draining it.
  if (reason === "interrupted") { speaker?.kill("SIGKILL"); speaker = undefined; }
}

// ---- keyboard -------------------------------------------------------------

function help(): void {
  console.log("space = talk / send, c = cancel, p = ping, q = quit");
}

if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on("data", (buf: Buffer) => {
  const key = buf.toString();
  if (key === " ") { talking ? stopTalking() : startTalking(); return; }
  if (key === "c") { stopTalking(true); return; }
  if (key === "p") { send({ type: "ping" }, "PING"); return; }
  if (key === "q" || key === "\u0003") { cleanup(); process.exit(0); }
});

function cleanup(): void {
  mic?.kill("SIGKILL");
  speaker?.kill("SIGKILL");
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}
