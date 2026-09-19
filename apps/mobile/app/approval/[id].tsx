import { useEffect, useState } from "react";
import { ScrollView, View, StyleSheet } from "react-native";
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
  Reveal,
  useOtto,
  s,
} from "../../src/ui";
import { otto } from "../../src/data/mock";

export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOtto();
  const approval = state.approvals.find((a) => a.id === id);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!approval)
    return (
      <SafeAreaView style={s.page}>
        <View style={s.content}>
          <Header title="Unavailable" />
          <Button
            label="Back to Today"
            onPress={() => router.replace("/(tabs)/home")}
          />
        </View>
      </SafeAreaView>
    );
  const remaining = Math.max(
    0,
    Math.ceil((Date.parse(approval.expires_at) - now) / 1000),
  );
  const pending = approval.status === "pending" && remaining > 0;
  const approved = approval.status === "approved";
  const denied = approval.status === "denied";
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/home");
  return (
    <SafeAreaView edges={["bottom"]} style={s.page}>
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: 32 }]}>
        <Header
          title="Review action"
          right={<IconButton name="x" label="Close" onPress={close} />}
        />
        <Reveal>
          <View
            style={[s.card, { backgroundColor: c.accentSurface, padding: 24 }]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 24,
              }}
            >
              <Feather
                name={
                  pending ? "shield" : approved ? "check-circle" : "x-circle"
                }
                size={28}
                color={c.accent}
              />
              <Copy style={{ color: c.accent, fontVariant: ["tabular-nums"] }}>
                {pending
                  ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`
                  : approved
                    ? "Approved"
                    : denied
                      ? "Denied"
                      : "Expired"}
              </Copy>
            </View>
            <Display style={{ fontSize: 28, lineHeight: 34 }}>
              {approval.summary}
            </Display>
          </View>
        </Reveal>
        <View style={[s.group, { marginTop: 20, paddingHorizontal: 20 }]}>
          {Object.entries(approval.facts).map(
            ([label, value], index, entries) => (
              <View
                key={label}
                style={{
                  paddingVertical: 17,
                  borderBottomWidth:
                    index === entries.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderColor: c.line,
                  gap: 7,
                }}
              >
                <Copy style={{ color: c.muted, fontSize: 15 }}>{label}</Copy>
                <Copy
                  selectable
                  style={{
                    fontSize: 18,
                    fontWeight: label === "New price" ? "600" : "400",
                    color: label === "New price" ? c.accent : c.text,
                  }}
                >
                  {value}
                </Copy>
              </View>
            ),
          )}
        </View>
        <Copy style={{ color: c.muted, marginTop: 20, marginBottom: 24 }}>
          Demo action. No real account will be changed.
        </Copy>
        <View style={{ gap: 12 }}>
          {pending ? (
            <>
              <Button
                label="Approve"
                disabled={state.network !== "online"}
                icon="check"
                onPress={async () => {
                  await otto.approve(id);
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  ).catch(() => {});
                }}
              />
              <Button
                label="Deny"
                destructive
                icon="x"
                disabled={state.network !== "online"}
                onPress={async () => {
                  await otto.deny(id);
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning,
                  ).catch(() => {});
                }}
              />
            </>
          ) : (
            <>
              <Copy
                style={{
                  color: approved ? c.accent : c.muted,
                  marginBottom: 8,
                }}
              >
                {approved
                  ? "Otto is finishing this task."
                  : denied
                    ? "The action was cancelled."
                    : "This approval expired. The action was cancelled."}
              </Copy>
              <Button
                label="View task"
                icon="arrow-right"
                onPress={() =>
                  router.replace({
                    pathname: "/task/[id]",
                    params: { id: approval.task_id },
                  })
                }
              />
            </>
          )}
        </View>
        {state.network !== "online" && pending && (
          <Copy
            accessibilityRole="alert"
            style={{ color: c.warning, marginTop: 16 }}
          >
            Reconnect to decide.
          </Copy>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
