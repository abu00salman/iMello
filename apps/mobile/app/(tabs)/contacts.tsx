import { ApiError, extractInviteToken, normalizePin, type Contact, type ContactRequest } from "@imello/core";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Share, View } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Input, Title } from "../../src/ui";

export default function Contacts() {
  const { t, colors } = usePrefs();
  const { api, me } = useSession();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [incoming, setIncoming] = useState<ContactRequest[]>([]);
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c, r] = await Promise.all([api.contacts(), api.contactRequests()]);
      setContacts(c);
      setIncoming(r.incoming);
    } finally {
      setRefreshing(false);
    }
  }, [api]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function addByNumber() {
    const normalized = normalizePin(pin);
    if (!normalized || normalized === me?.pin) return setMessage(t("contacts.invalidNumber"));
    try {
      const res = await api.sendContactRequest(normalized);
      setPin("");
      setMessage(res.status === "already_contact" ? t("contacts.alreadyContact") : t("contacts.requestSent"));
    } catch (err) {
      setMessage(err instanceof ApiError && err.status === 429 ? t("auth.rateLimited") : t("common.error"));
    }
  }

  async function respond(r: ContactRequest, accept: boolean) {
    const res = await api.respondToContactRequest(r.requestId, accept);
    if (accept) setMessage(res.contactStatus === "pending_guardian" ? t("contacts.pendingGuardian") : t("contacts.added"));
    await load();
  }

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
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Card>
        <Title>{t("contacts.addByNumber")}</Title>
        <Input label="mell-123456" value={pin} onChangeText={setPin} autoCapitalize="none" autoCorrect={false} placeholder="mell-123456" />
        <Button title={t("contacts.add")} onPress={() => void addByNumber()} disabled={!pin.trim()} />
        {me?.pin && <Body muted>{`${t("me.yourNumber")}: ${me.pin}`}</Body>}
        {message && <Body>{message}</Body>}
      </Card>

      {incoming.length > 0 && (
        <Card>
          <Title>{t("contacts.requests")}</Title>
          {incoming.map((r) => (
            <View key={r.requestId} style={{ gap: 8, paddingVertical: 6 }}>
              <Body>{t("contacts.wantsToAdd", { name: r.displayName })}</Body>
              {r.pin && <Body muted>{r.pin}</Body>}
              <Button title={t("contacts.accept")} onPress={() => void respond(r, true)} />
              <Button variant="secondary" title={t("contacts.decline")} onPress={() => void respond(r, false)} />
            </View>
          ))}
        </Card>
      )}

      <Card>
        <Title>{t("contacts.title")}</Title>
        {contacts.length === 0 && <Body muted>{t("contacts.empty")}</Body>}
        {contacts.map((c) => (
          <View key={c.userId} style={{ paddingVertical: 6 }}>
            <Body>{c.displayName}</Body>
            {c.status === "pending_guardian" && <Body muted>{t("contacts.pendingGuardian")}</Body>}
          </View>
        ))}
      </Card>

      <Card>
        <Body muted>{t("contacts.inviteHint")}</Body>
        <Button variant="secondary" title={t("contacts.invite")} onPress={() => void invite()} />
        <Input label={t("contacts.redeem")} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder={t("contacts.redeemPlaceholder")} />
        <Button variant="secondary" title={t("common.continue")} onPress={() => void redeem()} disabled={!extractInviteToken(code)} />
      </Card>
    </ScrollView>
  );
}
