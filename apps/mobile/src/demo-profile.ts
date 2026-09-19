import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

const key = "otto.demo.profile.v1";
type DemoProfile = { name: string; hydrated: boolean };
let profile: DemoProfile = { name: "Ayush", hydrated: false };
const listeners = new Set<() => void>();
let initialization: Promise<void> | undefined;
let writes = Promise.resolve();
function publish(value: DemoProfile) {
  profile = value;
  listeners.forEach((listener) => listener());
}

export const demoProfile = {
  getSnapshot: () => profile,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  initialize(): Promise<void> {
    if (profile.hydrated) return Promise.resolve();
    if (initialization) return initialization;
    initialization = (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        const stored: unknown = raw ? JSON.parse(raw) : null;
        if (
          stored &&
          typeof stored === "object" &&
          "name" in stored &&
          typeof stored.name === "string" &&
          stored.name.trim()
        ) {
          publish({ name: stored.name.trim().slice(0, 48), hydrated: true });
          return;
        }
      } catch {
        /* The local demo can start with its default profile. */
      }
      publish({ ...profile, hydrated: true });
    })();
    return initialization;
  },
  async setName(value: string) {
    const name = value.trim();
    if (!name) throw new Error("Enter the name you want Otto to use.");
    if (name.length > 48)
      throw new Error("Use a name with 48 characters or fewer.");
    await this.initialize();
    const write = writes
      .catch(() => {})
      .then(async () => {
        await AsyncStorage.setItem(key, JSON.stringify({ name }));
        publish({ name, hydrated: true });
      });
    writes = write;
    await write;
  },
};

export function useDemoProfile() {
  return useSyncExternalStore(
    demoProfile.subscribe,
    demoProfile.getSnapshot,
    demoProfile.getSnapshot,
  );
}
