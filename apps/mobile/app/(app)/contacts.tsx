import { ApiError, extractInviteToken, type Contact, type ContactRequest } from "@imello/core";
import { normalizeImelloCode } from "../../src/rpc/code";
import { useFocusEffect, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { Avatar, Header, Icon, IconButton } from "../../src/ui/chrome";

export default function Contacts() {
  const { colors, font, t, rtl } = usePrefs();
  const { api, me, openDirect } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);
  const [query, setQuery] = useState("");
  const [code, setCode] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [list, requests] = await Promise.all([api.contacts(), api.contactRequests()]);
    setContacts(list);
    setIncoming(requests.incoming);
  }, [api]);
  useFocusEffect(useCallback(() => { void load().catch(() => undefined); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? contacts.filter((c) => c.displayName.toLowerCase().includes(q)) : contacts;
    return [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName, rtl ? "ar" : "en"));
  }, [contacts, query, rtl]);

  async function add() {
    setNote(null);
    const pin = normalizeImelloCode(code);
    const token = extractInviteToken(code);
    try {
      if (pin) {
        if (pin === me?.pin) return setNote(t("invalidCode"));
        const res = await api.sendContactRequest(pin);
        setNote(res.status === "already_contact" ? t("alreadyContact") : t("requestSent"));
      } else if (token) {
        const res = await api.redeemInvite(token);
        setNote(res.contact?.status === "pending_guardian" ? t("guardianWait") : t("contactAdded"));
      } else return setNote(t("invalidCode"));
      setCode("");
      await load();
    } catch (err) {
      setNote(err instanceof ApiError && err.status === 429 ? t("tooShort") : t("invalidCode"));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={me?.displayName || t("contacts")}
        subtitle={me?.pin ?? undefined}
        avatar={{ name: me?.displayName || "iMello", id: me?.userId ?? "me" }}
        trailing={
          <IconButton label={t("codeTitle")} onPress={() => router.push("/code")}>
            <Icon ios="qrcode" android="qr_code" color="#fff" />
          </IconButton>
        }
      />
      <View style={{ margin: 12, height: 40, borderRadius: 6, backgroundColor: colors.surface2, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 }}>
        <Icon ios="magnifyingglass" android="search" color={colors.text3} size={18} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t("searchContacts")} placeholderTextColor={colors.text3} style={{ flex: 1, color: colors.text, fontFamily: font("400"), fontSize: 15 }} />
      </View>
      <Pressable onPress={() => router.push("/code")} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Icon ios="person.badge.plus" android="person_add" color="#fff" size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.primary, fontFamily: font("600"), fontSize: 16 }}>{t("inviteTitle")}</Text>
          <Text style={{ color: colors.text2, fontFamily: font("400"), fontSize: 13 }}>{t("inviteHint")}</Text>
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, marginBottom: 8 }}>
        <TextInput value={code} onChangeText={setCode} placeholder={t("addByCode")} placeholderTextColor={colors.text3} autoCapitalize="none" style={{ flex: 1, height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, paddingHorizontal: 12, color: colors.text, fontFamily: font("400"), writingDirection: "ltr" }} />
        <Pressable onPress={() => void add()} style={{ height: 44, paddingHorizontal: 14, borderRadius: 6, backgroundColor: colors.primaryFill, justifyContent: "center" }}>
          <Text style={{ color: "#fff", fontFamily: font("600") }}>{t("add")}</Text>
        </Pressable>
      </View>
      {note ? <Text style={{ color: colors.primary, fontFamily: font("500"), paddingHorizontal: 16, marginBottom: 6 }}>{note}</Text> : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.contactId}
        ListHeaderComponent={
          incoming.length ? (
            <View>
              <Text style={{ color: colors.primary, fontFamily: font("700"), paddingHorizontal: 14, paddingVertical: 6 }}>{t("requests")}</Text>
              {incoming.map((req) => (
                <View key={req.requestId} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Avatar name={req.displayName} id={req.userId} size={44} />
                  <Text style={{ flex: 1, color: colors.text, fontFamily: font("500") }}>{t("wantsToAdd", { name: req.displayName })}</Text>
                  <Pressable onPress={() => void api.respondToContactRequest(req.requestId, true).then(load)}><Text style={{ color: colors.primary, fontFamily: font("700") }}>{t("accept")}</Text></Pressable>
                  <Pressable onPress={() => void api.respondToContactRequest(req.requestId, false).then(load)}><Text style={{ color: colors.statusFailed, fontFamily: font("600") }}>{t("decline")}</Text></Pressable>
                </View>
              ))}
            </View>
          ) : undefined
        }
        ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.text2, fontFamily: font("400"), margin: 24 }}>{t("noContacts")}</Text>}
        renderItem={({ item, index }) => {
          const letter = displayLetter(item.displayName);
          const prev = index > 0 ? displayLetter(filtered[index - 1]?.displayName ?? "") : "";
          const sub = item.status === "pending_guardian" ? t("guardianWait") : item.status === "denied" ? t("decline") : t("message");
          return (
            <View>
              {letter !== prev ? <Text style={{ color: colors.primary, fontFamily: font("700"), backgroundColor: colors.grouped, paddingHorizontal: 14, paddingVertical: 4 }}>{letter}</Text> : null}
              <Pressable
                onPress={() => {
                  if (item.status !== "accepted") return;
                  void openDirect(item.userId).then((roomId) => router.push(`/chat/${encodeURIComponent(roomId)}`));
                }}
                style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12 }}
              >
                <Avatar name={item.displayName} id={item.userId} size={44} />
                <View style={{ flex: 1, borderBottomWidth: 0.5, borderBottomColor: colors.separator, paddingVertical: 10 }}>
                  <Text style={{ color: colors.text, fontFamily: font("500"), fontSize: 16 }}>{item.displayName}</Text>
                  <Text style={{ color: item.status === "accepted" ? colors.avail : colors.text2, fontFamily: font("400"), fontSize: 13 }}>{sub}</Text>
                </View>
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

function displayLetter(name: string): string {
  const parts = name.trim().split(/\s+/);
  const word = parts[0] && ["أبو", "ابو", "عمي"].includes(parts[0]) && parts[1] ? parts[1] : parts[0];
  return [...(word ?? "?")][0] ?? "?";
}
