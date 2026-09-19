import { useState } from "react";
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
  s,
} from "../../src/ui";
import { otto } from "../../src/data/source";

export default function ConnectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOtto();
  const [done, setDone] = useState(false);
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
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/connections");
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
              name={done ? "check-circle" : "link"}
              size={23}
              color={c.accent}
            />
            <Copy style={{ flex: 1, fontWeight: "600", fontSize: 18 }}>
              {done
                ? "Ready for Otto"
                : `${ext?.tool_count ?? 0} available tools`}
            </Copy>
          </View>
          <Copy style={{ color: c.muted }}>
            {done
              ? (task?.spoken_summary ?? "Your task can continue.")
              : (task?.goal ?? ext?.description ?? "Connect this app to Otto.")}
          </Copy>
        </View>
        <Copy style={{ color: c.muted, marginVertical: 24 }}>
          Demo connection. No sign-in or real account access.
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
            label={`Connect ${name}`}
            disabled={state.network !== "online" || !ext}
            icon="link"
            onPress={async () => {
              await otto.connect(ext!.id);
              setDone(true);
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ).catch(() => {});
            }}
          />
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
