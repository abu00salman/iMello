/**
 * iMello design tokens. Platform-neutral values consumed by the web app (as CSS
 * custom properties) and the mobile app (as React Native style values).
 */

export const palette = {
  white: "#FFFFFF",
  blue50: "#EEF5FF",
  blue100: "#DCEBFF",
  blue300: "#8DB8F7",
  blue500: "#3D7FE0",
  blue600: "#2D69C4",
  blue700: "#1F4F9A",
  lavender100: "#EFEAFE",
  lavender300: "#C9BBF6",
  lavender500: "#8E78E8",
  neutral50: "#F7F8FB",
  neutral100: "#EEF0F5",
  neutral200: "#E1E4EC",
  neutral400: "#A3A9B8",
  neutral600: "#5E6576",
  neutral800: "#2A2F3A",
  neutral900: "#171A21",
  ink950: "#0E1015",
  green500: "#2FA36B",
  red500: "#D9465B",
  amber500: "#D99A2B",
} as const;

export interface ColorScheme {
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  accentPressed: string;
  accentText: string;
  accentSoft: string;
  lavender: string;
  bubbleOutgoing: string;
  bubbleOutgoingText: string;
  bubbleIncoming: string;
  bubbleIncomingText: string;
  success: string;
  danger: string;
  warning: string;
  focusRing: string;
}

export const lightScheme: ColorScheme = {
  background: palette.neutral50,
  surface: palette.white,
  surfaceElevated: palette.white,
  border: palette.neutral200,
  textPrimary: palette.neutral900,
  textSecondary: palette.neutral600,
  accent: palette.blue500,
  accentPressed: palette.blue600,
  accentText: palette.white,
  accentSoft: palette.blue50,
  lavender: palette.lavender100,
  bubbleOutgoing: palette.blue600,
  bubbleOutgoingText: palette.white,
  bubbleIncoming: palette.neutral100,
  bubbleIncomingText: palette.neutral900,
  success: palette.green500,
  danger: palette.red500,
  warning: palette.amber500,
  focusRing: palette.lavender500,
};

export const darkScheme: ColorScheme = {
  background: palette.ink950,
  surface: palette.neutral900,
  surfaceElevated: palette.neutral800,
  border: "#2C313D",
  textPrimary: "#F2F4F8",
  textSecondary: palette.neutral400,
  accent: "#5B95EA",
  accentPressed: palette.blue500,
  accentText: palette.white,
  accentSoft: "#1A2740",
  lavender: "#241F3A",
  bubbleOutgoing: "#3D74CC",
  bubbleOutgoingText: palette.white,
  bubbleIncoming: palette.neutral800,
  bubbleIncomingText: "#F2F4F8",
  success: "#45B97F",
  danger: "#E86476",
  warning: "#E5AC45",
  focusRing: palette.lavender300,
};

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 18, bubble: 20, pill: 999 } as const;

export const typography = {
  /** Latin first, then Arabic-capable system fonts. */
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Noto Sans", "Noto Sans Arabic", "Geeza Pro", Tahoma, sans-serif',
  size: { caption: 12, footnote: 13, body: 16, callout: 17, title3: 20, title2: 24, title1: 30 },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
  /** Arabic script needs extra line height for diacritics. */
  lineHeight: { latin: 1.4, arabic: 1.7 },
} as const;

export const motion = {
  durationFast: 120,
  durationBase: 200,
  durationSlow: 320,
  easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
} as const;

/** Kids Mode uses larger touch targets and friendlier accents. */
export const kids = {
  minTouchTarget: 64,
  contactCardSize: 120,
  recordButtonSize: 96,
  accents: ["#FFB648", "#5BC0EB", "#9BC53D", "#E55934", "#8E78E8"],
} as const;

export const MIN_TOUCH_TARGET = 44;

/** Convert a scheme into CSS custom properties, e.g. `--color-accent`. */
export function schemeToCssVariables(scheme: ColorScheme): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(scheme)) {
    out[`--color-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
  }
  return out;
}

/** WCAG relative luminance contrast ratio between two hex colors. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const [a, b] = [lum(hexA), lum(hexB)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
