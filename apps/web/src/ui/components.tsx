import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export function Logo({ size = 40 }: { size?: number }) {
  return <img src={`${import.meta.env.BASE_URL}icon.svg`} width={size} height={size} alt="" className="logo" />;
}

const AVATAR_VARS = ["var(--im-avatar-1)", "var(--im-avatar-2)", "var(--im-avatar-3)", "var(--im-avatar-4)", "var(--im-avatar-5)", "var(--im-avatar-6)"];

/** Stable colour for a person, shared by their avatar and their message bar. */
export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_VARS[h % AVATAR_VARS.length]!;
}

function initialsOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  if (/[\u0600-\u06FF]/.test(trimmed)) {
    const rest = trimmed.replace(/^(?:عمي|أبو|ابو|أم|أمي|امي|أخي|أختي|اختي)\s+/, "");
    return [...(rest || trimmed)][0] ?? "?";
  }
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[1]?.[0] ?? "") : "");
  return letters.toUpperCase() || "?";
}

export function Ltr({ children }: { children: ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}

export function Avatar({ name, id, size = 40 }: { name: string; id: string; size?: number }) {
  const color = avatarColor(id);
  const initials = initialsOf(name);
  return (
    <span
      className="avatar"
      aria-hidden="true"
      ref={(el) => {
        if (el) {
          el.style.setProperty("--avatar-bg", color);
          el.style.setProperty("--avatar-size", `${size}px`);
        }
      }}
    >
      {initials}
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; busy?: boolean };

export function Button({ variant = "primary", busy, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button className={`btn btn-${variant} ${className ?? ""}`} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {children}
    </button>
  );
}

export function Field({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hint ? `${id}-hint` : undefined} aria-invalid={error ? true : undefined} {...rest} />
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && <small className="error" role="alert">{error}</small>}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className ?? ""}`}>{children}</section>;
}

export function EmptyState({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden="true">{icon}</div>}
      <p>{children}</p>
    </div>
  );
}

export function LockBadge({ label }: { label: string }) {
  return (
    <span className="lock-badge" title={label}>
      <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" />
      </svg>
      {label}
    </span>
  );
}
