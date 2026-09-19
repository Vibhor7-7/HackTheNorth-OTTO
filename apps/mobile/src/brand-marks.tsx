import React, { useState } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import { Feather } from "@expo/vector-icons";
import { colors as c } from "./theme";
// Original toolkit logo assets downloaded 2026-09-19 from Composio's official
// logo service. Toolkit metadata (https://composio.dev/toolkits/gmail) identifies
// https://logos.composio.dev/api/{gmail,googlecalendar,shopify,notion,slack,github}.
// Preserve supplied artwork/colors; no tint, tracing, or replacement lettermarks.
const marks: Record<string, number> = {
  gmail: require("../assets/brands/gmail.svg"),
  googlecalendar: require("../assets/brands/googlecalendar.svg"),
  shopify: require("../assets/brands/shopify.svg"),
  notion: require("../assets/brands/notion.svg"),
  slack: require("../assets/brands/slack.svg"),
  github: require("../assets/brands/github.svg"),
};
// Only pass logos supplied by trusted toolkit/publisher metadata. Do not infer
// artwork from a company name, a favicon, or an arbitrary MCP server URL.
export function validatedLogoUrl(input?: string): string | undefined {
  if (!input) return undefined;
  try {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function BrandMark({
  id,
  size = 38,
  logoUrl,
}: {
  id: string;
  size?: number;
  logoUrl?: string;
}) {
  const key = id.toLowerCase().replace(/[ _-]/g, "");
  const asset = marks[key === "calendar" ? "googlecalendar" : key];
  const uri = validatedLogoUrl(logoUrl);
  const [failedRemote, setFailedRemote] = useState<string>();
  const [failedAsset, setFailedAsset] = useState<number>();
  const remote = uri && uri !== failedRemote ? uri : undefined;
  const bundled = asset && asset !== failedAsset ? asset : undefined;
  const source = remote ? { uri: remote } : bundled;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: source ? "#F5F5F2" : c.raised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {source ? (
        <Image
          accessibilityLabel={id + " logo"}
          source={source}
          cachePolicy="memory-disk"
          recyclingKey={remote ?? String(bundled)}
          onError={() => {
            if (remote) setFailedRemote(remote);
            else setFailedAsset(bundled);
          }}
          contentFit="contain"
          style={{ width: size * 0.68, height: size * 0.68 }}
        />
      ) : (
        <Feather name="box" size={size * 0.48} color={c.muted} />
      )}
    </View>
  );
}
