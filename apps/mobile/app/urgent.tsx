import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { Button, Copy, Header, NetworkBanner, s, useOtto } from "../src/ui";
import { colors as c } from "../src/theme";
import { otto } from "../src/data/source";
import {
  decideApproval,
  sendApprovalReply,
  timeRemaining,
} from "../src/data/approval-channel";

type Reply = {
  id: string;
  request: string;
  response: string;
  approvalId?: string;
  error: boolean;
};
let sessionReplies: Reply[] = [];

export default function UrgentScreen() {
  const state = useOtto();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState(params.tab === "text" ? 1 : 0);
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [replies, setReplies] = useState(sessionReplies);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const pending = state.approvals.filter(
    (a) => a.status === "pending" && Date.parse(a.expires_at) > now,
  );
  const connections = state.connections.filter((a) => a.status === "pending");
  const questions = state.tasks.filter((t) => t.status === "needs_input");
  const send = async () => {
    const request = text.trim();
    if (!request || sending) return;
    setSending(true);
    setText("");
    let reply: Reply;
    try {
      const result = await sendApprovalReply(otto, request);
      reply = {
        id: `${Date.now()}-${replies.length}`,
        request,
        response: result.text,
        approvalId: result.approvalId,
        error: false,
      };
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      reply = {
        id: `${Date.now()}-${replies.length}`,
        request,
        response:
          error instanceof Error
            ? error.message
            : "The reply could not be processed.",
        error: true,
      };
    }
    sessionReplies = [...sessionReplies, reply];
    setReplies(sessionReplies);
    setSending(false);
  };
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/home");
  return (
    <SafeAreaView style={s.page} edges={["top", "bottom"]}>
      <View style={{ paddingHorizontal: 20 }}>
        <Header title="Urgent" back={back} />
      </View>
      <NetworkBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ paddingHorizontal: 20, paddingBottom: 20 }}>
          {Platform.OS === "ios" ? (
            <SegmentedControl
              appearance="dark"
              values={["Decisions", "Text channel"]}
              selectedIndex={tab}
              onChange={(event) =>
                setTab(event.nativeEvent.selectedSegmentIndex)
              }
              backgroundColor={c.surface}
              tintColor={c.raised}
              fontStyle={{ color: c.muted, fontSize: 15 }}
              activeFontStyle={{ color: c.text, fontWeight: "600" }}
              style={{ height: 40 }}
            />
          ) : (
            <View style={styles.tabs}>
              {["Decisions", "Text channel"].map((name, index) => (
                <Pressable
                  key={name}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === index }}
                  onPress={() => setTab(index)}
                  style={[
                    styles.tab,
                    tab === index && { backgroundColor: c.raised },
                  ]}
                >
                  <Copy style={{ fontWeight: "600" }}>{name}</Copy>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.content, { paddingBottom: 24, gap: 16 }]}
        >
          {tab === 0 ? (
            <>
              {pending.map((approval) => (
                <View key={approval.id} style={s.card}>
                  <View style={styles.row}>
                    <Copy
                      style={{ fontWeight: "600", color: c.warning, flex: 1 }}
                    >
                      Approval needed
                    </Copy>
                    <Copy style={{ color: c.warning, fontSize: 14 }}>
                      {timeRemaining(approval.expires_at, now)}
                    </Copy>
                  </View>
                  <Copy style={styles.title}>{approval.summary}</Copy>
                  <View style={{ gap: 14, marginBottom: 22 }}>
                    {Object.entries(approval.facts).map(([key, value]) => (
                      <View key={key}>
                        <Copy style={styles.meta}>{key}</Copy>
                        <Copy selectable style={{ marginTop: 3 }}>
                          {value}
                        </Copy>
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 10 }}>
                    <Button
                      label="Approve"
                      disabled={state.network !== "online"}
                      onPress={async () => {
                        await decideApproval(otto, approval.id, "approve");
                        void Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Success,
                        );
                      }}
                    />
                    <Button
                      destructive
                      label="Deny"
                      disabled={state.network !== "online"}
                      onPress={async () => {
                        await decideApproval(otto, approval.id, "deny");
                        void Haptics.notificationAsync(
                          Haptics.NotificationFeedbackType.Warning,
                        );
                      }}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({
                        pathname: "/task/[id]",
                        params: { id: approval.task_id },
                      })
                    }
                    style={styles.link}
                  >
                    <Copy style={{ color: c.accent }}>View task</Copy>
                  </Pressable>
                </View>
              ))}
              {connections.map((connection) => (
                <View key={connection.id} style={s.card}>
                  <Copy style={styles.title}>
                    Connect{" "}
                    {state.extensions.find((e) => e.id === connection.toolkit)
                      ?.name ?? connection.toolkit}
                  </Copy>
                  <Copy style={{ color: c.muted, marginBottom: 18 }}>
                    {state.tasks.find((t) => t.id === connection.task_id)?.goal}
                  </Copy>
                  <Button
                    label="Review connection"
                    onPress={() =>
                      router.push({
                        pathname: "/connect/[id]",
                        params: { id: connection.toolkit },
                      })
                    }
                  />
                </View>
              ))}
              {questions.map((task) => (
                <View key={task.id} style={s.card}>
                  <Copy style={styles.title}>Otto has a question</Copy>
                  <Copy style={{ color: c.muted, marginBottom: 18 }}>
                    {task.spoken_summary ?? task.goal}
                  </Copy>
                  <Button
                    label="Answer"
                    onPress={() =>
                      router.push({
                        pathname: "/task/[id]",
                        params: { id: task.id },
                      })
                    }
                  />
                </View>
              ))}
              {!pending.length && !connections.length && !questions.length && (
                <View style={s.card}>
                  <Copy style={{ fontSize: 22, fontWeight: "600" }}>
                    Nothing needs you
                  </Copy>
                  <Copy style={{ color: c.muted, marginTop: 10 }}>
                    Past approval messages are in Text channel.
                  </Copy>
                </View>
              )}
              <Copy style={styles.meta}>
                Demo decisions only. No external actions are performed.
              </Copy>
            </>
          ) : (
            <>
              <View style={s.card}>
                <Copy style={{ fontWeight: "600" }}>Demo text channel</Copy>
                <Copy style={{ color: c.muted, marginTop: 8 }}>
                  Simulated messages from Otto. Reply with approve CODE or deny
                  CODE. These use the same approvals as the rest of the app.
                </Copy>
              </View>
              {[...state.approvals].reverse().map((approval) => {
                const status =
                  approval.status === "pending" &&
                  Date.parse(approval.expires_at) <= now
                    ? "expired"
                    : approval.status;
                return (
                  <View key={approval.id} style={[s.card, { marginRight: 20 }]}>
                    <Copy style={{ fontWeight: "600", color: c.accent }}>
                      Otto
                    </Copy>
                    <Copy style={{ fontWeight: "600", marginTop: 10 }}>
                      {approval.summary}
                    </Copy>
                    <Copy selectable style={{ marginTop: 12 }}>
                      {Object.entries(approval.facts)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join("\n")}
                    </Copy>
                    <Copy
                      selectable
                      style={{ marginTop: 14, fontWeight: "600" }}
                    >
                      Code {approval.code}
                    </Copy>
                    <Copy style={{ color: c.muted, marginTop: 6 }}>
                      {status === "pending"
                        ? `Reply approve ${approval.code} or deny ${approval.code}. ${timeRemaining(approval.expires_at, now)}.`
                        : status === "approved"
                          ? "Approved. Otto continued the demo task."
                          : status === "denied"
                            ? "Denied. The action was cancelled."
                            : "Expired. The action was cancelled."}
                    </Copy>
                    {status === "pending" && (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => setText(`approve ${approval.code}`)}
                        style={styles.link}
                      >
                        <Copy style={{ color: c.accent }}>Use this code</Copy>
                      </Pressable>
                    )}
                  </View>
                );
              })}
              {!state.approvals.length && (
                <Copy style={{ color: c.muted }}>
                  Approval messages will appear here when Otto needs permission.
                </Copy>
              )}
              {replies.map((reply) => (
                <View key={reply.id} style={{ gap: 10 }}>
                  <View style={[styles.outgoing, { marginLeft: 35 }]}>
                    <Copy selectable>{reply.request}</Copy>
                  </View>
                  <View style={[s.card, { marginRight: 20 }]}>
                    <Copy style={{ fontWeight: "600", marginBottom: 8 }}>
                      Otto
                    </Copy>
                    <Copy style={{ color: reply.error ? c.warning : c.text }}>
                      {reply.response}
                    </Copy>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
        {tab === 1 && (
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Reply to demo approval"
              placeholder="approve CODE or deny CODE"
              placeholderTextColor={c.muted}
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              style={[s.input, { flex: 1 }]}
              editable={!sending}
            />
            <Button
              label={sending ? "Sending" : "Send"}
              disabled={sending || !text.trim() || state.network !== "online"}
              onPress={send}
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    backgroundColor: c.surface,
    padding: 4,
    borderRadius: 16,
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    marginTop: 10,
    marginBottom: 18,
  },
  meta: { fontSize: 14, lineHeight: 21, color: c.muted },
  link: {
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "flex-start",
    marginTop: 8,
  },
  outgoing: { backgroundColor: c.accentSurface, padding: 18, borderRadius: 22 },
  composer: {
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
    backgroundColor: c.surface,
  },
});
