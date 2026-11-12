import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession, type CallRow } from "../../src/session/Session";
import { Avatar, Header } from "../../src/ui/chrome";

/** Call history from the call events in your conversations (the same data the web app shows). */
export default function Calls() {
  const { colors, font, t, locale } = usePrefs();
  const { callHistory } = useSession();
  const [rows, setRows] = useState<CallRow[]>([]);
  useFocusEffect(useCallback(() => { void callHistory().then(setRows, () => undefined); }, [callHistory]));
  const when = (ts: number) => {
    const d = new Date(ts);
    const loc = locale === "ar" ? "ar-u-nu-latn" : "en";
    return new Date().toDateString() === d.toDateString() ? d.toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString(loc, { day: "numeric", month: "short" });
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t("calls")} />
      <FlatList
        data={rows}
        keyExtractor={(c) => c.callId}
        ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.text2, fontFamily: font("400"), margin: 24 }}>{t("callsEmpty")}</Text>}
        ListFooterComponent={<Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 13, padding: 16 }}>{t("callsNativeNote")}</Text>}
        renderItem={({ item }) => {
          const missed = !item.outgoing && !item.answered;
          const tone = missed ? colors.statusFailed : colors.text2;
          return (
            <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
              <Avatar name={item.name} id={item.userId ?? item.roomId} size={44} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: missed ? colors.statusFailed : colors.text, fontFamily: font("600"), fontSize: 16 }}>{item.name}</Text>
                <Text style={{ color: tone, fontFamily: font("400"), fontSize: 13 }}>
                  {item.outgoing ? "↗ " : "↙ "}{t(missed ? "callMissed" : item.outgoing ? "callOutgoing" : "callIncoming")} · {t(item.video ? "callVideo" : "callVoice")}
                  {item.durationSec != null ? ` · ${Math.floor(item.durationSec / 60)}:${String(item.durationSec % 60).padStart(2, "0")}` : ""}
                </Text>
              </View>
              <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 12 }}>{when(item.startedAt)}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}
