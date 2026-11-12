import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession, type UpdateGroup } from "../../src/session/Session";
import { Avatar, Header } from "../../src/ui/chrome";

/** 24-hour text updates shared with your contacts, end-to-end encrypted (same rooms as the web app). */
export default function Updates() {
  const { colors, font, t, rtl, locale } = usePrefs();
  const { statusUpdates, postStatus, me } = useSession();
  const [groups, setGroups] = useState<UpdateGroup[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => { void statusUpdates().then(setGroups, () => undefined); }, [statusUpdates]);
  useFocusEffect(useCallback(() => { load(); const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]));

  async function post() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setNote(null);
    try {
      await postStatus(text);
      setText("");
      load();
    } catch {
      setNote(t("updateFailed"));
    } finally {
      setBusy(false);
    }
  }
  const time = (ts: number) => new Date(ts).toLocaleTimeString(locale === "ar" ? "ar-u-nu-latn" : "en", { hour: "numeric", minute: "2-digit" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title={t("updates")} />
      <FlatList
        data={groups}
        keyExtractor={(g) => g.userId}
        ListHeaderComponent={
          <View style={{ padding: 12, gap: 8, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
            <TextInput value={text} onChangeText={setText} placeholder={t("updatePlaceholder")} placeholderTextColor={colors.text3} multiline maxLength={700}
              style={{ minHeight: 64, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, backgroundColor: colors.surface, padding: 10, color: colors.text, fontFamily: font("400"), textAlign: rtl ? "right" : "left", writingDirection: rtl ? "rtl" : "ltr" }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Pressable accessibilityRole="button" onPress={() => void post()} style={{ height: 44, paddingHorizontal: 20, borderRadius: 6, backgroundColor: text.trim() ? colors.primary : colors.separatorStrong, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 16 }}>{t("updatePost")}</Text>
              </Pressable>
              <Text style={{ flex: 1, color: colors.text3, fontFamily: font("400"), fontSize: 12 }}>{t("updatePrivacy")}</Text>
            </View>
            {note ? <Text style={{ color: colors.statusFailed, fontFamily: font("500") }}>{note}</Text> : null}
          </View>
        }
        ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.text2, fontFamily: font("400"), margin: 24 }}>{t("updatesEmpty")}</Text>}
        renderItem={({ item }) => {
          const expanded = open === item.userId;
          const last = item.posts[item.posts.length - 1];
          return (
            <View style={{ borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
              <Pressable accessibilityRole="button" onPress={() => setOpen(expanded ? null : item.userId)} style={{ minHeight: 68, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 }}>
                <View style={{ borderRadius: 9, borderWidth: 2, borderColor: colors.primary, padding: 2 }}><Avatar name={item.mine ? me?.displayName || item.name : item.name} id={item.userId} size={44} /></View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.text, fontFamily: font("600"), fontSize: 16 }}>{item.mine ? t("updateMine") : item.name}</Text>
                  <Text numberOfLines={1} style={{ color: colors.text2, fontFamily: font("400"), fontSize: 13 }}>{last ? (expanded ? time(last.timestamp) : last.body) : ""}</Text>
                </View>
              </Pressable>
              {expanded ? item.posts.map((p) => (
                <View key={p.id} style={{ marginHorizontal: 14, marginBottom: 8, padding: 10, borderRadius: 6, backgroundColor: colors.surface }}>
                  <Text style={{ color: colors.text, fontFamily: font("400"), fontSize: 15, writingDirection: rtl ? "rtl" : "ltr" }}>{p.body}</Text>
                  <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 12, marginTop: 2 }}>{time(p.timestamp)}</Text>
                </View>
              )) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
