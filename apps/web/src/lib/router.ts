import { useEffect, useState } from "react";

/**
 * Minimal hash router. Hash routes work on any static host and keep invite
 * tokens out of server access logs (fragments are never sent to the server).
 */
export type Route =
  | { name: "chats"; roomId?: string }
  | { name: "contacts" }
  | { name: "family" }
  | { name: "calls" }
  | { name: "settings" }
  | { name: "invite"; token: string }
  | { name: "preview"; screen: "list" | "chat" | "appearance" | "contacts" };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  switch (parts[0]) {
    case "chats":
      return parts[1] ? { name: "chats", roomId: parts[1] } : { name: "chats" };
    case "contacts":
    case "family":
    case "calls":
    case "settings":
      return { name: parts[0] };
    case "i":
      return parts[1] ? { name: "invite", token: parts[1] } : { name: "contacts" };
    case "preview":
      return { name: "preview", screen: parts[1] === "chat" || parts[1] === "appearance" || parts[1] === "contacts" ? parts[1] : "list" };
    default:
      return { name: "chats" };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "chats":
      return route.roomId ? `#/chats/${encodeURIComponent(route.roomId)}` : "#/chats";
    case "invite":
      return `#/i/${route.token}`;
    case "preview":
      return route.screen === "list" ? "#/preview" : `#/preview/${route.screen}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route) {
  location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return route;
}

/**
 * Invite links always point at the site the user is on (works on GitHub Pages sub-paths and custom
 * domains alike). The token lives in the #fragment, so it never reaches any server's logs.
 */
export function inviteUrl(token: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}#/i/${token}`;
}
