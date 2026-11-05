/**
 * Pin the app shell to the visual viewport so the composer stays above the
 * iOS keyboard. 100vh/100dvh stay at the layout height while the keyboard is open.
 */
export function bindVisualViewport(): () => void {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv) return () => undefined;
  const apply = () => {
    // Follow the visual viewport only while the keyboard is open. Following its offset all the time
    // made the shell move against the finger on iPhone whenever the page itself drifted (reversed scrolling).
    const keyboard = window.innerHeight - vv.height > 120;
    root.style.setProperty("--im-vvh", keyboard ? `${Math.round(vv.height)}px` : "100dvh");
    root.style.setProperty("--im-vv-top", keyboard ? `${Math.round(vv.offsetTop)}px` : "0px");
    if (!keyboard && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  };
  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
  return () => {
    vv.removeEventListener("resize", apply);
    vv.removeEventListener("scroll", apply);
  };
}
