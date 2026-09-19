import React from "react";
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
export function BrandMark({ id, size = 38 }: { id: string; size?: number }) {
  const key = id.toLowerCase().replace(/[ _-]/g, "");
  const asset = marks[key === "calendar" ? "googlecalendar" : key];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        backgroundColor: asset ? "#F5F5F2" : c.raised,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {asset ? (
        <Image
          accessibilityLabel={id + " logo"}
          source={asset}
          contentFit="contain"
          style={{ width: size * 0.68, height: size * 0.68 }}
        />
      ) : (
        <Feather name="box" size={size * 0.48} color={c.muted} />
      )}
    </View>
  );
}
