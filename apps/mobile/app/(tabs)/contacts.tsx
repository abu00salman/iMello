import { extractInviteToken, type Contact } from "@imello/core";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Share, View } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Input, Screen } from "../../src/ui";

export default function Contacts() {
  const { t } = usePrefs();
  const { api } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setContacts(await api.contacts()); } finally { setRefreshing(false); }
  }, [api]);
  useEffect(() => void load(), [load]);

  async function invite() {
    const inv = (await api.createContactInvite()) as { token: string; link?: string };
    await Share.share({ message: `${t("contacts.inviteHint")}\n${inv.link ?? inv.token}` });
  }

  async function redeem() {
    const token = extractInviteToken(code);
    if (!token) return setMessage(t("common.error"));
    try {
      const res = await api.redeemInvite(token);
      setCode("");
      setMessage(res.contact?.status === "pending_guardian" ? t("contacts.pendingGuardian") : t("contacts.added"));
      await load();
    } catch {
      setMessage(t("common.error"));
    }
  }

  return (
    <Screen>
      <Card>
        <Body muted>{t("contacts.inviteHint")}</Body>
        <Button title={t("contacts.invite")} onPress={() => void invite()} />
      </Card>
      <Card>
        <Input label={t("contacts.redeem")} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder={t("contacts.redeemPlaceholder")} />
        <Button variant="secondary" title={t("common.continue")} onPress={() => void redeem()} disabled={!extractInviteToken(code)} />
        {message && <Body>{message}</Body>}
      </Card>
      <FlatList
        data={contacts}
        keyExtractor={(c) => c.userId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
        ListEmptyComponent={<Body muted>{t("contacts.empty")}</Body>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10 }}>
            <Body>{item.displayName}</Body>
            {item.status === "pending_guardian" && <Body muted>{t("contacts.pendingGuardian")}</Body>}
          </View>
        )}
      />
    </Screen>
  );
}
