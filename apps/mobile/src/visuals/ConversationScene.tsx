import { useEffect } from "react";
import { View } from "react-native";
import { Image } from "expo-image";
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export function ConversationScene({ active = false }: { active?: boolean }) {
  const focus = useSharedValue(0);
  useEffect(() => {
    focus.set(
      withTiming(active ? 1 : 0, {
        duration: 360,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [active, focus]);
  const pose = useAnimatedStyle(() => ({
    transform: [
      { scale: 1 - focus.value * 0.08 },
      { translateY: -focus.value * 8 },
      { rotate: `${focus.value * -3}deg` },
    ],
  }));
  return (
    <View style={{ height: 190, overflow: "hidden" }}>
      <Animated.View
        entering={FadeIn.duration(420).reduceMotion(ReduceMotion.System)}
        style={{ flex: 1 }}
      >
        <Animated.View style={[{ flex: 1 }, pose]}>
          <Image
            source={require("../../assets/otto-conversation.png")}
            contentFit="contain"
            accessibilityLabel="Sculptural jade Otto mark"
            style={{ width: "100%", height: "100%" }}
          />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
