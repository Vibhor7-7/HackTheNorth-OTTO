import React, { useEffect, useState } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Button, Copy, ToolMark, useOtto } from "./ui";
import { colors as c, fonts } from "./theme";
import { otto } from "./data/source";
import type { CatalogEntry } from "./data/types";

// D-34 / APP-4: browse Composio's catalogue and add a toolkit from the phone.
// "managed" toolkits connect right here (the server creates the auth config and
// opens the Connect Link); "none" toolkits need no account and are enabled on
// tap; "custom" ones need credentials only the Composio dashboard takes.
export function CatalogSheet() {
  const state = useOtto();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      otto
        .searchCatalog(query)
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setError("");
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setError(
            err instanceof Error ? err.message : "Could not load the catalogue.",
          );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const statusOf = (slug: string) =>
    state.extensions.find((e) => e.id === slug)?.status;

  const add = async (entry: CatalogEntry) => {
    setBusy(entry.slug);
    setRowError((r) => ({ ...r, [entry.slug]: "" }));
    try {
      await otto.connect(entry.slug);
    } catch (err) {
      setRowError((r) => ({
        ...r,
        [entry.slug]:
          err instanceof Error ? err.message : "Could not add this app.",
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 14,
          backgroundColor: c.raised,
          borderRadius: 16,
          marginBottom: 16,
        }}
      >
        <Feather name="search" size={19} color={c.muted} />
        <TextInput
          accessibilityLabel="Search apps"
          placeholder="Search 1,500 apps"
          placeholderTextColor={c.muted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            fontFamily: fonts.body,
            fontSize: 17,
            color: c.text,
            minHeight: 48,
          }}
        />
        {loading && <ActivityIndicator size="small" color={c.accent} />}
      </View>
      {!!error && (
        <Copy accessibilityRole="alert" style={{ color: c.danger, marginBottom: 12 }}>
          {error}
        </Copy>
      )}
      {results.map((entry, i) => {
        const status = statusOf(entry.slug);
        const connected = status === "connected";
        const waiting = status === "needs_auth";
        return (
          <View
            key={entry.slug}
            style={{
              paddingVertical: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderColor: c.line,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <ToolMark id={entry.slug} logoUrl={entry.logo_url} />
              <View style={{ flex: 1 }}>
                <Copy style={{ fontWeight: "600", fontSize: 17 }}>{entry.name}</Copy>
                <Copy style={{ color: c.muted, fontSize: 14, marginTop: 2 }}>
                  {entry.tool_count} tools
                  {entry.auth === "none"
                    ? " · no sign-in needed"
                    : entry.auth === "custom"
                      ? " · needs an API key"
                      : ""}
                </Copy>
              </View>
              {connected ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Feather name="check-circle" size={18} color={c.accent} />
                  <Copy style={{ color: c.accent, fontSize: 14 }}>Added</Copy>
                </View>
              ) : entry.auth === "custom" ? (
                <Copy style={{ color: c.muted, fontSize: 14 }}>Dashboard</Copy>
              ) : (
                <Button
                  label={
                    busy === entry.slug
                      ? "Opening…"
                      : waiting
                        ? "Sign in"
                        : entry.auth === "none"
                          ? "Add"
                          : "Connect"
                  }
                  quiet={waiting}
                  disabled={busy !== null || state.network !== "online"}
                  onPress={() => void add(entry)}
                />
              )}
            </View>
            {!!entry.description && (
              <Copy numberOfLines={2} style={{ color: c.muted, fontSize: 14 }}>
                {entry.description}
              </Copy>
            )}
            {!!rowError[entry.slug] && (
              <Copy accessibilityRole="alert" style={{ color: c.danger, fontSize: 14 }}>
                {rowError[entry.slug]}
              </Copy>
            )}
          </View>
        );
      })}
      {!loading && !results.length && !error && (
        <Copy style={{ color: c.muted, paddingVertical: 20 }}>
          {`No apps match “${query}”.`}
        </Copy>
      )}
      <View style={{ paddingTop: 16 }}>
        <Copy style={{ color: c.muted, fontSize: 14 }}>
          Sign-in happens in your browser through Composio. Otto never sees your
          password. Apps marked Dashboard need an API key entered once at
          platform.composio.dev.
        </Copy>
      </View>
    </View>
  );
}
