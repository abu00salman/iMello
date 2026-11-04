/**
 * Pin the app shell to the visual viewport so the composer stays above the
 * iOS keyboard. 100vh/100dvh stay at the layout height while the keyboard is open.
 */
export function bindVisualViewport(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return () => undefined;
  const apply = () => {
    root.style.setProperty("--im-vvh", `${Math.round(vv.height)}px`);
    root.style.setProperty("--im-vv-top", `${Math.round(vv.offsetTop)}px`);
  };
  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
  };
}
