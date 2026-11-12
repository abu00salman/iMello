import { NativeTabs } from "expo-router/native-tabs";
import { I18nManager } from "react-native";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";

export default function Tabs() {
  const { colors, font, t, rtl } = usePrefs();
  const { rooms } = useSession();
  const unread = rooms.reduce((sum, room) => sum + room.unread, 0);
  // UIKit mirrors the tab bar only when I18nManager is already RTL. Until the
  // reload applies, list Arabic with chats at the trailing edge so it matches.
  const mirror = rtl && !I18nManager.isRTL;
  const bar = {
    tintColor: colors.primary,
    iconColor: { default: colors.text3, selected: colors.primary },
    labelStyle: { fontFamily: font("500"), fontSize: 11 },
    backgroundColor: colors.dark ? "#0A0C0F" : "#F4F6F8",
    blurEffect: (colors.dark ? "systemChromeMaterialDark" : "systemChromeMaterial") as "systemChromeMaterialDark" | "systemChromeMaterial",
    badgeBackgroundColor: colors.unread,
    minimizeBehavior: "never" as const,
  };
  const chats = (
    <NativeTabs.Trigger name="chats">
      <NativeTabs.Trigger.Label>{t("chats")}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
      {unread > 0 ? <NativeTabs.Trigger.Badge>{String(Math.min(unread, 99))}</NativeTabs.Trigger.Badge> : null}
    </NativeTabs.Trigger>
  );
  const calls = (
    <NativeTabs.Trigger name="calls">
      <NativeTabs.Trigger.Label>{t("calls")}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="phone.fill" md="call" />
    </NativeTabs.Trigger>
  );
  const updates = (
    <NativeTabs.Trigger name="updates">
      <NativeTabs.Trigger.Label>{t("updates")}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="circle.dashed.inset.filled" md="donut_large" />
    </NativeTabs.Trigger>
  );
  const settings = (
    <NativeTabs.Trigger name="settings">
      <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
      <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
    </NativeTabs.Trigger>
  );
  return (
    <NativeTabs key={mirror ? "mirror" : "system"} {...bar}>
      {mirror ? settings : chats}
      {mirror ? updates : calls}
      {mirror ? calls : updates}
      {mirror ? chats : settings}
    </NativeTabs>
  );
}
