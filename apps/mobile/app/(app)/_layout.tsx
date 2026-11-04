import { NativeTabs } from "expo-router/native-tabs";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";

export default function Tabs() {
  const { colors, font, t } = usePrefs();
  const { rooms } = useSession();
  const unread = rooms.reduce((sum, room) => sum + room.unread, 0);
  return (
    <NativeTabs
      tintColor={colors.primary}
      iconColor={{ default: colors.text3, selected: colors.primary }}
      labelStyle={{ fontFamily: font("500"), fontSize: 11 }}
      backgroundColor={colors.dark ? "#0A0C0F" : "#F4F6F8"}
      blurEffect={colors.dark ? "systemChromeMaterialDark" : "systemChromeMaterial"}
      badgeBackgroundColor={colors.unread}
      minimizeBehavior="never"
    >
      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>{t("chats")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
        {unread > 0 ? <NativeTabs.Trigger.Badge>{String(Math.min(unread, 99))}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="contacts">
        <NativeTabs.Trigger.Label>{t("contacts")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="family">
        <NativeTabs.Trigger.Label>{t("family")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
