import { Redirect, Tabs } from "expo-router";
import { Text, type ColorValue } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { t, colors } = usePrefs();
  const { status, me } = useSession();
  if (status === "signedOut") return <Redirect href="/sign-in" />;
  const child = me?.kind === "child";
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Tabs.Screen name="chats" options={{ title: t("nav.chats"), tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="calls" options={{ title: t("nav.calls"), tabBarIcon: icon("📞"), href: child ? null : undefined }} />
      <Tabs.Screen name="family" options={{ title: t("nav.family"), tabBarIcon: icon("🏡") }} />
      <Tabs.Screen name="contacts" options={{ title: t("nav.contacts"), tabBarIcon: icon("👤"), href: child ? null : undefined }} />
      <Tabs.Screen name="settings" options={{ title: t("nav.settings"), tabBarIcon: icon("⚙️") }} />
    </Tabs>
  );
}
