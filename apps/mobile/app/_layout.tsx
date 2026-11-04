import "react-native-gesture-handler";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PrefsProvider, usePrefs } from "../src/prefs/Prefs";
import { SessionProvider } from "../src/session/Session";

function Shell() {
  const { colors, rtl } = usePrefs();
  return (
    <View style={{ flex: 1, direction: rtl ? "rtl" : "ltr", backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <SessionProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      </SessionProvider>
    </View>
  );
}

export default function Layout() {
  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <PrefsProvider>
          <Shell />
        </PrefsProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
