import { Platform } from "react-native";

export const colors = {
  background: "#080B0A",
  surface: "#1B201E",
  raised: "#272E2A",
  text: "#F4F7F5",
  muted: "#A3ADA7",
  line: "#303B34",
  accent: "#A3E9C5",
  accentSurface: "#173E2D",
  onAccent: "#0A271A",
  success: "#A3E9C5",
  warning: "#F2C784",
  danger: "#FF9D9A",
};
const system = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "system-ui",
});
export const fonts = { display: system, body: system, medium: system };
export const motion = { quick: 160, enter: 280, scene: 380 };
