import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function Layout() {
  const dark = useColorScheme() === "dark";
  return (
    <SafeAreaProvider>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: dark ? "#0E1015" : "#F7F8FB" } }} />
    </SafeAreaProvider>
  );
}
