import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Button,
  Copy,
  Header,
  NetworkBanner,
  Section,
  ToolMark,
  s,
  useOtto,
} from "../../src/ui";
import { colors as c } from "../../src/theme";
import { otto } from "../../src/data/source";
import type { Task, TaskStep } from "../../src/data/types";
import { FactDetails, TaskJourney } from "../../src/task-journey";

const labels: Record<Task["status"], string> = {
  running: "Running",
  needs_input: "Needs an answer",
  awaiting_approval: "Needs approval",
  awaiting_connection: "Needs a connection",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};
const stepLabels: Record<TaskStep["kind"], string> = {
  plan: "Plan",
  tool_call: "Action",
  tool_result: "Result",
  approval_wait: "Approval",
  connection_wait: "Connection",
  question: "Question",
  final: "Outcome",
  error: "Error",
};

function Step({ step, last }: { step: TaskStep; last: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails =
    step.args_redacted !== undefined || step.result_redacted !== undefined;
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        {!last && <View style={styles.line} />}
        <View style={styles.stepNumber}>
          <Copy
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: step.kind === "error" ? c.danger : c.accent,
            }}
          >
            {String(step.seq).padStart(2, "0")}
          </Copy>
        </View>
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 26 }}>
        <View style={styles.row}>
          <Copy style={{ fontWeight: "600", flex: 1 }}>
            {stepLabels[step.kind]}
          </Copy>
          {step.duration_ms !== undefined && (
            <Copy style={styles.meta}>
              {(step.duration_ms / 1000).toFixed(2)}s
            </Copy>
          )}
        </View>
        <Copy style={{ marginTop: 7, color: c.muted }}>{step.summary}</Copy>
        {step.toolkit && (
          <View style={[styles.row, { marginTop: 12 }]}>
            <ToolMark id={step.toolkit} size={26} />
            <Copy style={[styles.meta, { flex: 1 }]}>
              {step.toolkit === "googlecalendar"
                ? "Google Calendar"
                : step.toolkit === "gmail"
                  ? "Gmail"
                  : step.toolkit}
              {step.risk
                ? ` · ${step.risk === "R0" ? "Read only" : step.risk === "R1" ? "Reversible" : "Approval required"}`
                : ""}
            </Copy>
          </View>
        )}
        {hasDetails && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded(!expanded)}
            style={styles.detailsButton}
          >
            <Copy style={{ fontSize: 14, color: c.accent }}>
              {expanded ? "Hide details" : "Show details"}
            </Copy>
            <Feather
              name={expanded ? "chevron-up" : "chevron-down"}
              size={16}
              color={c.accent}
            />
          </Pressable>
        )}
        {expanded && (
          <View style={styles.facts}>
            {step.args_redacted !== undefined && (
              <>
                <Copy style={{ fontWeight: "600" }}>Action facts</Copy>
                <FactDetails value={step.args_redacted} />
              </>
            )}
            {step.result_redacted !== undefined && (
              <>
                <Copy style={{ fontWeight: "600" }}>Result</Copy>
                <FactDetails value={step.result_redacted} />
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function TaskDetail() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const state = useOtto();
  const task = state.tasks.find((t) => t.id === id);
  const steps = state.steps
    .filter((step) => step.task_id === id)
    .sort((a, b) => a.seq - b.seq);
  const turns = state.turns
    .filter((turn) => turn.task_ids.includes(id))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const approval = state.approvals.find(
    (a) => a.task_id === id && a.status === "pending",
  );
  const connection = state.connections.find(
    (a) => a.task_id === id && a.status === "pending",
  );
  const receipt = state.approvals.find(
    (item) => item.task_id === id && item.status === "approved",
  );
  const back = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/tasks");
  return (
    <SafeAreaView style={s.page} edges={["top", "bottom"]}>
      <View style={{ paddingHorizontal: 20 }}>
        <Header title="Task" back={back} />
      </View>
      <NetworkBanner />
      {!task ? (
        <View style={s.content}>
          <Copy style={{ fontSize: 22, fontWeight: "600" }}>
            Task not found
          </Copy>
          <Copy style={{ color: c.muted, marginVertical: 18 }}>
            This demo may have been reset.
          </Copy>
          <Button
            label="Go to Tasks"
            onPress={() => router.replace("/(tabs)/tasks")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.content, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Copy style={styles.title}>{task.goal}</Copy>
          <View style={[styles.row, { marginTop: 14, marginBottom: 8 }]}>
            <Copy
              style={{
                fontWeight: "600",
                color:
                  task.status === "failed"
                    ? c.danger
                    : task.status === "succeeded"
                      ? c.accent
                      : c.text,
              }}
            >
              {labels[task.status]}
            </Copy>
          </View>
          <Copy style={styles.meta}>
            {task.source === "voice"
              ? "Wearable"
              : task.source === "chat"
                ? "Ask"
                : "Action item"}{" "}
            ·{" "}
            {new Date(task.created_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </Copy>
          <TaskJourney task={task} />
          {task.status === "succeeded" && (
            <View
              style={[
                s.card,
                { backgroundColor: c.accentSurface, marginBottom: 12 },
              ]}
            >
              <View style={[styles.row, { marginBottom: 12 }]}>
                <Feather name="check-circle" size={24} color={c.accent} />
                <Copy
                  style={{ color: c.accent, fontWeight: "600", fontSize: 20 }}
                >
                  Completed
                </Copy>
              </View>
              <Copy selectable style={{ fontSize: 19, lineHeight: 28 }}>
                {task.spoken_summary || task.detail_md || task.goal}
              </Copy>
              {receipt && (
                <View style={{ gap: 14, marginTop: 20 }}>
                  {Object.entries(receipt.facts)
                    .filter(([key]) =>
                      [
                        "To",
                        "Subject",
                        "Product",
                        "New price",
                        "When",
                        "Order",
                        "Total",
                      ].includes(key),
                    )
                    .map(([key, value]) => (
                      <View key={key}>
                        <Copy style={styles.meta}>{key}</Copy>
                        <Copy selectable style={{ marginTop: 3 }}>
                          {value}
                        </Copy>
                      </View>
                    ))}
                </View>
              )}
              <Copy style={[styles.meta, { marginTop: 16 }]}>Demo result</Copy>
            </View>
          )}
          {task.status === "needs_input" && (
            <View style={[s.card, { marginTop: 24 }]}>
              <Copy style={styles.cardTitle}>Which Sam?</Copy>
              <Copy style={{ color: c.muted, marginBottom: 20 }}>
                Choose who you want to meet.
              </Copy>
              <Button
                label="Sam Chen · manager"
                disabled={state.network !== "online"}
                onPress={async () => {
                  await Haptics.selectionAsync();
                  await otto.answerQuestion(id, "Sam Chen");
                }}
              />
              <View style={{ height: 10 }} />
              <Button
                quiet
                label="Sam Patel · designer"
                disabled={state.network !== "online"}
                onPress={async () => {
                  await Haptics.selectionAsync();
                  await otto.answerQuestion(id, "Sam Patel");
                }}
              />
            </View>
          )}
          {approval && (
            <View
              style={[
                s.card,
                { marginTop: 24, borderWidth: 1, borderColor: c.warning },
              ]}
            >
              <Copy style={styles.cardTitle}>{approval.summary}</Copy>
              <Button
                label="Review approval"
                onPress={() =>
                  router.push({
                    pathname: "/approval/[id]",
                    params: { id: approval.id },
                  })
                }
              />
            </View>
          )}
          {connection && (
            <View style={[s.card, { marginTop: 24 }]}>
              <Copy style={styles.cardTitle}>
                Connect{" "}
                {state.extensions.find((e) => e.id === connection.toolkit)
                  ?.name ?? connection.toolkit}
              </Copy>
              <Copy style={{ color: c.muted, marginBottom: 18 }}>
                Otto needs access to continue this task.
              </Copy>
              <Button
                label="Connect"
                onPress={() =>
                  router.push({
                    pathname: "/connect/[id]",
                    params: { id: connection.toolkit },
                  })
                }
              />
            </View>
          )}
          <Section title="Activity" aside={`${steps.length} steps`} />
          <View style={s.card}>
            {steps.length ? (
              steps.map((step, index) => (
                <Step
                  key={step.id}
                  step={step}
                  last={index === steps.length - 1}
                />
              ))
            ) : (
              <Copy style={{ color: c.muted }}>
                Waiting for the first step.
              </Copy>
            )}
          </View>
          {!!task.error && (
            <View accessibilityRole="alert" style={[s.card, { marginTop: 16 }]}>
              <Copy style={{ color: c.danger, fontWeight: "600" }}>
                Unable to finish
              </Copy>
              <Copy style={{ marginTop: 8 }}>{task.error}</Copy>
              <View style={{ marginTop: 18 }}>
                <Button
                  label="Edit request in Ask"
                  icon="edit-2"
                  onPress={() =>
                    router.push({
                      pathname: "/(tabs)/chat",
                      params: { draft: task.goal },
                    })
                  }
                />
              </View>
            </View>
          )}
          {task.detail_md && task.status !== "succeeded" && (
            <>
              <Section title="Outcome" />
              <View style={s.card}>
                <Copy selectable>{task.detail_md}</Copy>
              </View>
            </>
          )}
          <Section title="Source" />
          <View style={s.group}>
            {turns.length ? (
              turns.map((turn, index) => (
                <View
                  key={turn.id}
                  style={[
                    styles.transcript,
                    index > 0 && {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: c.line,
                    },
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open transcript in Context"
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/context",
                        params: { turn: turn.id },
                      })
                    }
                    style={styles.row}
                  >
                    <Copy style={{ fontWeight: "600", flex: 1 }}>
                      You ·{" "}
                      {new Date(turn.started_at).toLocaleTimeString(undefined, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Copy>
                    <Feather name="arrow-up-right" size={18} color={c.muted} />
                  </Pressable>
                  <Copy selectable style={{ marginTop: 12 }}>
                    “{turn.user_text}”
                  </Copy>
                  <Copy style={{ fontWeight: "600", marginTop: 20 }}>Otto</Copy>
                  <Copy selectable style={{ color: c.muted, marginTop: 8 }}>
                    {turn.assistant_text}
                  </Copy>
                </View>
              ))
            ) : (
              <View style={{ padding: 20 }}>
                <Copy>
                  {task.source === "chat"
                    ? "Requested in Ask."
                    : "No linked transcript."}
                </Copy>
                <Copy selectable style={{ color: c.muted, marginTop: 12 }}>
                  {task.goal}
                </Copy>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  title: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  meta: { fontSize: 14, lineHeight: 20, color: c.muted },
  cardTitle: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "600",
    marginBottom: 14,
  },
  step: { flexDirection: "row", gap: 14 },
  rail: { width: 28, alignItems: "center" },
  stepNumber: {
    minHeight: 26,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surface,
  },
  line: {
    position: "absolute",
    top: 30,
    bottom: -8,
    width: 1,
    backgroundColor: c.line,
  },
  detailsButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  facts: { backgroundColor: c.raised, padding: 14, borderRadius: 14, gap: 8 },
  json: { fontSize: 14, lineHeight: 21, color: c.muted },
  transcript: { padding: 20 },
});
