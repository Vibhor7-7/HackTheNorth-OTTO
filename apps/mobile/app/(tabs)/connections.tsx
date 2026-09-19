import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Copy,
  Header,
  Section,
  ToolMark,
  s,
  useOtto,
} from "../../src/ui";
import { colors as c } from "../../src/theme";
import { otto } from "../../src/data/mock";
import {
  CustomMcp,
  loadCustomMcp,
  saveCustomMcp,
  validateMcp,
} from "../../src/data/custom-mcp";
export default function ConnectionsScreen() {
  const state = useOtto();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"mcp" | "tools" | null>(null);
  const [mcps, setMcps] = useState<CustomMcp[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    void loadCustomMcp()
      .then(setMcps)
      .catch(() => setError("Saved MCP servers could not be loaded."));
  }, []);
  const recent = [...state.tasks]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .flatMap((t) => t.toolkits_used.map((x) => x.toLowerCase()));
  const tools = [...state.extensions].sort(
    (a, b) =>
      (recent.indexOf(a.id) < 0 ? 999 : recent.indexOf(a.id)) -
      (recent.indexOf(b.id) < 0 ? 999 : recent.indexOf(b.id)),
  );
  const connected = tools.filter((t) => t.status === "connected");
  const available = tools.filter((t) => t.status === "suggested");
  const open = (id: string) =>
    router.push({ pathname: "/connect/[id]", params: { id } });
  const add = async () => {
    const value = validateMcp(name, url);
    if (mcps.some((m) => m.url === value.url))
      throw new Error("This server is already saved.");
    const next = [
      ...mcps,
      {
        ...value,
        id: "mcp-" + Date.now(),
        createdAt: new Date().toISOString(),
      },
    ];
    await saveCustomMcp(next);
    setMcps(next);
    setName("");
    setUrl("");
    setSheet(null);
  };
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
        <Header title="Apps" />
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
                <ToolMark id={tool.id} size={46} logoUrl={tool.logoUrl} />
                <View style={{ flex: 1 }}>
                  <Copy style={{ fontSize: 19, fontWeight: "600" }}>
                    {tool.name}
                  </Copy>
                  <Copy style={{ color: c.accent, marginTop: 3 }}>
                    Sign in to continue your task
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
                accessibilityState={{ expanded: expanded === tool.id }}
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
                <ToolMark id={tool.id} logoUrl={tool.logoUrl} />
                <View style={{ flex: 1 }}>
                  <Copy style={{ fontWeight: "600", fontSize: 17 }}>
                    {tool.name}
                  </Copy>
                  <Copy style={{ color: c.muted, marginTop: 3 }}>
                    {tool.tool_count} tools available
                  </Copy>
                </View>
                <Feather
                  name={expanded === tool.id ? "chevron-up" : "chevron-down"}
                  size={19}
                  color={c.muted}
                />
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
        <Section title="Tools on demand" />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="How Composio tools work"
          onPress={() => setSheet("tools")}
          style={s.card}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Copy style={{ fontSize: 18, fontWeight: "600", flex: 1 }}>
              Powered by Composio
            </Copy>
            <Feather name="arrow-up-right" size={20} color={c.accent} />
          </View>
          <Copy style={{ color: c.muted, marginTop: 10 }}>
            Tools connect when a task needs them.
          </Copy>
          {available.length > 0 && (
            <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
              {available.map((tool) => (
                <ToolMark key={tool.id} id={tool.id} logoUrl={tool.logoUrl} />
              ))}
            </View>
          )}
        </Pressable>
        <Section title="Custom MCP" />
        <View style={s.group}>
          {mcps.map((server, i) => (
            <View
              key={server.id}
              style={{
                padding: 18,
                borderBottomWidth: i < mcps.length - 1 ? 1 : 0,
                borderColor: c.line,
              }}
            >
              <View
                style={{ flexDirection: "row", gap: 12, alignItems: "center" }}
              >
                <ToolMark id={server.id} logoUrl={server.logoUrl} />
                <Copy style={{ fontWeight: "600", fontSize: 17, flex: 1 }}>
                  {server.name}
                </Copy>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={"Remove " + server.name}
                  onPress={async () => {
                    try {
                      const next = mcps.filter((m) => m.id !== server.id);
                      await saveCustomMcp(next);
                      setMcps(next);
                      setError("");
                    } catch {
                      setError("Could not remove server. Try again.");
                    }
                  }}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="trash-2" size={18} color={c.muted} />
                </Pressable>
              </View>
              <Copy
                selectable
                style={{ color: c.muted, fontSize: 14, marginTop: 8 }}
              >
                {server.url}
              </Copy>
              <Copy style={{ color: c.muted, fontSize: 14, marginTop: 4 }}>
                Saved locally. Not connected.
              </Copy>
            </View>
          ))}
          {!mcps.length && (
            <View style={{ padding: 20 }}>
              <Copy style={{ color: c.muted }}>No custom servers</Copy>
            </View>
          )}
        </View>
        <View style={{ marginTop: 14 }}>
          <Button
            label="Add MCP server"
            quiet
            icon="plus"
            onPress={() => setSheet("mcp")}
          />
        </View>
        {!!error && (
          <Copy
            accessibilityRole="alert"
            style={{ color: c.danger, marginTop: 12 }}
          >
            {error}
          </Copy>
        )}
        <Copy style={{ color: c.muted, fontSize: 14, marginTop: 18 }}>
          Demo only. No accounts or MCP servers are connected.
        </Copy>
      </ScrollView>
      <Modal
        visible={sheet !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSheet(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#00000080",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close sheet"
            onPress={() => setSheet(null)}
            style={{ flex: 1 }}
          />
          <View
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              padding: 24,
              paddingBottom: Math.max(insets.bottom, 24),
              maxHeight: "85%",
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 22,
                }}
              >
                <Copy style={{ fontSize: 24, fontWeight: "700", flex: 1 }}>
                  {sheet === "mcp"
                    ? "Add MCP server"
                    : "Tools when you need them"}
                </Copy>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={() => setSheet(null)}
                  style={{
                    minWidth: 44,
                    minHeight: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="x" size={24} color={c.text} />
                </Pressable>
              </View>
              {sheet === "mcp" ? (
                <>
                  <Copy style={{ marginBottom: 8 }}>Name</Copy>
                  <TextInput
                    accessibilityLabel="MCP server name"
                    placeholder="My workspace"
                    placeholderTextColor={c.muted}
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                    style={s.input}
                  />
                  <Copy style={{ marginTop: 20, marginBottom: 8 }}>
                    Server URL
                  </Copy>
                  <TextInput
                    accessibilityLabel="MCP server HTTPS URL"
                    placeholder="https://example.com/mcp"
                    placeholderTextColor={c.muted}
                    value={url}
                    onChangeText={setUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    style={s.input}
                  />
                  <Copy style={{ color: c.muted, marginVertical: 18 }}>
                    Saved on this device only. Do not include API keys, tokens
                    or passwords. Connection and authentication will come with
                    the backend.
                  </Copy>
                  <Button
                    label="Save server"
                    disabled={!name.trim() || !url.trim()}
                    onPress={add}
                  />
                </>
              ) : (
                <>
                  <Copy style={{ fontSize: 17, lineHeight: 26 }}>
                    Otto discovers the right Composio tools while working on a
                    task. Authorized apps can be reused without setting up each
                    task by hand.
                  </Copy>
                  <Copy
                    style={{ color: c.muted, marginTop: 20, lineHeight: 25 }}
                  >
                    If an app needs your account, you will be asked to sign in
                    and grant access. Tool discovery does not bypass OAuth or
                    your approval for sensitive actions.
                  </Copy>
                  <Copy style={{ color: c.muted, marginVertical: 20 }}>
                    This preview simulates discovery and sign-in. No Composio
                    requests are sent.
                  </Copy>
                  <Button label="Got it" onPress={() => setSheet(null)} />
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
