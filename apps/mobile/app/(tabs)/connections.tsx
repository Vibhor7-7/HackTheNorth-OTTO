import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Copy,
  Header,
  IconButton,
  Section,
  ToolMark,
  s,
  useOtto,
} from "../../src/ui";
import { colors as c } from "../../src/theme";
import { otto } from "../../src/data/mock";
export default function ConnectionsScreen() {
  const state = useOtto();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const recent = [...state.tasks]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .flatMap((t) => t.toolkits_used.map((x) => x.toLowerCase()));
  const tools = [...state.extensions].sort(
    (a, b) =>
      (recent.indexOf(a.id) < 0 ? 999 : recent.indexOf(a.id)) -
      (recent.indexOf(b.id) < 0 ? 999 : recent.indexOf(b.id)),
  );
  const connected = tools.filter((t) => t.status === "connected");
  const suggested = tools.filter((t) => t.status === "suggested");
  const open = (id: string) =>
    router.push({ pathname: "/connect/[id]", params: { id } });
  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c.accent}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await otto.getHome();
              } finally {
                setRefreshing(false);
              }
            }}
          />
        }
      >
        <Header
          title="Apps"
          right={
            <IconButton
              name="settings"
              label="Settings"
              onPress={() => router.push("/settings")}
            />
          }
        />
        {tools
          .filter((t) => t.status === "needs_auth")
          .map((tool) => (
            <View
              key={tool.id}
              style={[
                s.card,
                { backgroundColor: c.accentSurface, marginBottom: 14 },
              ]}
            >
              <View
                style={{ flexDirection: "row", gap: 14, alignItems: "center" }}
              >
                <ToolMark id={tool.id} size={46} />
                <View style={{ flex: 1 }}>
                  <Copy style={{ fontSize: 19, fontWeight: "600" }}>
                    {tool.name}
                  </Copy>
                  <Copy style={{ color: c.accent, marginTop: 3 }}>
                    Needs your sign-in to continue
                  </Copy>
                </View>
              </View>
              <View style={{ alignSelf: "flex-start", marginTop: 18 }}>
                <Button label="Sign in" onPress={() => open(tool.id)} />
              </View>
            </View>
          ))}
        <Section title="Connected" aside={String(connected.length)} />
        <View style={s.group}>
          {connected.map((tool, i) => (
            <View key={tool.id}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tool.name + " connection details"}
                onPress={() =>
                  setExpanded(expanded === tool.id ? null : tool.id)
                }
                style={{
                  padding: 18,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 13,
                  borderBottomWidth: i < connected.length - 1 ? 1 : 0,
                  borderColor: c.line,
                }}
              >
                <ToolMark id={tool.id} />
                <View style={{ flex: 1 }}>
                  <Copy style={{ fontWeight: "600", fontSize: 17 }}>
                    {tool.name}
                  </Copy>
                  <Copy style={{ color: c.muted, marginTop: 3 }}>
                    {tool.tool_count} tools available
                  </Copy>
                </View>
                <Feather name="check-circle" size={22} color={c.accent} />
              </Pressable>
              {expanded === tool.id && (
                <View style={{ padding: 18, paddingTop: 2 }}>
                  <Copy style={{ color: c.muted, marginBottom: 14 }}>
                    {tool.description}
                  </Copy>
                  <Button
                    label="Disconnect"
                    destructive
                    onPress={() => otto.disconnect(tool.id)}
                  />
                </View>
              )}
            </View>
          ))}
          {!connected.length && (
            <Copy style={{ padding: 20, color: c.muted }}>
              No connected apps.
            </Copy>
          )}
        </View>
        <Section title="Suggested apps" />
        <View style={s.group}>
          {suggested.map((tool, i) => (
            <View
              key={tool.id}
              style={{
                padding: 18,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderBottomWidth: i < suggested.length - 1 ? 1 : 0,
                borderColor: c.line,
              }}
            >
              <ToolMark id={tool.id} />
              <View style={{ flex: 1 }}>
                <Copy style={{ fontSize: 17, fontWeight: "600" }}>
                  {tool.name}
                </Copy>
                <Copy style={{ color: c.muted, fontSize: 15, marginTop: 3 }}>
                  {tool.description}
                </Copy>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={"Add " + tool.name}
                onPress={() => open(tool.id)}
                style={{
                  backgroundColor: c.raised,
                  borderRadius: 22,
                  paddingHorizontal: 16,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Copy style={{ color: c.accent, fontWeight: "600" }}>Add</Copy>
              </Pressable>
            </View>
          ))}
          {!suggested.length && (
            <Copy style={{ padding: 20, color: c.muted }}>
              All available apps are connected.
            </Copy>
          )}
        </View>
        <Copy style={{ color: c.muted, marginTop: 18, fontSize: 14 }}>
          Demo connections. No accounts are linked.
        </Copy>
      </ScrollView>
    </View>
  );
}
