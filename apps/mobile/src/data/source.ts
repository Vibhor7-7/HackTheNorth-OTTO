// Which Otto the app talks to.
//
// Set EXPO_PUBLIC_OTTO_URL and the app runs against the real server (apps/server);
// leave it unset and it runs the local simulation, which is what makes the UI
// workable without a backend and is the stage fallback if the server dies.
//
//   EXPO_PUBLIC_OTTO_URL=http://192.168.1.20:3000 EXPO_PUBLIC_OTTO_KEY=dev-app-key npm start
//
// Use the machine's LAN address, not localhost: on a phone, localhost is the phone.

import { MockOtto } from './mock';
import { HttpOtto } from './http';
import type { OttoDataSource } from './types';

export const baseUrl = (process.env.EXPO_PUBLIC_OTTO_URL ?? '').trim().replace(/\/$/, '');
const apiKey = process.env.EXPO_PUBLIC_OTTO_KEY ?? 'dev-app-key';

export const isLive = Boolean(baseUrl);

export const otto: OttoDataSource = isLive
  ? new HttpOtto({ baseUrl, apiKey })
  : new MockOtto();

// Worth one line in the log: "why is nothing happening" is almost always this.
console.log(isLive ? `[otto] live backend at ${baseUrl}` : '[otto] local simulation (set EXPO_PUBLIC_OTTO_URL for the real server)');
