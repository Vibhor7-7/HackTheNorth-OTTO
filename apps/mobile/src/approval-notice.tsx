import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { GlassChrome } from "./glass";
import { Button, Copy, useOtto } from "./ui";
import { colors as c } from "./theme";
import { otto } from "./data/source";
import { decideApproval, timeRemaining } from "./data/approval-channel";

// A notice is an arrival, not a second persistent approval inbox.
const seenApprovals = new Set<string>();

export function ApprovalNotice() {
  const state = useOtto();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const pathname = usePathname();
  const [noticeId, setNoticeId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const receive = () => {
      const snapshot = otto.getSnapshot();
      if (!snapshot.hydrated) return;
      const arrivals = snapshot.approvals.filter(
        (item) =>
          item.status === "pending" &&
          Date.parse(item.expires_at) > Date.now() &&
          !seenApprovals.has(`${item.id}:${item.expires_at}`),
      );
      arrivals.forEach((item) =>
        seenApprovals.add(`${item.id}:${item.expires_at}`),
      );
      const next = arrivals.find(
        (item) => pathname !== "/urgent" && pathname !== `/approval/${item.id}`,
      );
      if (next) setNoticeId(next.id);
    };
    const unsubscribe = otto.subscribe(receive);
    const initial = setTimeout(receive, 0);
    return () => {
      clearTimeout(initial);
      unsubscribe();
    };
  }, [pathname]);
  const approval = state.approvals.find(
    (item) =>
      item.id === noticeId &&
      item.status === "pending" &&
      Date.parse(item.expires_at) > now,
  );
  const id = approval?.id;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (id)
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!noticeId || expandedId) return;
    const timer = setTimeout(() => setNoticeId(undefined), 8000);
    return () => clearTimeout(timer);
  }, [noticeId, expandedId]);
  useEffect(() => {
    if (pathname === "/urgent" || pathname === `/approval/${noticeId}`) {
      const timer = setTimeout(() => {
        setNoticeId(undefined);
        setExpandedId(undefined);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [pathname, noticeId]);
  const dismiss = () => {
    setNoticeId(undefined);
    setExpandedId(undefined);
  };
  if (
    !approval ||
    pathname === "/urgent" ||
    pathname === `/approval/${approval.id}`
  )
    return null;
  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, { zIndex: 1000 }]}
    >
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          right: 16,
          maxWidth: 600,
          alignSelf: "center",
        }}
      >
        <GlassChrome interactive style={{ borderRadius: 22 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              gap: 10,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Review approval: ${approval.summary}`}
              onPress={() => setExpandedId(approval.id)}
              style={{ flex: 1, minHeight: 44 }}
            >
              <Copy
                style={{ fontSize: 14, fontWeight: "600", color: c.accent }}
              >
                Otto · Demo approval
              </Copy>
              <Copy
                numberOfLines={1}
                style={{ marginTop: 3, fontWeight: "500" }}
              >
                {approval.summary}
              </Copy>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss approval notification"
              onPress={dismiss}
              style={styles.close}
            >
              <Feather name="x" size={20} color={c.muted} />
            </Pressable>
          </View>
        </GlassChrome>
      </View>
      <Modal
        visible={expandedId === approval.id}
        transparent
        animationType="none"
        onRequestClose={() => setExpandedId(undefined)}
      >
        <View
          style={[
            styles.backdrop,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <Pressable
            accessibilityLabel="Close approval"
            onPress={() => setExpandedId(undefined)}
            style={StyleSheet.absoluteFill}
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { maxHeight: height - insets.top - insets.bottom - 48 },
            ]}
          >
            <View style={styles.heading}>
              <Copy style={{ fontWeight: "600", flex: 1 }}>
                Otto · Demo approval
              </Copy>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close approval"
                onPress={() => setExpandedId(undefined)}
                style={styles.close}
              >
                <Feather name="x" size={22} color={c.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Copy style={{ fontSize: 24, lineHeight: 30, fontWeight: "700" }}>
                {approval.summary}
              </Copy>
              <Copy style={{ marginTop: 10, color: c.warning }}>
                {timeRemaining(approval.expires_at, now)}
              </Copy>
              <View style={{ marginTop: 20, gap: 16 }}>
                {Object.entries(approval.facts).map(([key, value]) => (
                  <View key={key}>
                    <Copy style={{ color: c.muted, fontSize: 14 }}>{key}</Copy>
                    <Copy
                      selectable
                      style={{ marginTop: 3, fontWeight: "500" }}
                    >
                      {value}
                    </Copy>
                  </View>
                ))}
              </View>
              <Copy style={{ color: c.muted, marginTop: 20, fontSize: 14 }}>
                This action is simulated. No real message, order, or charge is
                sent.
              </Copy>
            </ScrollView>
            <View
              style={{
                padding: 20,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: c.line,
                gap: 10,
              }}
            >
              <Button
                label="Approve"
                disabled={
                  state.network !== "online" ||
                  Date.parse(approval.expires_at) <= now
                }
                onPress={async () => {
                  await decideApproval(otto, approval.id, "approve");
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                  setExpandedId(undefined);
                }}
              />
              <Button
                destructive
                label="Deny"
                disabled={
                  state.network !== "online" ||
                  Date.parse(approval.expires_at) <= now
                }
                onPress={async () => {
                  await decideApproval(otto, approval.id, "deny");
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning,
                  );
                  setExpandedId(undefined);
                }}
              />
              <Button
                quiet
                label="Open Urgent"
                onPress={() => {
                  dismiss();
                  router.push("/urgent");
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "#00000099",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: c.surface,
    borderRadius: 28,
    overflow: "hidden",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.line,
  },
});
