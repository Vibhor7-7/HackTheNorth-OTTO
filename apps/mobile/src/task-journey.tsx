import { View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Copy } from "./ui";
import { colors as c } from "./theme";
import type { Task } from "./data/types";

export function TaskJourney({
  task,
  compact = false,
}: {
  task: Task;
  compact?: boolean;
}) {
  const waiting = [
    "needs_input",
    "awaiting_approval",
    "awaiting_connection",
  ].includes(task.status);
  const terminal = ["succeeded", "failed", "cancelled"].includes(task.status);
  const label =
    task.status === "needs_input"
      ? "Your answer"
      : task.status === "awaiting_connection"
        ? "Connect"
        : "Decision";
  const stages = [
    task.source === "voice" ? "Heard" : "Requested",
    "Working",
    ...(waiting ? [label] : []),
    task.status === "failed"
      ? "Failed"
      : task.status === "cancelled"
        ? "Stopped"
        : "Result",
  ];
  const active = terminal ? stages.length - 1 : waiting ? 2 : 1;
  return (
    <View
      accessibilityLabel={`Task journey: ${stages[active]}`}
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        paddingVertical: compact ? 12 : 22,
      }}
    >
      {stages.map((stage, index) => (
        <View key={stage} style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Feather
              name={
                index < active || (terminal && task.status === "succeeded")
                  ? "check"
                  : index === active && task.status === "failed"
                    ? "alert-triangle"
                    : index === active && task.status === "cancelled"
                      ? "x"
                      : index === active && waiting
                        ? "pause"
                        : index === active
                          ? "arrow-right"
                          : "minus"
              }
              size={18}
              color={index <= active ? c.accent : c.line}
            />
            {index < stages.length - 1 && (
              <View
                style={{
                  flex: 1,
                  height: 1,
                  marginHorizontal: 9,
                  backgroundColor: index < active ? c.accent : c.line,
                }}
              />
            )}
          </View>
          <Copy
            style={{
              fontSize: 14,
              fontWeight: index === active ? "600" : "400",
              color: index <= active ? c.text : c.muted,
            }}
          >
            {stage}
          </Copy>
        </View>
      ))}
    </View>
  );
}

export function FactDetails({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object")
    return (
      <Copy selectable style={{ color: c.muted }}>
        {String(value)}
      </Copy>
    );
  return (
    <View style={{ gap: 10 }}>
      {Object.entries(value).map(([key, entry]) => (
        <View key={key} style={{ gap: 3 }}>
          <Copy style={{ color: c.muted, fontSize: 14 }}>
            {key
              .replace(/_/g, " ")
              .replace(/^./, (letter) => letter.toUpperCase())}
          </Copy>
          {typeof entry === "object" && entry !== null ? (
            <FactDetails value={entry} />
          ) : (
            <Copy selectable>
              {typeof entry === "boolean"
                ? entry
                  ? "Yes"
                  : "No"
                : String(entry ?? "—")}
            </Copy>
          )}
        </View>
      ))}
    </View>
  );
}
