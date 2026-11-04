/** Classic structure colours from design tokens v0.3.1. Classic Blue is the default. */

export type PaletteName = "classic-blue" | "coral";
export type ModePref = "system" | "light" | "dark";

export interface ClassicColors {
  palette: PaletteName;
  dark: boolean;
  headerBg: string;
  headerText: string;
  headerSub: string;
  bg: string;
  grouped: string;
  surface: string;
  surface2: string;
  text: string;
  text2: string;
  text3: string;
  separator: string;
  separatorStrong: string;
  primary: string;
  primaryFill: string;
  onPrimary: string;
  wallpaper: string;
  cardBg: string;
  cardText: string;
  cardMeta: string;
  barOwn: string;
  unread: string;
  unreadText: string;
  statusSent: string;
  statusRead: string;
  statusFailed: string;
  avail: string;
  busy: string;
  pingBg: string;
  pingBar: string;
  pingText: string;
  pingIcon: string;
  tabBg: string;
  tabSep: string;
  tabActive: string;
  tabText: string;
  tabIndicator: string;
  emojiBg: string;
  shadow: string;
}

export const AVATAR_COLORS = ["#E8664B", "#12807A", "#6E5BD8", "#D9922B", "#3C7DD9", "#B5527C"] as const;

const classicLight: ClassicColors = {
  palette: "classic-blue",
  dark: false,
  headerBg: "#1F64AC",
  headerText: "#FFFFFF",
  headerSub: "#E2EDF9",
  bg: "#FFFFFF",
  grouped: "#F1F3F6",
  surface: "#FFFFFF",
  surface2: "#EEF1F5",
  text: "#16191E",
  text2: "#525A66",
  text3: "#69707C",
  separator: "#E2E6EB",
  separatorStrong: "#CDD3DB",
  primary: "#1D5FA6",
  primaryFill: "#1D5FA6",
  onPrimary: "#FFFFFF",
  wallpaper: "#E8ECF1",
  cardBg: "#FFFFFF",
  cardText: "#16191E",
  cardMeta: "#69707C",
  barOwn: "#2F7DD1",
  unread: "#1D5FA6",
  unreadText: "#FFFFFF",
  statusSent: "#69707C",
  statusRead: "#1D5FA6",
  statusFailed: "#C62828",
  avail: "#1E8E50",
  busy: "#D23F31",
  pingBg: "#FFF3D6",
  pingBar: "#F2B640",
  pingText: "#5A3A00",
  pingIcon: "#14171C",
  tabBg: "#24272C",
  tabSep: "#33373D",
  tabActive: "#30343A",
  tabText: "#B9BEC6",
  tabIndicator: "#5AA2EE",
  emojiBg: "#F1F3F6",
  shadow: "rgba(22,25,30,0.16)",
};

const classicDark: ClassicColors = {
  ...classicLight,
  dark: true,
  headerBg: "#173B63",
  headerSub: "#C8D6E8",
  bg: "#0F1318",
  grouped: "#0F1318",
  surface: "#181D24",
  surface2: "#222831",
  text: "#EEF1F5",
  text2: "#AAB2BE",
  text3: "#8C95A1",
  separator: "#252B33",
  separatorStrong: "#343B45",
  primary: "#6AAEF0",
  primaryFill: "#2A6DB0",
  wallpaper: "#0F1318",
  cardBg: "#1B2027",
  cardText: "#EEF1F5",
  cardMeta: "#9AA3AF",
  barOwn: "#4C97E3",
  unread: "#2A6DB0",
  statusSent: "#8C95A1",
  statusRead: "#6AAEF0",
  statusFailed: "#FF6B6B",
  avail: "#3FCB7E",
  busy: "#FF6B6B",
  pingBg: "#3A2C0C",
  pingText: "#FFE7A6",
  tabBg: "#0A0C0F",
  tabSep: "#1A1E24",
  tabActive: "#1A1F26",
  tabIndicator: "#6AAEF0",
  emojiBg: "#151A20",
  shadow: "transparent",
};

const coralLight: ClassicColors = {
  ...classicLight,
  palette: "coral",
  headerBg: "#C8432C",
  headerSub: "#FFFFFF",
  primary: "#C8432C",
  primaryFill: "#C8432C",
  wallpaper: "#F1ECE9",
  barOwn: "#C8432C",
  unread: "#C8432C",
  statusRead: "#12807A",
  tabBg: "#2A2523",
  tabSep: "#3A3330",
  tabActive: "#38312E",
  tabText: "#C4BAB6",
  tabIndicator: "#FF8A6E",
  emojiBg: "#F5F6F8",
};

const coralDark: ClassicColors = {
  ...classicDark,
  palette: "coral",
  headerBg: "#8C2C1C",
  headerSub: "#FFD9CF",
  bg: "#0E1116",
  grouped: "#0E1116",
  surface: "#171B22",
  surface2: "#20252E",
  text: "#F2F4F7",
  text2: "#A9B1BD",
  primary: "#FF8A6E",
  primaryFill: "#C94C35",
  wallpaper: "#0E1116",
  cardBg: "#1C2027",
  cardText: "#F2F4F7",
  cardMeta: "#A9B1BD",
  barOwn: "#FF8A6E",
  unread: "#C94C35",
  statusRead: "#3CC7BC",
  tabIndicator: "#FF8A6E",
  emojiBg: "#13161C",
};

export function resolveColors(palette: PaletteName, mode: ModePref, systemDark: boolean): ClassicColors {
  const dark = mode === "system" ? systemDark : mode === "dark";
  if (palette === "coral") return dark ? coralDark : coralLight;
  return dark ? classicDark : classicLight;
}

export const motion = {
  fast: 120,
  base: 160,
  nav: 240,
  sheet: 280,
  ping: 420,
} as const;
