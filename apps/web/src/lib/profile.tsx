import { useEffect, useState } from "react";

/** Local-only presence. It is not synced: that would need an account-data change. */
export type Availability = "available" | "busy";

const AVAIL_KEY = "imello.profile.availability";
const MESSAGE_KEY = "imello.profile.message";

export function loadAvailability(): Availability {
  try {
    return localStorage.getItem(AVAIL_KEY) === "busy" ? "busy" : "available";
  } catch {
    return "available";
  }
}

export function loadPersonalMessage(): string {
  try {
    return (localStorage.getItem(MESSAGE_KEY) ?? "").slice(0, 60);
  } catch {
    return "";
  }
}

export function useProfile() {
  const [availability, setAvailabilityState] = useState<Availability>(loadAvailability);
  const [message, setMessageState] = useState(loadPersonalMessage);

  useEffect(() => {
    const onStorage = () => {
      setAvailabilityState(loadAvailability());
      setMessageState(loadPersonalMessage());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return {
    availability,
    message,
    setAvailability: (v: Availability) => {
      try { localStorage.setItem(AVAIL_KEY, v); } catch { /* ignore */ }
      setAvailabilityState(v);
    },
    setMessage: (v: string) => {
      const next = v.slice(0, 60);
      try { localStorage.setItem(MESSAGE_KEY, next); } catch { /* ignore */ }
      setMessageState(next);
    },
  };
}
