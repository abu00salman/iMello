import type { Family, GuardianApproval } from "@imello/core";
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { usePrefs } from "../../src/prefs";
import { useSession } from "../../src/session";
import { Body, Button, Card, Title } from "../../src/ui";

export default function FamilyTab() {
  const { t, colors } = usePrefs();
  const { api, me } = useSession();
  const [families, setFamilies] = useState<Family[]>([]);
  const [approvals, setApprovals] = useState<GuardianApproval[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const adult = me?.kind === "adult";

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setFamilies(await api.families());
      if (adult) setApprovals(await api.approvals());
    } finally {
      setRefreshing(false);
    }
  }, [api, adult]);
  useEffect(() => void load(), [load]);

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
      {adult && (
        <Card>
          <Title>{t("family.approvals")}</Title>
          {approvals.length === 0 && <Body muted>{t("family.noApprovals")}</Body>}
          {approvals.map((a) => (
            <View key={a.approvalId} style={{ gap: 8, paddingVertical: 8 }}>
              <Body>{t("family.wantsToConnect", { requester: a.requesterDisplayName, child: a.childDisplayName })}</Body>
              <Button title={t("common.approve")} onPress={() => void api.decideApproval(a.approvalId, "approve").then(load)} />
              <Button variant="danger" title={t("common.deny")} onPress={() => void api.decideApproval(a.approvalId, "deny").then(load)} />
            </View>
          ))}
        </Card>
      )}
      {families.map((f) => (
        <Card key={f.familyId}>
          <Title>🏡 {f.name}</Title>
          {f.members.map((m) => (
            <Body key={m.userId}>{m.displayName} · {t(`family.role.${m.role}`)}</Body>
          ))}
        </Card>
      ))}
      {adult && <Body muted>{t("family.childAccountHint")}</Body>}
    </ScrollView>
  );
}
