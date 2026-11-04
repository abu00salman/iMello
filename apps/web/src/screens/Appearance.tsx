import { usePrefs, type ColorMode, type Palette } from "../lib/prefs";

const THEMES: { id: Palette; name: "settings.appearance.classicBlue" | "settings.appearance.coral"; swatches: string[]; preview: Record<string, string> }[] = [
  {
    id: "classic-blue",
    name: "settings.appearance.classicBlue",
    swatches: ["#1F64AC", "#1D5FA6", "#12807A", "#24272C"],
    preview: { "--h": "#1F64AC", "--w": "#E8ECF1", "--b": "#2F7DD1", "--r": "#1D5FA6", "--t": "#24272C", "--ind": "#5AA2EE" },
  },
  {
    id: "coral",
    name: "settings.appearance.coral",
    swatches: ["#C8432C", "#FF8A6E", "#12807A", "#2A2523"],
    preview: { "--h": "#C8432C", "--w": "#F1ECE9", "--b": "#C8432C", "--r": "#12807A", "--t": "#2A2523", "--ind": "#FF8A6E" },
  },
];

export function AppearancePanel({ heading = true }: { heading?: boolean }) {
  const { t, palette, setPalette, mode, setMode } = usePrefs();
  const modes: ColorMode[] = ["light", "dark", "system"];
  return (
    <section aria-label={t("settings.theme")}>
      {heading && <h2 className="k-sec">{t("settings.theme")}</h2>}
      <div className="k-themes" role="radiogroup" aria-label={t("settings.theme")}>
        {THEMES.map((theme) => {
          const on = palette === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`k-tcard ${on ? "on" : ""}`}
              onClick={() => setPalette(theme.id)}
            >
              <span
                className="k-mini"
                aria-hidden="true"
                ref={(el) => {
                  if (!el) return;
                  for (const [k, v] of Object.entries(theme.preview)) el.style.setProperty(k, v);
                }}
              >
                <span className="mh"><i /><b /></span>
                <span className="bd">
                  <span className="c"><span>{t("chat.ping")}</span><em>R</em></span>
                  <span className="c o"><span>{t("chat.placeholder")}</span><em>D</em></span>
                </span>
                <span className="tb"><i /><i className="on" /><i /></span>
              </span>
              <span className="tn">
                <span className="radio" aria-hidden="true" />
                {t(theme.name)}
                {theme.id === "classic-blue" ? (
                  <span className="k-tag def">{t("settings.appearance.defaultTag")}</span>
                ) : on ? (
                  <span className="k-tag">{t("settings.appearance.inUse")}</span>
                ) : null}
              </span>
              <span className="k-swatches" aria-hidden="true">
                {theme.swatches.map((c) => <i key={c} ref={(el) => el?.style.setProperty("background", c)} />)}
              </span>
            </button>
          );
        })}
      </div>
      <h2 className="k-sec">{t("settings.appearance.mode")}</h2>
      <div className="segmented" role="radiogroup" aria-label={t("settings.theme")}>
        {modes.map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
            {m === "system" ? t("settings.appearance.auto") : t(m === "light" ? "settings.theme.light" : "settings.theme.dark")}
          </button>
        ))}
      </div>
      <p className="k-foot">{t("settings.appearance.footnote")}</p>
      <div className="card icon-row">
        <div className="contact-row">
          <span className="contact-main">
            <strong>{t("settings.appearance.icon")}</strong>
            <small className="muted">{t("settings.appearance.matches")}</small>
          </span>
        </div>
      </div>
    </section>
  );
}
