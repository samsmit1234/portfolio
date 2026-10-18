"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { locale, t } from "@/lib/i18n";
import { friendlyError } from "@/lib/errors";
import type { Lang, StaffRole } from "@/lib/types";
import { QrModal } from "@/components/QrModal";
import styles from "../dashboard.module.css";

type Member = { user_id: string; email: string; role: StaffRole; created_at: string };
type Invite = { id: string; expires_at: string };

/** Owner-only: the team, one-time invitation links, removing staff. */
export function TeamSection({ lang, myUserId, siteUrl }: { lang: Lang; myUserId: string; siteUrl: string }) {
  const d = t(lang);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = getBrowserSupabase();
    const [team, inv] = await Promise.all([
      supabase.rpc("restaurant_team"),
      supabase
        .from("restaurant_invitations")
        .select("id, expires_at")
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);
    if (team.error) setError(friendlyError(team.error, d));
    else setMembers(team.data as Member[]);
    if (!inv.error) setInvites(inv.data as Invite[]);
  }, [d]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- network fetch; state is set after it resolves
    void load();
  }, [load]);

  const invite = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await getBrowserSupabase().rpc("create_staff_invitation");
    setBusy(false);
    if (error || typeof data !== "string") return setError(friendlyError(error, d));
    setCopied(false);
    setLink(`${siteUrl || window.location.origin}/join/${data}`);
    void load();
  };

  const remove = async (userId: string) => {
    const { error } = await getBrowserSupabase().rpc("remove_staff_member", { p_user_id: userId });
    if (error) setError(friendlyError(error, d));
    void load();
  };

  const revoke = async (id: string) => {
    const { error } = await getBrowserSupabase().from("restaurant_invitations").delete().eq("id", id);
    if (error) setError(friendlyError(error, d));
    void load();
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const date = (iso: string) =>
    new Date(iso).toLocaleString(locale(lang), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <section className={styles.settings}>
      <div className={`card ${styles.settingsCard}`}>
        <h2>{d.team}</h2>
        <p className="muted">{d.teamHint}</p>
        <ul className={styles.teamList}>
          {members.map((m) => (
            <li key={m.user_id} className={styles.teamRow}>
              <span className={styles.teamEmail} dir="ltr">{m.email}</span>
              <span className={styles.roleChip} data-role={m.role}>
                {m.role === "owner" ? d.roleOwner : d.roleStaff}
              </span>
              {m.role === "staff" && m.user_id !== myUserId && (
                <button type="button" className="btn btn-ghost" onClick={() => remove(m.user_id)}>
                  {d.removeMember}
                </button>
              )}
            </li>
          ))}
        </ul>
        {invites.length > 0 && (
          <div className={styles.invites}>
            <p className="eyebrow">{d.pendingInvites}</p>
            {invites.map((i) => (
              <div key={i.id} className={styles.teamRow}>
                <span className="muted">
                  {d.expiresAt} {date(i.expires_at)}
                </span>
                <button type="button" className="btn btn-ghost" onClick={() => revoke(i.id)}>
                  {d.revoke}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <button type="button" className="btn btn-primary btn-lg" onClick={invite} disabled={busy}>
          + {d.inviteStaff}
        </button>
      </div>
      {link && (
        <QrModal
          url={link}
          title={d.inviteTitle}
          subtitle={d.inviteHint}
          onClose={() => setLink(null)}
          closeLabel={d.close}
          printLabel={copied ? d.copied : d.copyLink}
          onPrimaryAction={copy}
        />
      )}
    </section>
  );
}
