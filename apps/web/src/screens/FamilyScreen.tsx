import { ApiError, type ChildSummary, type Family, type GuardianApproval } from "@imello/core";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { usePrefs } from "../lib/prefs";
import { inviteUrl } from "../lib/router";
import { useSession } from "../lib/session";
import { Avatar, Button, Card, EmptyState, Field } from "../ui/components";

export function FamilyScreen() {
  const { t, locale } = usePrefs();
  const { api, me } = useSession();
  const [families, setFamilies] = useState<Family[]>([]);
  const [children, setChildren] = useState<ChildSummary[]>([]);
  const [approvals, setApprovals] = useState<GuardianApproval[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [child, setChild] = useState({ displayName: "", username: "", password: "" });
  const [familyLink, setFamilyLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdult = me?.kind === "adult";

  const load = useCallback(async () => {
    try {
      const [f, c, a] = await Promise.all([api.families(), isAdult ? api.children() : [], isAdult ? api.approvals() : []]);
      setFamilies(f);
      setChildren(c);
      setApprovals(a);
    } catch {
      setError(t("common.error"));
    }
  }, [api, isAdult, t]);
  useEffect(() => void load(), [load]);

  async function createFamily(e: FormEvent) {
    e.preventDefault();
    if (!familyName.trim()) return;
    await api.createFamily(familyName.trim());
    setFamilyName("");
    await load();
  }

  async function createChild(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api.createChild({ ...child, username: child.username.trim().toLowerCase(), locale });
      for (const f of families.filter((x) => x.role === "admin" || x.role === "guardian")) {
        await api.addChildToFamily(f.familyId, created.userId);
      }
      setChild({ displayName: "", username: "", password: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "username_unavailable" ? t("auth.usernameTaken") : err instanceof ApiError && err.code.startsWith("username_") ? t("auth.usernameHint") : err instanceof ApiError && err.code.startsWith("password_") ? t("auth.passwordHint") : t("common.error"));
    }
  }

  async function decide(a: GuardianApproval, decision: "approve" | "deny") {
    await api.decideApproval(a.approvalId, decision);
    await load();
  }

  async function inviteToFamily(f: Family) {
    const inv = (await api.createFamilyInvite(f.familyId)) as { token: string; link?: string };
    setFamilyLink(inviteUrl(inv.token));
  }

  if (!isAdult) {
    return (
      <div className="page">
        <header className="pane-header"><a className="back-link" href="#/settings" aria-label={t("common.back")}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" /></svg></a><h1>{t("family.title")}</h1></header>
        {families.map((f) => <FamilyCard key={f.familyId} f={f} />)}
        {families.length === 0 && <EmptyState icon="🏡">{t("family.title")}</EmptyState>}
      </div>
    );
  }

  return (
    <div className="page">
      <header className="pane-header"><a className="back-link" href="#/settings" aria-label={t("common.back")}><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" /></svg></a><h1>{t("family.title")}</h1></header>
      {error && <p className="error" role="alert">{error}</p>}

      <Card>
        <h2>{t("family.approvals")}</h2>
        {approvals.length === 0 ? (
          <p className="muted">{t("family.noApprovals")}</p>
        ) : (
          <ul className="contact-list" role="list">
            {approvals.map((a) => (
              <li key={a.approvalId} className="contact-row" data-testid="approval">
                <Avatar name={a.requesterDisplayName} id={a.requesterUserId} size={44} />
                <span className="contact-main">
                  <strong>{t("family.wantsToConnect", { requester: a.requesterDisplayName, child: a.childDisplayName })}</strong>
                  <small className="muted" dir="ltr">{a.requesterUserId}</small>
                </span>
                <Button onClick={() => void decide(a, "approve")}>{t("common.approve")}</Button>
                <Button variant="danger" onClick={() => void decide(a, "deny")}>{t("common.deny")}</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {families.map((f) => (
        <FamilyCard key={f.familyId} f={f}>
          {(f.role === "admin" || f.role === "guardian") && (
            <>
              <Button variant="secondary" onClick={() => void inviteToFamily(f)}>{t("contacts.invite")}</Button>
              {familyLink && <input readOnly value={familyLink} dir="ltr" onFocus={(e) => e.target.select()} aria-label="Family invite link" />}
            </>
          )}
        </FamilyCard>
      ))}

      {families.length === 0 && (
        <Card>
          <h2>{t("family.create")}</h2>
          <form onSubmit={createFamily} className="row">
            <Field label={t("family.name")} value={familyName} onChange={(e) => setFamilyName(e.target.value)} maxLength={64} />
            <Button type="submit">{t("family.create")}</Button>
          </form>
        </Card>
      )}

      <Card>
        <h2>{t("family.children")}</h2>
        {children.length > 0 && (
          <ul className="contact-list" role="list">
            {children.map((c) => (
              <li key={c.userId} className="contact-row">
                <Avatar name={c.displayName} id={c.userId} size={44} />
                <span className="contact-main"><strong>{c.displayName}</strong><small className="muted" dir="ltr">{c.username}</small></span>
              </li>
            ))}
          </ul>
        )}
        <h3>{t("family.addChild")}</h3>
        <p className="muted">{t("family.childAccountHint")}</p>
        <form onSubmit={createChild} className="stack">
          <Field label={t("auth.displayName")} value={child.displayName} onChange={(e) => setChild({ ...child, displayName: e.target.value })} required />
          <Field label={t("auth.username")} value={child.username} onChange={(e) => setChild({ ...child, username: e.target.value })} dir="ltr" autoCapitalize="none" hint={t("auth.usernameHint")} required />
          <Field label={t("auth.password")} type="password" value={child.password} onChange={(e) => setChild({ ...child, password: e.target.value })} dir="ltr" autoComplete="new-password" hint={t("auth.passwordHint")} required />
          <Button type="submit">{t("family.addChild")}</Button>
        </form>
      </Card>
    </div>
  );
}

function FamilyCard({ f, children }: { f: Family; children?: React.ReactNode }) {
  const { t } = usePrefs();
  return (
    <Card className="family-card">
      <h2>{f.name}</h2>
      <h3>{t("family.members")}</h3>
      <ul className="member-chips" role="list">
        {f.members.map((m) => (
          <li key={m.userId} className="chip">
            <Avatar name={m.displayName} id={m.userId} size={28} /> {m.displayName}
            <small className="muted">{t(`family.role.${m.role}`)}</small>
          </li>
        ))}
      </ul>
      {children}
    </Card>
  );
}
