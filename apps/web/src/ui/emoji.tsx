import { useRef, useState } from "react";

/**
 * Emoji keyboard in the classic messenger style: pages of large faces that replace the keyboard area,
 * with page dots underneath. Uses the device's own Unicode emoji (no image assets).
 */
const PAGES: string[][] = [
  ["😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😌", "😍", "🥰", "😘", "😋", "😛", "😜", "🤪", "😝", "🤗", "🤭", "🤔", "😎", "🤓", "🥳", "😏", "😒", "🙄", "😬", "😴"],
  ["😢", "😭", "😤", "😠", "😡", "🤬", "😱", "😨", "😰", "😥", "😓", "🥺", "😳", "😮", "😯", "😲", "🥱", "😪", "🤒", "🤕", "🤢", "🤧", "😷", "🤠", "😶", "😐", "😑", "🫡", "🤫", "🤐", "🤥", "🫠"],
  ["👍", "👎", "👏", "🙌", "🙏", "🤝", "👋", "✌️", "🤞", "👌", "🤙", "💪", "❤️", "🧡", "💛", "💚", "💙", "🤍", "💔", "💯", "✨", "🎉", "🎂", "🌹", "🌙", "⭐", "☕", "🍽️", "⚽", "🚴", "📷", "🕋"],
];

export function EmojiPicker({ id, label, onPick }: { id: string; label: string; onPick: (emoji: string) => void }) {
  const [page, setPage] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const go = (i: number) => {
    setPage(i);
    const el = track.current;
    if (el) el.scrollTo({ left: (document.documentElement.dir === "rtl" ? -1 : 1) * i * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className="emoji-panel" id={id} role="group" aria-label={label}>
      <div
        className="emoji-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
        }}
      >
        {PAGES.map((p, i) => (
          <div className="emoji-page" key={i} aria-hidden={i !== page || undefined}>
            {p.map((e) => (
              <button type="button" key={e} className="emoji" onClick={() => onPick(e)} aria-label={e} tabIndex={i === page ? 0 : -1}>
                {e}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="emoji-dots">
        {PAGES.map((_, i) => (
          <button type="button" key={i} className={`edot ${i === page ? "on" : ""}`} onClick={() => go(i)} aria-label={`${i + 1} / ${PAGES.length}`} aria-current={i === page || undefined} />
        ))}
      </div>
    </div>
  );
}
