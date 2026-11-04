import { create } from "qrcode/lib/core/qrcode.js";
import { View } from "react-native";

/** Draws a code from modules. No image library, so the native build stays on Expo modules we already ship. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const qr = create(value, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const cell = Math.floor(size / n);
  const rows: number[] = [];
  for (let i = 0; i < n; i++) rows.push(i);
  return (
    <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: 8 }}>
      {rows.map((y) => (
        <View key={y} style={{ flexDirection: "row" }}>
          {rows.map((x) => (
            <View key={x} style={{ width: cell, height: cell, backgroundColor: qr.modules.get(y, x) ? "#16191E" : "#fff" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
