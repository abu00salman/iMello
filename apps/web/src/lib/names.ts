import { displayPin } from "@imello/core";
/** Turn a raw Matrix ID ("@mell-452634:imello.example") into what people recognise ("mell-452634"). */
export function prettyName(name: string | null | undefined): string {
  if (!name) return "";
  return displayPin(name.replace(/@([^:\s]+):[^\s,]+/g, "$1"));
}
