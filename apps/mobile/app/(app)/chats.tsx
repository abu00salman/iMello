import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { formatStamp, type Receipt } from "../../src/rpc/format";
import type { WireRoom } from "../../src/rpc/wire";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { Avatar, Field, Header, Icon, IconButton, PrimaryButton, ReceiptMark } from "../../src/ui/chrome";

function preview(room: WireRoom, tr: ReturnType<typeof usePrefs>["t"]): { text: string; tone: "text" | "typing" | "ping" | "failed" } {
  if (room.membership === "invite") return { text: tr("invitedYou", { name: room.name }), tone: "text" };
  if (room.typing.length) return { text: `${room.typing[0] ?? ""} ${tr("typingNow")}`, tone: "typing" };
  const last = room.last;
  if (!last) return { text: "", tone: "text" };
  if (last.failed) return { text: tr("notSent"), tone: "failed" };
  if (last.locked) return { text: tr("unableDecrypt"), tone: "failed" };
  if (last.ping) return { text: tr("pingWord"), tone: "ping" };
  if (last.voice) return { text: tr("voiceMessage"), tone: "text" };
  if (last.kind === "image") return { text: tr("photo"), tone: "text" };
  if (last.kind === "audio" || last.kind === "file" || last.kind === "video") return { text: last.body || tr("file"), tone: "text" };
  return { text: last.body ?? "", tone: "text" };
}

export default function Chats() {
  const prefs = usePrefs();
  const { colors, font, t, locale, status, setStatus } = prefs;
  const { rooms, me } = useSession();
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState(false);
  const [draft, setDraft] = useState(status.message);
  const [busy, setBusy] = useState(status.availability === "busy");
  const line = [busy || status.availability === "busy" ? t("busy") : t("available"), status.message].filter(Boolean).join(" · ");
  const shown = query.trim()
    ? rooms.filter((room) => room.name.toLowerCase().includes(query.trim().toLowerCase()) || (room.last?.body ?? "").toLowerCase().includes(query.trim().toLowerCase()))
    : rooms;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header
        title={me?.displayName || "iMello"}
        subtitle={line}
        avatar={{ name: me?.displayName || "iMello", id: me?.userId ?? "me" }}
        dot={status.availability === "busy" ? colors.busy : colors.avail}
        onPress={() => {
          setDraft(status.message);
          setBusy(status.availability === "busy");
          setEditor(true);
        }}
        trailing={
          <View style={{ flexDirection: "row" }}>
            <IconButton label={t("message")} onPress={() => router.push("/(app)/contacts")}>
              <Icon ios="square.and.pencil" android="edit" color="#fff" />
            </IconButton>
            <IconButton label={t("codeTitle")} onPress={() => router.push("/code")}>
              <Icon ios="qrcode" android="qr_code" color="#fff" />
            </IconButton>
          </View>
        }
      />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={t("searchChats")}
        placeholderTextColor={colors.text3}
        style={{ margin: 10, height: 40, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: 12, color: colors.text, fontFamily: font("400"), writingDirection: locale === "ar" ? "rtl" : "ltr" }}
      />
      <FlatList
        data={shown}
        keyExtractor={(item) => item.roomId}
        windowSize={8}
        initialNumToRender={12}
        removeClippedSubviews
        ListEmptyComponent={
          <Text style={{ color: colors.text2, fontFamily: font("400"), fontSize: 16, textAlign: "center", margin: 28 }}>{t("noChats")}</Text>
        }
        renderItem={({ item }) => {
          const row = preview(item, t);
          const unread = item.unread > 0;
          const mark: Receipt | null = item.last?.own ? item.last.receipt : null;
          const tone = row.tone === "failed" ? colors.statusFailed : row.tone === "ping" ? colors.pingBar : row.tone === "typing" ? colors.primary : unread ? colors.text : colors.text2;
          return (
            <Pressable
              onPress={() => router.push(`/chat/${encodeURIComponent(item.roomId)}`)}
              style={{ minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}
            >
              <Avatar name={item.name} id={item.otherUserId ?? item.roomId} />
              <View style={{ flex: 1, paddingVertical: 9 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: font(unread ? "700" : "500"), fontSize: 16 }}>{item.name}</Text>
                  <Text style={{ color: unread ? colors.primary : colors.text3, fontFamily: font(unread ? "600" : "400"), fontSize: 12 }}>{formatStamp(item.lastActivity, locale)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                  <ReceiptMark receipt={mark} colors={colors} />
                  <Text numberOfLines={1} style={{ flex: 1, color: tone, fontFamily: font(unread || row.tone === "ping" ? "600" : "400"), fontSize: 14 }}>{row.text}</Text>
                  {unread ? (
                    <View style={{ minWidth: 22, height: 22, borderRadius: 4, paddingHorizontal: 6, backgroundColor: colors.unread, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.unreadText, fontFamily: font("700"), fontSize: 12 }}>{item.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
      <Modal visible={editor} transparent animationType="fade" onRequestClose={() => setEditor(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(14,17,22,0.4)", justifyContent: "flex-end" }} onPress={() => setEditor(false)}>
          <Pressable style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, gap: 12 }} onPress={() => undefined}>
            <Text style={{ fontFamily: font("600"), fontSize: 18, color: colors.text }}>{t("available")}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <PrimaryButton label={t("available")} onPress={() => setBusy(false)} fill={busy ? colors.surface2 : colors.primaryFill} />
              <PrimaryButton label={t("busy")} onPress={() => setBusy(true)} fill={busy ? colors.busy : colors.surface2} />
            </View>
            <Field value={draft} onChangeText={setDraft} placeholder={t("statusPlaceholder")} />
            <PrimaryButton
              label={t("save")}
              onPress={() => {
                setStatus({ availability: busy ? "busy" : "available", message: draft.trim() });
                setEditor(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
