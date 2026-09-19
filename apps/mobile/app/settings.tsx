import React, { useEffect, useState } from "react";
import { ScrollView, TextInput, View, Pressable, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Copy, Header, Section, s, useOtto } from "../src/ui";
import { colors as c } from "../src/theme";
import { otto } from "../src/data/mock";
import type { DemoScenario, NetworkState } from "../src/data/types";
const scenarios: { id: DemoScenario; label: string }[] = [
  { id: "default", label: "A day with Otto" },
  { id: "coffee", label: "Coffee with Sam" },
  { id: "food", label: "Food order" },
  { id: "failure", label: "Failed task" },
  { id: "expired", label: "Expired approval" },
  { id: "empty", label: "Empty state" },
];
export default function Settings() {
  const state = useOtto();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("+1 416 555 0142");
  const [server, setServer] = useState("https://demo.otto.local");
  const [saved, setSaved] = useState(false);
  const [showScenarios, setShowScenarios] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem("otto-demo-settings")
      .then((value) => {
        if (value) {
          const v = JSON.parse(value);
          setPhone(v.phone);
          setServer(v.server);
        }
      })
      .catch(() => {});
  }, []);
  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <Header title="Settings" back={() => router.back()} />
        <Section title="Device" />
        <View style={s.group}>
          {[
            [
              "Otto One",
              state.network === "online"
                ? "Connected"
                : state.network === "offline"
                  ? "Disconnected"
                  : "Reconnecting",
            ],
            ["State", "Idle"],
            ["Battery", "84%"],
            ["Last seen", "Demo session"],
          ].map(([label, value], i) => (
            <View
              key={label}
              style={{
                padding: 18,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
                borderBottomWidth: i < 3 ? 1 : 0,
                borderColor: c.line,
              }}
            >
              <Copy>{label}</Copy>
              <Copy style={{ color: i === 0 ? c.accent : c.muted }}>
                {value}
              </Copy>
            </View>
          ))}
        </View>
        <Copy style={{ color: c.muted, fontSize: 14, marginTop: 12 }}>
          Simulated device readings.
        </Copy>
        <Section title="Connection settings" />
        <View style={s.card}>
          <Copy style={{ marginBottom: 10 }}>SMS number</Copy>
          <TextInput
            accessibilityLabel="Demo SMS number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setSaved(false);
            }}
            keyboardType="phone-pad"
            style={s.input}
          />
          <Copy style={{ marginTop: 20, marginBottom: 10 }}>Server URL</Copy>
          <TextInput
            accessibilityLabel="Future server URL"
            value={server}
            onChangeText={(v) => {
              setServer(v);
              setSaved(false);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={s.input}
          />
          <Copy style={{ color: c.muted, fontSize: 14, marginVertical: 16 }}>
            Stored locally. No server connection or SMS is sent.
          </Copy>
          <Button
            label={saved ? "Saved" : "Save settings"}
            onPress={async () => {
              await AsyncStorage.setItem(
                "otto-demo-settings",
                JSON.stringify({ phone, server }),
              );
              setSaved(true);
            }}
          />
        </View>
        <Section title="Demo" />
        <View style={s.card}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Copy style={{ fontWeight: "600" }}>Demo mode</Copy>
            <Copy style={{ color: c.accent }}>On</Copy>
          </View>
          <Copy style={{ color: c.muted, marginTop: 8 }}>
            Tasks and approvals only affect local demo data.
          </Copy>
          <View style={{ marginTop: 24, marginBottom: 12 }}>
            <Copy>Network state</Copy>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["online", "offline", "reconnecting"] as NetworkState[]).map(
              (network) => (
                <Pressable
                  key={network}
                  accessibilityRole="button"
                  accessibilityState={{ selected: state.network === network }}
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
                      color: state.network === network ? c.onAccent : c.text,
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
                    await otto.reset(scenario.id);
                    router.replace("/");
                  }}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
