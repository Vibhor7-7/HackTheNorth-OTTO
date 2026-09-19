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
  useOtto,
  s,
} from "../../src/ui";
import { TaskJourney } from "../../src/task-journey";
import { otto } from "../../src/data/source";

export default function ApprovalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useOtto();
  const approval = state.approvals.find((a) => a.id === id);
  const task = state.tasks.find((item) => item.id === approval?.task_id);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/home");
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
  const completed = approved && task?.status === "succeeded";
  const failed = approved && task?.status === "failed";
  const status = pending
    ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`
    : completed
      ? "Completed"
      : failed
        ? "Action failed"
        : approved
          ? "Approved"
          : approval.status === "denied"
            ? "Denied"
            : "Expired";
  const facts = approval.facts;
  const price = facts["New price"];
  const email = !!facts.To && !!facts.Message;
  const title = completed
    ? email
      ? "Email sent."
      : price
        ? "Price updated."
        : "Action completed."
    : pending && email
      ? "Send this email?"
      : approval.summary;
  return (
    <SafeAreaView edges={["bottom"]} style={s.page}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingBottom: 24 }]}
      >
        <Header
          title={completed ? "Receipt" : "Review action"}
          right={<IconButton name="x" label="Close" onPress={close} />}
        />
        <View
          style={[s.card, { backgroundColor: c.accentSurface, padding: 24 }]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <Feather
              name={
                pending
                  ? "shield"
                  : completed
                    ? "check-circle"
                    : approved && !failed
                      ? "arrow-right"
                      : "x-circle"
              }
              size={28}
              color={c.accent}
            />
            <Copy
              accessibilityLiveRegion="polite"
              style={{ color: c.accent, fontVariant: ["tabular-nums"] }}
            >
              {status}
            </Copy>
          </View>
          <Display style={{ fontSize: 28, lineHeight: 34 }}>{title}</Display>
          {!!price && (
            <View style={{ marginTop: 24, gap: 6 }}>
              <Copy
                style={{
                  color: c.muted,
                  textDecorationLine: "line-through",
                  fontSize: 20,
                }}
              >
                {facts["Current price"]}
              </Copy>
              <Display style={{ fontSize: 38, color: c.accent }}>
                {price}
              </Display>
              <Copy>{facts.Product}</Copy>
            </View>
          )}
        </View>
        {task && <TaskJourney task={task} />}
        <View
          style={[s.group, { marginTop: task ? 0 : 20, paddingHorizontal: 20 }]}
        >
          {Object.entries(facts)
            .filter(
              ([key]) =>
                key !== "Mode" &&
                !(
                  price &&
                  ["Current price", "New price", "Product"].includes(key)
                ),
            )
            .map(([label, value], index, entries) => (
              <View
                key={label}
                style={{
                  paddingVertical: label === "Message" ? 22 : 17,
                  borderBottomWidth:
                    index === entries.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderColor: c.line,
                  gap: 7,
                }}
              >
                {label !== "Message" && (
                  <Copy style={{ color: c.muted, fontSize: 15 }}>{label}</Copy>
                )}
                <Copy
                  selectable
                  style={{
                    fontSize: label === "Message" ? 19 : 17,
                    lineHeight: label === "Message" ? 29 : 25,
                    fontWeight: label === "Subject" ? "600" : "400",
                  }}
                >
                  {value}
                </Copy>
              </View>
            ))}
        </View>
        {!pending && (
          <Copy
            accessibilityLiveRegion="polite"
            style={{ color: failed ? c.danger : c.muted, marginTop: 20 }}
          >
            {completed
              ? task?.spoken_summary || "The requested action is complete."
              : failed
                ? task?.error || "The action could not be completed."
                : approved
                  ? task?.status === "running"
                    ? "Approved. Executing the action…"
                    : "Approved. Follow the task for the next step."
                  : approval.status === "denied"
                    ? "You denied this action. Nothing was sent or changed."
                    : "Approval expired. This action was not executed."}
          </Copy>
        )}
      </ScrollView>
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: 12,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.line,
          backgroundColor: c.background,
          gap: 10,
        }}
      >
        <Copy
          style={{
            color: state.network !== "online" && pending ? c.warning : c.muted,
            fontSize: 14,
            textAlign: "center",
          }}
        >
          {state.network !== "online" && pending
            ? "Reconnect to decide."
            : "Demo · no real account changes"}
        </Copy>
        {pending ? (
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}>
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
            </View>
            <View style={{ flex: 1.4 }}>
              <Button
                label="Approve"
                icon="check"
                disabled={state.network !== "online"}
                onPress={async () => {
                  await otto.approve(id);
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  ).catch(() => {});
                }}
              />
            </View>
          </View>
        ) : (
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
        )}
      </View>
    </SafeAreaView>
  );
}
