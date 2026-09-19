import React, { useState } from "react";
import { ScrollView, View, Pressable, Switch } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Copy, Header, Section, s, useOtto } from "../src/ui";
import { colors as c } from "../src/theme";
import { baseUrl, isLive, otto } from "../src/data/source";
import type { DemoScenario, NetworkState } from "../src/data/types";

// APP-5: device (connected, last seen, state, battery), server URL and the
// server's DEMO_MODE. Every value here comes from the data source; the only
// things the app decides itself are the simulation's scenario and network toggles,
// which exist only when there is no server to disagree with them (D-24: there is
// no SMS channel, so there is no SMS number to configure).
const scenarios: { id: DemoScenario; label: string }[] = [
  { id: "default", label: "A day with Otto" },
  { id: "coffee", label: "Coffee with Sam" },
  { id: "food", label: "Food order" },
  { id: "failure", label: "Failed task" },
  { id: "expired", label: "Expired approval" },
  { id: "empty", label: "Empty state" },
];
const pretty = (value: string) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
export default function Settings() {
  const state = useOtto();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showScenarios, setShowScenarios] = useState(false);
  const [overrideError, setOverrideError] = useState("");
  const device = state.device;
  const rows: [string, string][] = [
    [
      "Otto One",
      device.connected
        ? "Connected"
        : isLive
          ? "Not connected"
          : "Disconnected",
    ],
    ["State", device.connected ? pretty(device.state) : "—"],
    [
      "Battery",
      device.battery !== undefined
        ? `${Math.round(device.battery * 100)}%`
        : device.connected
          ? "Not reported"
          : "—",
    ],
    [
      "Last seen",
      device.last_seen
        ? new Date(device.last_seen).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })
        : "Never",
    ],
  ];
  if (device.fw) rows.push(["Firmware", device.fw]);
  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <Header title="Settings" back={() => router.back()} />
        <Section title="Device" />
        <View style={s.group}>
          {rows.map(([label, value], i) => (
            <View
              key={label}
              style={{
                padding: 18,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: i < rows.length - 1 ? 1 : 0,
                borderColor: c.line,
              }}
            >
              <Copy>{label}</Copy>
              <Copy
                style={{
                  color: i === 0 && device.connected ? c.accent : c.muted,
                }}
              >
                {value}
              </Copy>
            </View>
          ))}
        </View>
        <Copy style={{ color: c.muted, fontSize: 14, marginTop: 12 }}>
          {isLive
            ? "Reported by the device over its WebSocket. Updates live."
            : "Simulated device readings."}
        </Copy>
        <Section title="Server" />
        <View style={s.group}>
          {(
            [
              ["Address", isLive ? baseUrl : "Local simulation"],
              [
                "Connection",
                state.network === "online"
                  ? "Online"
                  : state.network === "offline"
                    ? "Offline"
                    : "Reconnecting",
              ],
              ["Demo mode", state.demoMode ? "On" : "Off"],
            ] as [string, string][]
          ).map(([label, value], i) => (
            <View
              key={label}
              style={{
                padding: 18,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: i < 2 ? 1 : 0,
                borderColor: c.line,
              }}
            >
              <Copy>{label}</Copy>
              <Copy
                selectable
                style={{
                  color:
                    (label === "Connection" && state.network === "online") ||
                    (label === "Demo mode" && state.demoMode)
                      ? c.accent
                      : c.muted,
                  flexShrink: 1,
                  textAlign: "right",
                }}
              >
                {value}
              </Copy>
            </View>
          ))}
        </View>
        <Copy style={{ color: c.muted, fontSize: 14, marginTop: 12 }}>
          {isLive
            ? "Set with EXPO_PUBLIC_OTTO_URL when the app starts. Demo mode is the server's DEMO_MODE and enables its stage fallbacks."
            : "Set EXPO_PUBLIC_OTTO_URL to run against the real server. Tasks and approvals here only affect local demo data."}
        </Copy>
        <Section title="Override" />
        <View style={[s.card, state.autoApprove ? { borderWidth: 1, borderColor: c.danger } : null]}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Copy style={{ fontWeight: "600" }}>Skip all approvals</Copy>
              <Copy style={{ color: c.muted, marginTop: 6 }}>
                Sends, posts, deletes and payments run the moment Otto decides
                to. Nothing waits for you.
              </Copy>
            </View>
            <Switch
              accessibilityLabel="Skip all approvals"
              value={state.autoApprove}
              onValueChange={(on) => {
                setOverrideError("");
                void otto.setAutoApprove(on).catch((err: unknown) => {
                  setOverrideError(
                    err instanceof Error ? err.message : "Could not change the override.",
                  );
                });
              }}
              trackColor={{ true: c.danger, false: c.raised }}
              thumbColor={state.autoApprove ? c.background : c.muted}
            />
          </View>
          {!!overrideError && (
            <Copy accessibilityRole="alert" style={{ color: c.danger, marginTop: 12 }}>
              {overrideError}
            </Copy>
          )}
        </View>
        <Copy style={{ color: c.muted, fontSize: 14, marginTop: 12 }}>
          {isLive
            ? "Every action is still logged in Task detail as auto-approved. Turns itself off when the server restarts."
            : "In the simulation this only shows the banner; demo approvals still wait for you."}
        </Copy>
        {!isLive && (
          <>
            <Section title="Simulation" />
            <View style={s.card}>
              <Copy>Network state</Copy>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                {(["online", "offline", "reconnecting"] as NetworkState[]).map(
                  (network) => (
                    <Pressable
                      key={network}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: state.network === network,
                      }}
                      onPress={() => otto.setNetwork(network)}
                      style={{
                        paddingHorizontal: 13,
                        paddingVertical: 12,
                        borderRadius: 22,
                        backgroundColor:
                          state.network === network ? c.accent : c.raised,
                      }}
                    >
                      <Copy
                        style={{
                          fontSize: 14,
                          color:
                            state.network === network ? c.onAccent : c.text,
                          textTransform: "capitalize",
                        }}
                      >
                        {network}
                      </Copy>
                    </Pressable>
                  ),
                )}
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 26,
                }}
              >
                <Copy>Show demo scenarios</Copy>
                <Switch
                  value={showScenarios}
                  onValueChange={setShowScenarios}
                  trackColor={{ true: c.accentSurface, false: c.raised }}
                  thumbColor={showScenarios ? c.accent : c.muted}
                />
              </View>
            </View>
            {showScenarios && (
              <>
                <Section title="Scenarios" />
                <Copy style={{ color: c.muted, marginBottom: 16 }}>
                  Loading a scenario resets tasks, notes and chat.
                </Copy>
                <View style={{ gap: 10 }}>
                  {scenarios.map((scenario) => (
                    <Button
                      key={scenario.id}
                      label={scenario.label}
                      quiet
                      icon="rotate-ccw"
                      onPress={async () => {
                        await otto.reset(scenario.id).catch(() => {});
                        router.replace("/");
                      }}
                    />
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
