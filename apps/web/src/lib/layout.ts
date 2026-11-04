/**
 * Phone layout for narrow windows and for touch phones/tablets, including iOS
 * "Request Desktop Website" (layout viewport ~980px, so a width media query misses).
 */

export interface LayoutSignals {
  width: number;
  hoverNone: boolean;
  pointerCoarse: boolean;
  maxTouchPoints: number;
  platform: string;
  ua: string;
}

export function isPhoneLayout(s: LayoutSignals): boolean {
  if (s.width > 0 && s.width <= 820) return true;
  if (s.hoverNone && s.pointerCoarse) return true;
  if (/iPhone|iPad|iPod/i.test(s.ua)) return true;
  // iPadOS and iPhone desktop-site mode report a Macintosh UA with a touch screen.
  if (s.platform === "MacIntel" && s.maxTouchPoints > 1) return true;
  return false;
}

export function readLayoutSignals(): LayoutSignals {
  return {
    width: window.innerWidth,
    hoverNone: window.matchMedia("(hover: none)").matches,
    pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    platform: navigator.platform ?? "",
    ua: navigator.userAgent ?? "",
  };
}

/** Sets <html data-layout="phone|desktop"> and keeps it current. */
export function watchLayout(): () => void {
  const apply = () => {
    document.documentElement.dataset.layout = isPhoneLayout(readLayoutSignals()) ? "phone" : "desktop";
  };
  apply();
  window.addEventListener("resize", apply);
  window.addEventListener("orientationchange", apply);
  const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
  mq.addEventListener?.("change", apply);
  return () => {
    window.removeEventListener("resize", apply);
    window.removeEventListener("orientationchange", apply);
    mq.removeEventListener?.("change", apply);
  };
}
