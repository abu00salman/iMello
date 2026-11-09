import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t as tr, type StringKey } from "../i18n/strings";
import { PING_SOUNDS, type PingSound } from "../media/ping-tones";
import { fontFor } from "../prefs/fonts";
import { displayInitial, colorIndex } from "../rpc/format";
import { AVATAR_COLORS, resolveColors } from "../theme/themes";
import { FIXTURE_PROFILE, FIXTURE_ROWS, FIXTURE_THREAD, type FixtureScreen } from "./fixture-data";

const TONE_KEY: Record<PingSound, StringKey> = {
  taps: "toneTaps",
  knock: "toneKnock",
  bell: "toneBell",
  chirp: "toneChirp",
  drum: "toneDrum",
};

/**
 * Offline Classic Blue screens for the simulator. Same information architecture
 * as the signed-in app, with the public demo cast and no network calls.
 */
export function FixtureView({ locale, screen }: { locale: "en" | "ar"; screen: FixtureScreen }) {
  const colors = resolveColors("classic-blue", "light", false);
  const rtl = locale === "ar";
  const font = (weight: "400" | "500" | "600" | "700" = "400") => fontFor(rtl, weight);
  const text = (key: StringKey) => tr(locale, key);
  const insets = useSafeAreaInsets();
  const write = rtl ? "rtl" : "ltr";
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, direction: write }} accessibilityLabel="preview-fixture">
      {screen === "chats" ? <ChatList locale={locale} /> : null}
      {screen === "chat" ? <Thread locale={locale} /> : null}
      {screen === "ping" ? <PingList locale={locale} /> : null}
      {screen === "signin" ? <SignInPreview locale={locale} /> : null}
      {screen === "chats" ? (
        <View style={{ flexDirection: "row", backgroundColor: colors.tabBg, paddingBottom: insets.bottom + 6, paddingTop: 8 }}>
          {(["chats", "settings"] as const).map((tab) => (
            <View key={tab} style={{ flex: 1, alignItems: "center", gap: 2 }}>
              <Text style={{ color: tab === "chats" ? "#fff" : colors.tabText, fontFamily: font("600"), fontSize: 12 }}>{text(tab)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ChatList({ locale }: { locale: "en" | "ar" }) {
  const colors = resolveColors("classic-blue", "light", false);
  const rtl = locale === "ar";
  const font = (weight: "400" | "500" | "600" | "700" = "400") => fontFor(rtl, weight);
  const text = (key: StringKey) => tr(locale, key);
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <View style={{ backgroundColor: colors.headerBg, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Letter name={FIXTURE_PROFILE[locale]} id="preview-me" size={48} rtl={rtl} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 18, writingDirection: rtl ? "rtl" : "ltr" }}>{FIXTURE_PROFILE[locale]}</Text>
          <Text style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 13 }}>{text("available")}</Text>
        </View>
      </View>
      <TextInput
        editable={false}
        placeholder={text("searchChats")}
        placeholderTextColor={colors.text3}
        style={{ margin: 10, height: 40, borderRadius: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.separator, paddingHorizontal: 12, color: colors.text, fontFamily: font("400"), writingDirection: rtl ? "rtl" : "ltr", textAlign: rtl ? "right" : "left" }}
      />
      <ScrollView>
        {FIXTURE_ROWS.map((row) => {
          const unread = (row.unread ?? 0) > 0;
          const tone = row.kind === "failed" || row.kind === "locked" ? colors.statusFailed : row.kind === "ping" ? colors.pingBar : row.kind === "typing" ? colors.primary : unread ? colors.text : colors.text2;
          const preview = row.kind === "locked" ? text("unableDecrypt") : row.kind === "failed" ? text("notSent") : row.kind === "ping" ? text("pingWord") : row.kind === "typing" ? text("typingNow") : row.preview[locale];
          return (
            <View key={row.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.separator }}>
              <Letter name={row.name[locale]} id={row.id} size={52} rtl={rtl} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.text, fontFamily: font(unread ? "700" : "500"), fontSize: 16, writingDirection: rtl ? "rtl" : "ltr" }}>{row.name[locale]}</Text>
                  <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 12 }}>{row.time[locale]}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {row.mark ? <Text style={{ color: row.mark === "R" ? colors.statusRead : colors.statusSent, fontFamily: font("700"), fontSize: 12 }}>{row.mark}</Text> : null}
                  <Text numberOfLines={1} style={{ flex: 1, color: tone, fontFamily: font(row.kind === "ping" ? "700" : "400"), fontSize: 14, writingDirection: rtl ? "rtl" : "ltr" }}>{preview}</Text>
                  {unread ? (
                    <View style={{ minWidth: 22, height: 22, borderRadius: 4, backgroundColor: colors.unread, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
                      <Text style={{ color: "#fff", fontFamily: font("700"), fontSize: 12 }}>{row.unread}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Thread({ locale }: { locale: "en" | "ar" }) {
  const colors = resolveColors("classic-blue", "light", false);
  const rtl = locale === "ar";
  const font = (weight: "400" | "500" | "600" | "700" = "400") => fontFor(rtl, weight);
  const text = (key: StringKey, vars?: Record<string, string | number>) => tr(locale, key, vars);
  const insets = useSafeAreaInsets();
  const name = locale === "ar" ? "سارة" : "Sara";
  return (
    <View style={{ flex: 1, backgroundColor: colors.wallpaper }}>
      <View style={{ backgroundColor: colors.headerBg, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 22 }}>‹</Text>
        <Letter name={name} id="sara" size={40} rtl={rtl} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 18, writingDirection: rtl ? "rtl" : "ltr" }}>{name}</Text>
          <Text style={{ color: colors.headerSub, fontFamily: font("400"), fontSize: 12 }}>{text("encrypted")}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 10 }}>
        {FIXTURE_THREAD.map((msg) => {
          const tailOnLeft = rtl ? msg.own : !msg.own;
          const bg = msg.ping ? colors.pingBg : colors.cardBg;
          const body = msg.locked ? `${text("unableDecrypt")} ${text("restoreHint")}` : msg.ping ? text("pingWord") : msg.body?.[locale];
          return (
            <View
              key={msg.id}
              accessibilityLabel={msg.locked ? "restore-hint" : undefined}
              style={{
                alignSelf: msg.own ? "flex-end" : "flex-start",
                maxWidth: "82%",
                minWidth: 140,
                backgroundColor: bg,
                borderRadius: 6,
                borderTopLeftRadius: tailOnLeft ? 0 : 6,
                borderTopRightRadius: tailOnLeft ? 6 : 0,
                borderBottomWidth: 3,
                borderBottomColor: msg.ping ? colors.pingBar : msg.own ? colors.barOwn : AVATAR_COLORS[colorIndex("sara")],
                paddingHorizontal: 12,
                paddingTop: 8,
                paddingBottom: 6,
              }}
            >
              <Text style={{ color: msg.ping ? colors.pingText : msg.locked ? colors.text2 : colors.cardText, fontFamily: font(msg.locked ? "500" : "400"), fontSize: msg.ping ? 20 : 16, lineHeight: rtl ? 26 : 22, writingDirection: rtl ? "rtl" : "ltr" }}>{body}</Text>
              {msg.ping ? <Text style={{ color: colors.pingText, fontFamily: font("400"), fontSize: 13, writingDirection: rtl ? "rtl" : "ltr" }}>{text("pingFrom", { name })}</Text> : null}
              <Text style={{ color: colors.cardMeta, fontFamily: font("400"), fontSize: 11, textAlign: "right", marginTop: 4 }}>{msg.time[locale]}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ backgroundColor: colors.surface, borderTopWidth: 0.5, borderTopColor: colors.separator, paddingBottom: insets.bottom }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 8 }}>
          <TextInput
            editable={false}
            placeholder={text("writeMessage")}
            placeholderTextColor={colors.text3}
            style={{ flex: 1, height: 42, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, backgroundColor: colors.bg, paddingHorizontal: 12, fontFamily: font("400"), writingDirection: rtl ? "rtl" : "ltr", textAlign: rtl ? "right" : "left" }}
          />
        </View>
        <View style={{ flexDirection: "row", backgroundColor: colors.tabBg, paddingBottom: 10, paddingTop: 8 }}>
          {(["camera", "voice", "attach", "ping"] as const).map((key) => (
            <View key={key} style={{ flex: 1, alignItems: "center" }}>
              <Text style={{ color: key === "ping" ? colors.pingBar : colors.tabText, fontFamily: font("600"), fontSize: 13 }}>{text(key)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function PingList({ locale }: { locale: "en" | "ar" }) {
  const colors = resolveColors("classic-blue", "light", false);
  const rtl = locale === "ar";
  const font = (weight: "400" | "500" | "600" | "700" = "400") => fontFor(rtl, weight);
  const text = (key: StringKey) => tr(locale, key);
  const insets = useSafeAreaInsets();
  const [tone, setTone] = useState<PingSound>("taps");
  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <View style={{ backgroundColor: colors.headerBg, paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16 }}>
        <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 18, writingDirection: rtl ? "rtl" : "ltr" }}>{text("settings")}</Text>
      </View>
      <View style={{ margin: 16, backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
        <Text style={{ color: colors.text, fontFamily: font("600"), fontSize: 16, paddingVertical: 8, writingDirection: rtl ? "rtl" : "ltr" }}>{text("pingTone")}</Text>
        {PING_SOUNDS.map((item) => (
          <View key={item} style={{ minHeight: 48, flexDirection: "row", alignItems: "center" }}>
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: tone === item }} onPress={() => setTone(item)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                {tone === item ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary }} /> : null}
              </View>
              <Text style={{ color: colors.text, fontFamily: font("500"), fontSize: 16 }}>{text(TONE_KEY[item])}</Text>
            </Pressable>
            <Text style={{ color: colors.primary, fontFamily: font("600") }}>{text("listen")}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SignInPreview({ locale }: { locale: "en" | "ar" }) {
  const colors = resolveColors("classic-blue", "light", false);
  const rtl = locale === "ar";
  const font = (weight: "400" | "500" | "600" | "700" = "400") => fontFor(rtl, weight);
  const text = (key: StringKey) => tr(locale, key);
  const field = (placeholder: string) => (
    <TextInput
      editable={false}
      placeholder={placeholder}
      placeholderTextColor={colors.text3}
      style={{ height: 48, borderRadius: 6, borderWidth: 1, borderColor: colors.separatorStrong, paddingHorizontal: 12, fontFamily: font("400"), fontSize: 16, writingDirection: "ltr", textAlign: "left" }}
    />
  );
  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 14 }}>
      <Text style={{ alignSelf: "flex-end", color: colors.primary, fontFamily: font("600") }}>{locale === "ar" ? text("english") : text("arabic")}</Text>
      <View style={{ alignItems: "center", gap: 6 }}>
        <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: colors.primaryFill, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 10, height: 28, borderRadius: 5, backgroundColor: "#fff" }} />
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: "#F2B640", marginTop: 4 }} />
        </View>
        <Text style={{ fontFamily: font("700"), fontSize: 32, color: colors.text }}>iMello</Text>
        <Text style={{ fontFamily: font("400"), fontSize: 16, color: colors.text2, textAlign: "center" }}>{text("tagline")}</Text>
      </View>
      {field(text("codeTitle"))}
      {field(text("password"))}
      <View style={{ backgroundColor: colors.primaryFill, borderRadius: 6, paddingVertical: 14, alignItems: "center" }}>
        <Text style={{ color: "#fff", fontFamily: font("600"), fontSize: 16 }}>{text("signIn")}</Text>
      </View>
      <Text style={{ color: colors.text2, fontFamily: font("500"), textAlign: "center" }}>{text("stageConnect")}</Text>
    </View>
  );
}

function Letter({ name, id, size, rtl }: { name: string; id: string; size: number; rtl: boolean }) {
  const color = AVATAR_COLORS[colorIndex(id)] ?? AVATAR_COLORS[0];
  return (
    <View style={{ width: size, height: size, borderRadius: 6, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontFamily: fontFor(rtl, "600"), fontSize: size * 0.38 }}>{displayInitial(name)}</Text>
    </View>
  );
}
