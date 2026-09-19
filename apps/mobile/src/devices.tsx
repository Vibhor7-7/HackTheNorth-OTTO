import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  ReduceMotion,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { GlassChrome } from "./glass";
import { Button, Copy, Display } from "./ui";
import { demoDevices, useDemoDevices } from "./data/device-demo";
import { colors as c } from "./theme";

type Device = "headphones" | "otto";

function DeviceArtwork({
  device,
  large = false,
}: {
  device: Device;
  large?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.artwork, large && styles.artworkLarge]}
    >
      <View
        style={{
          width: 100,
          height: 100,
          transform: [{ scale: large ? 1.75 : 0.85 }, { rotate: "-12deg" }],
        }}
      >
        {device === "headphones" ? (
          <>
            <View style={styles.band} />
            <View style={[styles.cup, styles.leftCup]}>
              <View style={styles.cushion} />
            </View>
            <View style={[styles.cup, styles.rightCup]}>
              <View style={styles.cushion} />
            </View>
          </>
        ) : (
          <View style={styles.ottoShell}>
            <View style={styles.ottoButton} />
          </View>
        )}
      </View>
    </View>
  );
}

export function DevicesTile() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Device>("headphones");
  const deviceState = useDemoDevices();
  useEffect(() => {
    void demoDevices.initialize();
  }, []);
  const connected = {
    headphones: deviceState.headphones === "connected",
    otto: deviceState.otto === "connected",
  };
  const reducedMotion = useReducedMotion();
  const count = Number(connected.headphones) + Number(connected.otto);
  const isConnected = connected[selected];
  const close = () => {
    setOpen(false);
  };
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Devices, ${count} connected. Open demo devices.`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: pressed ? c.raised : c.surface },
        ]}
      >
        <View style={styles.tileTop}>
          <Feather name="bluetooth" color={c.accent} size={18} />
          <Feather name="arrow-up-right" color={c.muted} size={17} />
        </View>
        <DeviceArtwork device="headphones" />
        <Copy style={styles.title}>Devices</Copy>
        <Copy style={styles.secondary}>{count} connected</Copy>
      </Pressable>
      <Modal
        visible={open}
        animationType={reducedMotion ? "none" : "slide"}
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <SafeAreaView style={styles.modal}>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heading}>
              <Display>Devices</Display>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close devices"
                onPress={close}
              >
                <GlassChrome style={styles.close}>
                  <Feather name="x" size={21} color={c.text} />
                </GlassChrome>
              </Pressable>
            </View>
            <View style={styles.selector}>
              {(["headphones", "otto"] as const).map((device) => (
                <Pressable
                  key={device}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selected === device }}
                  onPress={() => {
                    setSelected(device);
                  }}
                  style={[
                    styles.deviceTab,
                    selected === device && styles.selectedTab,
                  ]}
                >
                  <Feather
                    name={device === "headphones" ? "headphones" : "radio"}
                    size={19}
                    color={selected === device ? c.accent : c.muted}
                  />
                  <Copy
                    style={{ color: selected === device ? c.text : c.muted }}
                  >
                    {device === "headphones" ? "Headphones" : "Otto"}
                  </Copy>
                </Pressable>
              ))}
            </View>
            <Animated.View
              key={selected + deviceState[selected]}
              entering={FadeInDown.duration(380).reduceMotion(
                ReduceMotion.System,
              )}
            >
              <DeviceArtwork device={selected} large />
              <Copy style={styles.deviceName}>
                {selected === "headphones" ? "Your headphones" : "Otto"}
              </Copy>
              <Copy
                accessibilityLiveRegion="polite"
                style={[
                  styles.connection,
                  { color: isConnected ? c.accent : c.muted },
                ]}
              >
                {deviceState[selected] === "reconnecting"
                  ? "Reconnecting"
                  : isConnected
                    ? "Connected"
                    : "Disconnected"}
              </Copy>
            </Animated.View>
            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Copy>Connection</Copy>
                <Copy style={styles.detailValue}>
                  {selected === "otto" ? "Phone to Otto" : "Otto to headphones"}
                </Copy>
              </View>
              <View style={styles.rule} />
              <View style={styles.detailRow}>
                <Copy>Microphone</Copy>
                <Copy style={styles.detailValue}>
                  {!isConnected
                    ? "—"
                    : selected === "otto"
                      ? "Otto microphone"
                      : connected.otto
                        ? "Otto"
                        : "Not connected"}
                </Copy>
              </View>
              <View style={styles.rule} />
              <View style={styles.detailRow}>
                <Copy>Listening through</Copy>
                <Copy style={styles.detailValue}>
                  {!isConnected
                    ? "—"
                    : connected.headphones
                      ? "Headphones"
                      : "Not connected"}
                </Copy>
              </View>
              {selected === "otto" && (
                <>
                  <View style={styles.rule} />
                  <View style={styles.detailRow}>
                    <Copy>Battery</Copy>
                    <Copy style={styles.detailValue}>
                      {isConnected ? "84%" : "—"}
                    </Copy>
                  </View>
                </>
              )}
            </View>
            <Button
              quiet={isConnected}
              label={
                deviceState[selected] === "reconnecting"
                  ? "Cancel connection"
                  : isConnected
                    ? "Disconnect"
                    : "Reconnect"
              }
              onPress={() => {
                void demoDevices.toggle(selected);
                void Haptics.selectionAsync().catch(() => {});
              }}
            />
            <Copy style={styles.demo}>
              Demo devices · No Bluetooth connection
            </Copy>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 172,
    borderRadius: 25,
    padding: 16,
    overflow: "hidden",
    justifyContent: "space-between",
  },
  tileTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  artwork: { height: 90, alignItems: "center", justifyContent: "center" },
  artworkLarge: { height: 250 },
  band: {
    position: "absolute",
    left: 17,
    top: 5,
    width: 68,
    height: 74,
    borderWidth: 9,
    borderColor: "#93B9A5",
    borderBottomColor: "transparent",
    borderRadius: 43,
    boxShadow: "inset 1px 1px 2px #EBFFF044",
  },
  cup: {
    position: "absolute",
    top: 55,
    width: 24,
    height: 39,
    backgroundColor: "#8CC2A6",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#B9E5CB",
    padding: 4,
    boxShadow: "3px 5px 8px #00000050",
  },
  leftCup: { left: 10, transform: [{ rotate: "-9deg" }] },
  rightCup: { right: 8, transform: [{ rotate: "9deg" }] },
  cushion: {
    flex: 1,
    backgroundColor: "#24362D",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#466152",
  },
  ottoShell: {
    width: 76,
    height: 80,
    left: 12,
    top: 12,
    backgroundColor: "#343C37",
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#6A786F",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "5px 8px 10px #00000065",
  },
  ottoButton: {
    width: 53,
    height: 55,
    borderRadius: 20,
    backgroundColor: c.accent,
    borderWidth: 3,
    borderColor: "#719E87",
  },
  title: { fontSize: 17, fontWeight: "600" },
  secondary: { fontSize: 14, color: c.muted },
  modal: { flex: 1, backgroundColor: c.background },
  content: {
    padding: 24,
    paddingBottom: 36,
    gap: 24,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  close: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
  },
  selector: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: c.surface,
    borderRadius: 22,
    padding: 5,
    gap: 4,
  },
  deviceTab: {
    flex: 1,
    minWidth: 130,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 18,
  },
  selectedTab: { backgroundColor: c.raised },
  deviceName: {
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
  },
  connection: { textAlign: "center", marginTop: 8 },
  details: {
    backgroundColor: c.surface,
    borderRadius: 24,
    paddingHorizontal: 20,
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 17,
  },
  detailValue: { color: c.muted },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: c.line },
  demo: { textAlign: "center", color: c.muted, fontSize: 13 },
});
