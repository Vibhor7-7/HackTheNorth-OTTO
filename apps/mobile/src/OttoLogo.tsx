import { View } from "react-native";
import { Image } from "expo-image";

export function OttoLogo({ size = 38 }: { size?: number }) {
  return (
    <View
      accessibilityLabel="Otto"
      accessible
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        borderRadius: size / 2,
      }}
    >
      <Image
        source={require("../assets/otto-logo.png")}
        contentFit="contain"
        style={{
          width: size * 3,
          height: size * 3,
          position: "absolute",
          left: -size,
          top: -size,
        }}
      />
    </View>
  );
}
