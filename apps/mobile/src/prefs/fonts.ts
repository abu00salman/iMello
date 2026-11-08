/** Font family names registered by PrefsProvider. Arabic uses IBM Plex Sans Arabic. */
export function fontFor(rtl: boolean, weight: "400" | "500" | "600" | "700" = "400"): string {
  const latin = weight === "700" ? "Inter-Bold" : weight === "600" ? "Inter-SemiBold" : weight === "500" ? "Inter-Medium" : "Inter";
  const arabic = weight === "700" ? "Plex-Bold" : weight === "600" ? "Plex-SemiBold" : weight === "500" ? "Plex-Medium" : "Plex";
  return rtl ? arabic : latin;
}
