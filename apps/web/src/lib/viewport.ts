/**
 * The shell follows the visual viewport only while the keyboard is open.
 * iOS also fires visualViewport "scroll" while a finger pans. Writing that
 * offset onto a fixed shell, or calling scrollTo(0, 0), moves the page
 * against the finger.
 */
export function shellFollowsKeyboard(innerHeight: number, visualHeight: number): boolean {
  return innerHeight - visualHeight > 120;
}

export function bindVisualViewport(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return () => undefined;
  const apply = () => {
    const open = shellFollowsKeyboard(window.innerHeight, vv.height);
    root.style.setProperty("--im-vvh", open ? `${Math.round(vv.height)}px` : "100dvh");
    root.style.setProperty("--im-vv-top", open ? `${Math.round(vv.offsetTop)}px` : "0px");
  };
  apply();
  vv.addEventListener("resize", apply);
  return () => vv.removeEventListener("resize", apply);
}
