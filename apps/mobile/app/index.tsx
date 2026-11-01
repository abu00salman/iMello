import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { usePrefs } from "../src/prefs";
import { useSession } from "../src/session";

export default function Index() {
  const { status } = useSession();
  const { colors } = usePrefs();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={status === "ready" ? "/(tabs)/chats" : "/sign-in"} />;
}
