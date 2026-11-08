import { SymbolView, type AndroidSymbol, type SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IosSymbol = Extract<SymbolViewProps["name"], string>;
import { usePrefs } from "../prefs/Prefs";
import { colorIndex, displayInitial, type Receipt } from "../rpc/format";
import { AVATAR_COLORS, type ClassicColors } from "../theme/themes";

export function Icon({
  ios,
  android,
  color,
  size = 24,
  mirror = false,
}: {
  ios: IosSymbol;
  android: AndroidSymbol;
  color: string;
  size?: number;
  mirror?: boolean;
}) {
  const { rtl } = usePrefs();
  return (
    <SymbolView
      name={{ ios, android }}
      tintColor={color}
      size={size}
      style={mirror && rtl ? { transform: [{ scaleX: -1 }] } : undefined}
    />
  );
}

export function Avatar({ name, id, size = 52 }: { name: string; id: string; size?: number }) {
  const { font } = usePrefs();
  const color = AVATAR_COLORS[colorIndex(id)] ?? AVATAR_COLORS[0];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: size * 0.4 }}>{displayInitial(name)}</Text>
    </View>
  );
}

export function Header({
  title,
  subtitle,
  avatar,
  dot,
  onPress,
  leading,
  trailing,
}: {
  title: string;
  subtitle?: string;
  avatar?: { name: string; id: string };
  dot?: string;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const { colors, font, rtl } = usePrefs();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text numberOfLines={1} style={{ color: colors.headerText, fontFamily: font("600"), fontSize: 18, lineHeight: 26, writingDirection: rtl ? "rtl" : "ltr" }}>
        {title}
      </Text>
      {subtitle ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
          {avatar ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: dot ?? colors.avail }} /> : null}
          <Text numberOfLines={1} style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 13, flex: 1 }}>
            {subtitle}
          </Text>
        </View>
      ) : null}
    </View>
  );
  return (
    <View style={{ backgroundColor: colors.headerBg, paddingTop: insets.top + 4, paddingBottom: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
      {leading}
      {avatar ? <Avatar name={avatar.name} id={avatar.id} size={48} /> : null}
      {onPress ? (
        <Pressable onPress={onPress} style={{ flex: 1 }} accessibilityRole="button">
          {body}
        </Pressable>
      ) : (
        body
      )}
      {trailing}
    </View>
  );
}

export function IconButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
      {children}
    </Pressable>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  secure,
  ltr,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  ltr?: boolean;
}) {
  const { colors, font } = usePrefs();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.text3}
      secureTextEntry={secure}
      autoCapitalize="none"
      autoCorrect={false}
      style={{
        height: 48,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.separatorStrong,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        color: colors.text,
        fontFamily: font("400"),
        fontSize: 16,
        textAlign: ltr ? "left" : undefined,
        writingDirection: ltr ? "ltr" : undefined,
      }}
    />
  );
}

export function PrimaryButton({ label, onPress, busy, fill }: { label: string; onPress: () => void; busy?: boolean; fill?: string }) {
  const { colors, font } = usePrefs();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={{ height: 48, borderRadius: 6, backgroundColor: fill ?? colors.primaryFill, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
    >
      <Text style={{ color: colors.onPrimary, fontFamily: font("600"), fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

export function ReceiptMark({ receipt, colors }: { receipt: Receipt | null; colors: ClassicColors }) {
  const { font } = usePrefs();
  if (!receipt) return null;
  if (receipt === "failed") {
    return (
      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.statusFailed, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 11 }}>!</Text>
      </View>
    );
  }
  const letter = receipt === "pending" ? "✓" : receipt === "read" ? "R" : "D";
  const color = receipt === "read" ? colors.statusRead : colors.statusSent;
  return <Text style={{ color, fontFamily: font("700"), fontSize: 13, minWidth: 14, textAlign: "center" }}>{letter}</Text>;
}

export function textStyle(fontFamily: string, size: number, color: string, extra?: TextStyle): TextStyle {
  return { fontFamily, fontSize: size, color, ...extra };
}

export function cardShadow(colors: ClassicColors): ViewStyle {
  return colors.dark ? {} : { shadowColor: "#16191E", shadowOpacity: 0.16, shadowRadius: 1.5, shadowOffset: { width: 0, height: 1 }, elevation: 1 };
}
