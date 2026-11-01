import { radius, spacing, typography, MIN_TOUCH_TARGET } from "@imello/ui";
import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { usePrefs } from "./prefs";

export function Screen({ children }: { children: ReactNode }) {
  const { colors } = usePrefs();
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{children}</View>;
}

export function Title({ children, center }: { children: ReactNode; center?: boolean }) {
  const { colors, rtl } = usePrefs();
  return (
    <Text
      accessibilityRole="header"
      // Full width avoids Android clipping bold Arabic text in centred containers.
      style={[styles.title, { color: colors.textPrimary, alignSelf: "stretch", textAlign: center ? "center" : rtl ? "right" : "left" }]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, muted, center }: { children: ReactNode; muted?: boolean; center?: boolean }) {
  const { colors, rtl } = usePrefs();
  return (
    <Text style={[styles.body, { color: muted ? colors.textSecondary : colors.textPrimary, alignSelf: "stretch", textAlign: center ? "center" : rtl ? "right" : "left" }]}>
      {children}
    </Text>
  );
}

export function Card({ children }: { children: ReactNode }) {
  const { colors } = usePrefs();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

export function Button({ title, onPress, variant = "primary", busy, disabled }: { title: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; busy?: boolean; disabled?: boolean }) {
  const { colors } = usePrefs();
  const bg = variant === "primary" ? colors.accent : variant === "secondary" ? colors.accentSoft : "transparent";
  const fg = variant === "primary" ? colors.accentText : variant === "secondary" ? colors.accent : colors.danger;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, borderColor: variant === "danger" ? colors.danger : "transparent" }]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { colors, rtl } = usePrefs();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[styles.label, { color: colors.textPrimary, textAlign: rtl ? "right" : "left" }]}>{props.label}</Text>
      <TextInput
        accessibilityLabel={props.label}
        placeholderTextColor={colors.textSecondary}
        {...props}
        style={[styles.input, { borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.surface, textAlign: rtl ? "right" : "left" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg, gap: spacing.md },
  title: { fontSize: typography.size.title1, fontWeight: "700", marginBottom: spacing.sm },
  body: { fontSize: typography.size.body, lineHeight: typography.size.body * 1.5 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm },
  button: { minHeight: MIN_TOUCH_TARGET, borderRadius: radius.pill, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  buttonText: { fontSize: typography.size.callout, fontWeight: "600" },
  label: { fontWeight: "600", marginBottom: spacing.xs },
  input: { minHeight: MIN_TOUCH_TARGET, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, fontSize: typography.size.body },
});
