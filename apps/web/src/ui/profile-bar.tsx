import { useState, type ReactNode } from "react";
import { usePrefs } from "../lib/prefs";
import { useProfile, type Availability } from "../lib/profile";
import { Avatar } from "./components";

export function ProfileBar({ name, userId, trailing }: { name: string; userId: string; trailing?: ReactNode }) {
  const { t } = usePrefs();
  const profile = useProfile();
  const [open, setOpen] = useState(false);
  const busy = profile.availability === "busy";
  return (
    <header className="profile-bar">
      <Avatar name={name} id={userId} size={46} />
      <div className="bar-titles">
        <strong className="bar-title" dir="auto">{name}</strong>
        <button type="button" className="bar-status" onClick={() => setOpen(true)} aria-label={t("profile.editStatus")}>
          <span className={`av-dot ${busy ? "busy" : ""}`} aria-hidden="true" />
          <span>{t(busy ? "profile.busy" : "profile.available")}</span>
          {profile.message && (
            <>
              <span aria-hidden="true">·</span>
              <span className="pm" dir="auto">{profile.message}</span>
            </>
          )}
        </button>
      </div>
      {trailing}
      {open && (
        <div className="status-sheet" role="presentation" onClick={() => setOpen(false)}>
          <form
            className="status-card"
            role="dialog"
            aria-label={t("profile.editStatus")}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              setOpen(false);
            }}
          >
            <div className="segmented" role="radiogroup" aria-label={t("profile.editStatus")}>
              {(["available", "busy"] as Availability[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={profile.availability === v} onClick={() => profile.setAvailability(v)}>
                  {t(v === "busy" ? "profile.busy" : "profile.available")}
                </button>
              ))}
            </div>
            <label className="field">
              <span>{t("profile.message")}</span>
              <input
                value={profile.message}
                maxLength={60}
                dir="auto"
                onChange={(e) => profile.setMessage(e.target.value)}
              />
            </label>
            <p className="k-foot">{t("profile.savedHere")}</p>
            <button type="submit" className="btn btn-primary">{t("common.save")}</button>
          </form>
        </div>
      )}
    </header>
  );
}
