import { ApiError, MIN_PASSWORD_LENGTH, validateUsername, type Family, type GuardianApproval } from "@imello/core";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { FAMILY_MEMBER_LIMIT, FAMILY_MEMBER_WARN } from "../../src/rpc/format";
import { usePrefs } from "../../src/prefs/Prefs";
import { useSession } from "../../src/session/Session";
import { Avatar, Field, Header, PrimaryButton } from "../../src/ui/chrome";

export default function FamilyScreen() {
  const { colors, font, t, locale } = usePrefs();
  const { api, me } = useSession();
  const [families, setFamilies] = useState<Family[]>([]);
  const [approvals, setApprovals] = useState<GuardianApproval[]>([]);
  const [name, setName] = useState("");
  const [child, setChild] = useState({ displayName: "", username: "", password: "" });
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adult = me?.kind === "adult";

  const load = useCallback(async () => {
    const [f, a] = await Promise.all([api.families(), adult ? api.approvals() : Promise.resolve([])]);
    setFamilies(f);
    setApprovals(a);
  }, [api, adult]);
  useFocusEffect(useCallback(() => { void load().catch(() => setError(t("serverDown"))); }, [load, t]));

  const biggest = families.reduce((n, f) => Math.max(n, f.members.length), 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.grouped }}>
      <Header title={t("familyTitle")} subtitle={me?.displayName} avatar={{ name: me?.displayName || t("family"), id: me?.userId ?? "family" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {error ? <Text style={{ color: colors.statusFailed, fontFamily: font("500") }}>{error}</Text> : null}
        {biggest >= FAMILY_MEMBER_WARN ? (
          <Text style={{ color: colors.busy, fontFamily: font("500") }}>{biggest >= FAMILY_MEMBER_LIMIT ? t("familyFull") : t("familyNearFull")}</Text>
        ) : null}
        {families.map((family) => (
          <View key={family.familyId} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 14, gap: 8 }}>
            <Text style={{ fontFamily: font("700"), fontSize: 18, color: colors.text }}>{family.name}</Text>
            <Text style={{ color: colors.text2, fontFamily: font("400") }}>{t("memberCount", { n: family.members.length })}</Text>
            {family.members.map((member) => (
              <View key={member.userId} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Avatar name={member.displayName} id={member.userId} size={40} />
                <Text style={{ flex: 1, color: colors.text, fontFamily: font("500") }}>{member.displayName}</Text>
                <Text style={{ color: colors.text3, fontFamily: font("400"), fontSize: 13 }}>{roleLabel(member.role, t)}</Text>
              </View>
            ))}
            {adult && (family.role === "admin" || family.role === "guardian") && family.members.length < FAMILY_MEMBER_LIMIT ? (
              <Pressable
                onPress={() => void api.createFamilyInvite(family.familyId).then((inv) => {
                  const url = `https://imello.abu00salman.com/#/i/${inv.token}`;
                  setLink(url);
                  return Clipboard.setStringAsync(url);
                })}
              >
                <Text style={{ color: colors.primary, fontFamily: font("600") }}>{t("familyInvite")}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {link ? <Text style={{ color: colors.text2, fontFamily: font("400") }}>{link}</Text> : null}
        {families.length === 0 ? <Text style={{ color: colors.text2, fontFamily: font("400"), textAlign: "center" }}>{t("familyEmpty")}</Text> : null}
        {adult ? (
          <View style={{ gap: 10 }}>
            <Field value={name} onChangeText={setName} placeholder={t("familyName")} />
            <PrimaryButton label={t("createFamily")} onPress={() => { if (!name.trim()) return; void api.createFamily(name.trim()).then(() => { setName(""); return load(); }); }} />
            <Text style={{ fontFamily: font("600"), color: colors.text, marginTop: 8 }}>{t("addChild")}</Text>
            <Text style={{ color: colors.text2, fontFamily: font("400") }}>{t("childHint")}</Text>
            <Field value={child.displayName} onChangeText={(displayName) => setChild((c) => ({ ...c, displayName }))} placeholder={t("displayName")} />
            <Field value={child.username} onChangeText={(username) => setChild((c) => ({ ...c, username }))} placeholder={t("username")} ltr />
            <Field value={child.password} onChangeText={(password) => setChild((c) => ({ ...c, password }))} placeholder={t("password")} secure ltr />
            <PrimaryButton
              label={t("addChild")}
              onPress={() => {
                const username = child.username.trim().toLowerCase();
                if (validateUsername(username) || child.password.length < MIN_PASSWORD_LENGTH) return setError(t("tooShort"));
                if (biggest >= FAMILY_MEMBER_LIMIT) return setError(t("familyFull"));
                void api.createChild({ ...child, username, locale }).then(async (created) => {
                  for (const family of families.filter((f) => f.role === "admin" || f.role === "guardian")) {
                    if (family.members.length < FAMILY_MEMBER_LIMIT) await api.addChildToFamily(family.familyId, created.userId);
                  }
                  setChild({ displayName: "", username: "", password: "" });
                  await load();
                }).catch((err: unknown) => setError(err instanceof ApiError ? t("tooShort") : t("serverDown")));
              }}
            />
            <Text style={{ fontFamily: font("700"), color: colors.text }}>{t("approvals")}</Text>
            {approvals.length === 0 ? <Text style={{ color: colors.text2, fontFamily: font("400") }}>{t("noApprovals")}</Text> : null}
            {approvals.map((item) => (
              <View key={item.approvalId} style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 8 }}>
                <Text style={{ color: colors.text, fontFamily: font("500") }}>{t("wantsConnect", { requester: item.requesterDisplayName, child: item.childDisplayName })}</Text>
                <View style={{ flexDirection: "row", gap: 16 }}>
                  <Pressable onPress={() => void api.decideApproval(item.approvalId, "approve").then(load)}><Text style={{ color: colors.primary, fontFamily: font("700") }}>{t("approve")}</Text></Pressable>
                  <Pressable onPress={() => void api.decideApproval(item.approvalId, "deny").then(load)}><Text style={{ color: colors.statusFailed, fontFamily: font("700") }}>{t("deny")}</Text></Pressable>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function roleLabel(role: string, tr: (key: "roleAdmin" | "roleGuardian" | "roleMember" | "roleChild") => string): string {
  if (role === "admin") return tr("roleAdmin");
  if (role === "guardian") return tr("roleGuardian");
  if (role === "child") return tr("roleChild");
  return tr("roleMember");
}
