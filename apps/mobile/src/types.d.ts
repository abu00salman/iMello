declare module "qrcode/lib/core/qrcode.js" {
  export function create(
    data: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ): { modules: { size: number; get(row: number, col: number): boolean } };
}
