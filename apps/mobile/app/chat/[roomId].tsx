import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { getDocumentAsync } from "expo-document-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { File, Paths } from "expo-file-system";
import { createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, useAudioRecorder } from "expo-audio";
import { EncodingType, readAsStringAsync, writeAsStringAsync } from "expo-file-system/legacy";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colorIndex, formatClock, pingRemaining } from "../../src/rpc/format";
import type { WireMessage } from "../../src/rpc/wire";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { AVATAR_COLORS } from "../../src/theme/themes";
import { Header, Icon, IconButton, ReceiptMark, cardShadow } from "../../src/ui/chrome";

const EMOJI = ["😀", "😁", "😂", "😊", "😍", "😘", "😎", "😢", "😭", "😡", "🤔", "👍", "🙏", "👏", "❤️", "🔥", "✨", "🎉", "🌹", "☕", "🌙", "⭐", "👋", "😴"];

export default function Chat() {
  const { roomId: raw } = useLocalSearchParams<{ roomId: string }>();
  const roomId = decodeURIComponent(raw ?? "");
  const { colors, font, t, locale, rtl } = usePrefs();
  const session = useSession();
  const room = session.rooms.find((item) => item.roomId === roomId);
  const messages = session.messagesFor(roomId);
  const typing = session.typingFor(roomId);
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [reduce, setReduce] = useState(false);
  const [opened, setOpened] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<WireMessage>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const insets = useSafeAreaInsets();
  const typedAt = useRef(0);
  const shakeX = useSharedValue(0);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    sessionRef.current.watch(roomId);
    void sessionRef.current.markRead(roomId).catch(() => undefined);
    return () => sessionRef.current.watch(null);
  }, [roomId]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
  }, []);

  useEffect(() => {
    if (session.shakeRoom !== roomId) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const heavy = setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 180);
    if (!reduce) {
      shakeX.value = withSequence(
        withTiming(-6, { duration: 70, easing: Easing.bezier(0.3, 0, 0.2, 1) }),
        withTiming(6, { duration: 70 }),
        withTiming(-4, { duration: 70 }),
        withTiming(4, { duration: 70 }),
        withTiming(-2, { duration: 70 }),
        withTiming(0, { duration: 70 }),
      );
    }
    return () => clearTimeout(heavy);
  }, [session.shakeToken, session.shakeRoom, roomId, reduce, shakeX]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const wait = pingRemaining(retryAt ? retryAt - 15_000 : undefined, now);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const bar = useMemo(() => AVATAR_COLORS[colorIndex(room?.otherUserId ?? roomId)] ?? colors.primary, [room?.otherUserId, roomId, colors.primary]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    setEmoji(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await session.sendText(roomId, body);
    } catch {
      setError(t("notSent"));
      setText(body);
    }
  }

  function onChange(value: string) {
    setText(value);
    const time = Date.now();
    if (value && time - typedAt.current > 3000) {
      typedAt.current = time;
      void session.setTyping(roomId, true).catch(() => undefined);
    }
    if (!value) void session.setTyping(roomId, false).catch(() => undefined);
  }

  async function ping() {
    if (wait > 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await session.sendPing(roomId);
    setRetryAt(res.retryAt);
  }

  async function openAttachment(msg: WireMessage) {
    const file = await session.downloadFile(roomId, msg.id);
    if (file.mimetype.startsWith("image/")) {
      setOpened((prev) => ({ ...prev, [msg.id]: `data:${file.mimetype};base64,${file.base64}` }));
      return;
    }
    const safe = msg.id.replace(/[^\w.-]/g, "_");
    const path = new File(Paths.cache, safe).uri;
    await writeAsStringAsync(path, file.base64, { encoding: EncodingType.Base64 });
    if (file.mimetype.startsWith("audio/")) {
      const player = createAudioPlayer(path);
      player.play();
      return;
    }
    setOpened((prev) => ({ ...prev, [msg.id]: file.name }));
  }

  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.base64) return;
    await session.sendFile(roomId, { name: asset.fileName || "photo.jpg", mimetype: asset.mimeType || "image/jpeg", base64: asset.base64 });
  }

  async function pickFile() {
    const result = await getDocumentAsync({ copyToCacheDirectory: true, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const base64 = asset.base64 ?? (asset.uri ? await readAsStringAsync(asset.uri, { encoding: EncodingType.Base64 }) : "");
    if (!base64) return;
    await session.sendFile(roomId, { name: asset.name, mimetype: asset.mimeType || "application/octet-stream", base64 });
  }

  async function toggleRecord() {
    if (!recording) {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setError(t("voice"));
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    await recorder.stop();
    setRecording(false);
    if (!recorder.uri) return;
    const base64 = await readAsStringAsync(recorder.uri, { encoding: EncodingType.Base64 });
    await session.sendFile(roomId, { name: "voice.m4a", mimetype: "audio/mp4", base64, voice: true });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.wallpaper }}>
      <Header
        title={room?.name || t("chats")}
        subtitle={typing.length ? `${typing[0]} ${t("typing")}` : t("encrypted")}
        leading={
          <IconButton label={t("cancel")} onPress={() => router.back()}>
            <Icon ios="chevron.backward" android="arrow_back" color="#fff" size={26} mirror />
          </IconButton>
        }
      />
      {room?.membership === "invite" ? (
        <Pressable onPress={() => void session.acceptInvite(roomId)} style={{ backgroundColor: colors.primaryFill, margin: 12, borderRadius: 6, padding: 12 }}>
          <Text style={{ color: "#fff", textAlign: "center", fontFamily: font("600") }}>{t("acceptChat")}</Text>
        </Pressable>
      ) : null}
      <Animated.View style={[{ flex: 1 }, shakeStyle]}>
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(item) => item.id}
          windowSize={9}
          initialNumToRender={20}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={<Text style={{ textAlign: "center", color: colors.text3, fontFamily: font("400") }}>{t("emptyChat")}</Text>}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              rtl={rtl}
              locale={locale}
              bar={item.isOwn ? colors.barOwn : bar}
              onRetry={() => void session.retry(roomId, item.id)}
              preview={opened[item.id]}
              onOpen={() => void openAttachment(item).catch(() => setError(t("notSent")))}
            />
          )}
        />
        {typing.length ? <Text style={{ color: colors.text2, fontFamily: font("400"), paddingHorizontal: 16, paddingBottom: 6 }}>{typing.join(" · ")} {t("typing")}</Text> : null}
      </Animated.View>
      {error ? <Text style={{ color: colors.statusFailed, fontFamily: font("500"), paddingHorizontal: 12 }}>{error}</Text> : null}
      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        <View style={{ backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.separator, paddingBottom: insets.bottom }}>
          {recording ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 }}>
              <Text style={{ color: colors.busy, fontFamily: font("600") }}>{t("recording")}</Text>
              <Pressable onPress={() => { setRecording(false); void recorder.stop(); }}><Text style={{ color: colors.text2, fontFamily: font("600") }}>{t("discard")}</Text></Pressable>
              <Pressable onPress={() => void toggleRecord()}><Text style={{ color: colors.primary, fontFamily: font("700") }}>{t("send")}</Text></Pressable>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, padding: 8 }}>
              <IconButton label={t("emoji")} onPress={() => setEmoji((v) => !v)}>
                <Icon ios="face.smiling" android="mood" color={colors.primary} />
              </IconButton>
              <TextInput
                value={text}
                onChangeText={onChange}
                placeholder={t("writeMessage")}
                placeholderTextColor={colors.text3}
                style={{ flex: 1, height: 42, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, backgroundColor: colors.bg, paddingHorizontal: 12, color: colors.text, fontFamily: font("400"), fontSize: 16 }}
              />
              {text.trim() ? (
                <IconButton label={t("send")} onPress={() => void send()}>
                  <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: colors.primaryFill, alignItems: "center", justifyContent: "center" }}>
                    <Icon ios="paperplane.fill" android="send" color="#fff" mirror />
                  </View>
                </IconButton>
              ) : (
                <IconButton label={t("voice")} onPress={() => void toggleRecord()}>
                  <Icon ios="mic.fill" android="mic" color={colors.primary} />
                </IconButton>
              )}
            </View>
          )}
          {emoji ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", backgroundColor: colors.emojiBg, padding: 8 }}>
              {EMOJI.map((item) => (
                <Pressable key={item} onPress={() => setText((v) => v + item)} style={{ width: "12.5%", height: 44, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 26 }}>{item}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={{ flexDirection: "row", backgroundColor: colors.tabBg, paddingBottom: 8 }}>
              <Action label={t("camera")} onPress={() => void pickImage()} icon={<Icon ios="camera.fill" android="photo_camera" color={colors.tabText} />} />
              <Action label={t("voice")} onPress={() => void toggleRecord()} icon={<Icon ios="mic.fill" android="mic" color={colors.tabText} />} />
              <Action label={t("attach")} onPress={() => void pickFile()} icon={<Icon ios="paperclip" android="attach_file" color={colors.tabText} />} />
              <Action label={t("ping")} onPress={() => void ping()} icon={<Icon ios="wave.3.right" android="vibration" color={wait > 0 ? colors.tabText : colors.pingBar} />} hint={wait > 0 ? String(Math.ceil(wait / 1000)) : undefined} />
            </View>
          )}
        </View>
      </KeyboardStickyView>
    </View>
  );
}

