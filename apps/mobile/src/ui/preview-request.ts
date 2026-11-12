import { File, Paths } from "expo-file-system";
import { parsePreviewRequest } from "./fixture-data";

const REQUEST = "imello-preview.txt";

/**
 * The simulator writes Documents/imello-preview.txt (`ar chats`) and relaunches.
 * A custom-scheme URL was showing iOS “Open in Wanas?” and never reached the screen.
 * The file is removed as soon as it is read. It never signs anyone in.
 */
export async function takePreviewRequest(): Promise<string | null> {
  try {
    const file = new File(Paths.document, REQUEST);
    if (!file.exists) return null;
    const raw = await file.text();
    file.delete();
    const { lang, screen } = parsePreviewRequest(raw);
    return `/preview?lang=${lang}&screen=${screen}`;
  } catch {
    return null;
  }
}

export function markPreviewShown(lang: string, screen: string): void {
  try {
    const file = new File(Paths.document, "imello-preview-shown.txt");
    if (file.exists) file.delete();
    file.create();
    file.write(`${lang} ${screen}`);
  } catch {
    /* The web fixture renderer has no document directory. */
  }
}
