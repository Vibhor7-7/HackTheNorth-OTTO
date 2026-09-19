import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { colors as c } from "../../src/theme";
import {
  Copy,
  Display,
  Header,
  IconButton,
  Button,
  ToolMark,
  useOtto,
  Loading,
  s,
} from "../../src/ui";
import { isLive, otto } from "../../src/data/source";

// APP-4 / APP-7 / CMP-4. Against the real server, "connected" is not something
// this screen decides: POST /api/extensions/:id/connect returns a Composio Connect
// Link, the browser opens it, and the toolkit is connected only when Composio
// says so - which arrives as extension.updated over SSE (or on the re-read after
// the browser closes). So `done` is derived from the extension's status, never
// set by the button. The simulation flips the status itself, so it looks the same.
export default function ConnectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOtto();
  const [opening, setOpening] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  const ext = state.extensions.find(
    (e) =>
      e.id.toLowerCase() === id.toLowerCase() ||
      e.name.toLowerCase() === id.toLowerCase(),
  );
  const name = ext?.name ?? id;
  const matchingRequests = state.connections.filter(
    (r) => r.toolkit.toLowerCase() === id.toLowerCase(),
  );
  const request =
    matchingRequests.find((r) => r.status === "pending") ??
    matchingRequests.at(-1);
  const task = state.tasks.find((t) => t.id === request?.task_id);
  const loadingFirst = !ext && !state.hydrated;
  const done = ext?.status === "connected";
  // "Waiting" is only meaningful until the status flips; no state to unwind.
  const showWaiting = waiting && !done;
  useEffect(() => {
    if (done && waiting) {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
  }, [done, waiting]);
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/connections");
  const connect = async () => {
    if (!ext) return;
    setError("");
    setOpening(true);
    try {
      await otto.connect(ext.id);
      setWaiting(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start the sign-in.",
      );
    } finally {
      setOpening(false);
    }
  };
  if (loadingFirst)
    return (
      <SafeAreaView edges={["bottom"]} style={s.page}>
        <Loading title="Loading app" />
      </SafeAreaView>
    );
  return (
    <SafeAreaView edges={["bottom"]} style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 32 }]}>
        <Header
          title={done ? "Connected" : "Connect app"}
          right={<IconButton name="x" label="Close" onPress={close} />}
        />
        <View style={{ alignItems: "center", paddingVertical: 32, gap: 20 }}>
          <ToolMark id={ext?.id ?? id} size={80} />
          <Display style={{ fontSize: 30 }}>{name}</Display>
        </View>
        <View style={[s.card, { gap: 18 }]}>
          <View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
            <Feather
              name={done ? "check-circle" : showWaiting ? "clock" : "link"}
              size={23}
              color={c.accent}
            />
            <Copy style={{ flex: 1, fontWeight: "600", fontSize: 18 }}>
              {done
                ? "Ready for Otto"
                : showWaiting
                  ? "Finish signing in"
                  : `${ext?.tool_count ?? 0} available tools`}
            </Copy>
          </View>
          <Copy style={{ color: c.muted }}>
            {done
              ? (task?.spoken_summary ?? "Your task can continue.")
              : showWaiting
                ? "Complete the sign-in in the browser. This screen updates itself when the account is connected."
                : (task?.goal ?? ext?.description ?? "Connect this app to Otto.")}
          </Copy>
        </View>
        <Copy style={{ color: c.muted, marginVertical: 24 }}>
          {isLive
            ? "Sign-in happens in your browser. Otto never sees your password; Composio holds the account."
            : "Demo connection. No sign-in or real account access."}
        </Copy>
        {done ? (
          <Button
            label={request ? "Continue task" : "Done"}
            icon="check"
            onPress={() =>
              request
                ? router.replace({
                    pathname: "/task/[id]",
                    params: { id: request.task_id },
                  })
                : close()
            }
          />
        ) : (
          <Button
            label={
              opening
                ? "Opening…"
                : showWaiting
                  ? "Open sign-in again"
                  : `Connect ${name}`
            }
            disabled={state.network !== "online" || !ext || opening}
            icon="link"
            onPress={connect}
          />
        )}
        {!!error && (
          <Copy
            accessibilityRole="alert"
            style={{ color: c.danger, marginTop: 16 }}
          >
            {error}
          </Copy>
        )}
        {state.network !== "online" && (
          <Copy
            accessibilityRole="alert"
            style={{ color: c.warning, marginTop: 16 }}
          >
            Reconnect to continue.
          </Copy>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