function Action({ label, onPress, icon, hint }: { label: string; onPress: () => void; icon: ReactNode; hint?: string }) {
  const { font } = usePrefs();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 2 }}>
      {icon}
      <Text style={{ color: "#fff", fontFamily: font("500"), fontSize: 11 }}>{hint ?? label}</Text>
    </Pressable>
  );
}

function Bubble({
  msg,
  rtl,
  locale,
  bar,
  onRetry,
  onOpen,
  preview,
}: {
  msg: WireMessage;
  rtl: boolean;
  locale: "en" | "ar";
  bar: string;
  onRetry: () => void;
  onOpen: () => void;
  preview?: string;
}) {
  const { colors, font, t } = usePrefs();
  const tailOnLeft = rtl ? msg.isOwn : !msg.isOwn;
  const bg = msg.ping ? colors.pingBg : colors.cardBg;
  const text = msg.ping ? colors.pingText : colors.cardText;
  return (
    <Pressable
      onPress={msg.receipt === "failed" ? onRetry : msg.decryptionFailed ? () => router.push("/backup") : msg.attachment ? onOpen : undefined}
      style={{
        alignSelf: msg.isOwn ? "flex-end" : "flex-start",
        maxWidth: "82%",
        minWidth: 120,
        backgroundColor: bg,
        borderRadius: 6,
        borderTopLeftRadius: tailOnLeft ? 0 : 6,
        borderTopRightRadius: tailOnLeft ? 6 : 0,
        borderBottomWidth: 3,
        borderBottomColor: msg.ping ? colors.pingBar : bar,
        paddingHorizontal: 12,
        paddingTop: 8,
        paddingBottom: 6,
        ...cardShadow(colors),
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 0,
          [tailOnLeft ? "left" : "right"]: -9,
          width: 0,
          height: 0,
          borderTopWidth: 9,
          borderTopColor: bg,
          ...(tailOnLeft
            ? { borderLeftWidth: 9, borderLeftColor: "transparent" }
            : { borderRightWidth: 9, borderRightColor: "transparent" }),
        }}
      />
      {msg.ping ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: colors.pingBar, alignItems: "center", justifyContent: "center" }}>
            <Icon ios="wave.3.right" android="vibration" color={colors.pingIcon} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: text, fontFamily: font("700"), fontSize: 20 }}>{t("pingWord")}</Text>
            <Text style={{ color: text, fontFamily: font("400"), fontSize: 13 }}>{msg.isOwn ? t("you") : t("pingFrom", { name: msg.senderName })}</Text>
          </View>
        </View>
      ) : msg.decryptionFailed ? (
        <Text style={{ color: colors.text2, fontFamily: font("500"), fontSize: 15, lineHeight: locale === "ar" ? 24 : 20 }}>
          {t("unableDecrypt")} {t("restoreHint")}
        </Text>
      ) : (
        <>
          {preview?.startsWith("data:image") ? <Image source={{ uri: preview }} style={{ width: 220, height: 160, borderRadius: 4, marginBottom: 6 }} /> : null}
          <Text style={{ color: text, fontFamily: font("400"), fontSize: 16, lineHeight: locale === "ar" ? 26 : 22, writingDirection: locale === "ar" ? "rtl" : "ltr" }}>
            {msg.attachment ? (msg.attachment.voice ? t("voiceMessage") : msg.attachment.kind === "image" ? t("photo") : preview && !preview.startsWith("data:") ? preview : msg.attachment.name) : msg.body}
          </Text>
        </>
      )}
      <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6, marginTop: 4 }}>
        <Text style={{ color: msg.ping ? colors.pingText : colors.cardMeta, fontFamily: font("400"), fontSize: 11 }}>{formatClock(msg.timestamp, locale)}</Text>
        <ReceiptMark receipt={msg.receipt} colors={colors} />
      </View>
    </Pressable>
  );
}
