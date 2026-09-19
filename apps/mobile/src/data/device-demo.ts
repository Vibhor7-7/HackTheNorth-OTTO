import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

type Link = "connected" | "disconnected" | "reconnecting";
type DeviceState = { otto: Link; headphones: Link; hydrated: boolean };
const key = "otto.demo.devices.v1";
let state: DeviceState = {
  otto: "connected",
  headphones: "connected",
  hydrated: false,
};
const listeners = new Set<() => void>();
const timers: Partial<
  Record<"otto" | "headphones", ReturnType<typeof setTimeout>>
> = {};
let initialization: Promise<void> | undefined;
let writes = Promise.resolve();
function publish(patch: Partial<DeviceState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
  if (state.hydrated) {
    const data = JSON.stringify(state);
    writes = writes
      .catch(() => {})
      .then(() => AsyncStorage.setItem(key, data))
      .catch(() => {});
  }
}
export const demoDevices = {
  getSnapshot: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  initialize() {
    if (!initialization)
      initialization = AsyncStorage.getItem(key)
        .then((raw) => {
          let saved: Partial<DeviceState> = {};
          try {
            const value = JSON.parse(raw ?? "{}");
            for (const id of ["otto", "headphones"] as const) {
              if (
                ["connected", "disconnected", "reconnecting"].includes(
                  value[id],
                )
              )
                saved[id] =
                  value[id] === "reconnecting" ? "disconnected" : value[id];
            }
          } catch {}
          publish({ ...saved, hydrated: true });
        })
        .catch(() => publish({ hydrated: true }));
    return initialization;
  },
  async toggle(id: "otto" | "headphones") {
    await this.initialize();
    if (timers[id]) clearTimeout(timers[id]);
    if (state[id] !== "disconnected") {
      publish({ [id]: "disconnected" });
      return;
    }
    publish({ [id]: "reconnecting" });
    timers[id] = setTimeout(() => {
      delete timers[id];
      publish({ [id]: "connected" });
    }, 900);
  },
};
export function useDemoDevices() {
  return useSyncExternalStore(
    demoDevices.subscribe,
    demoDevices.getSnapshot,
    demoDevices.getSnapshot,
  );
}
