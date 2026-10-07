import { useEffect, useState } from "react";

export const compactTableQuery =
  "(max-width: 800px), (max-width: 1000px) and (max-height: 500px)";

/** Rendering and CSS share the same breakpoint, including short landscape phones. */
export function useCompactTable() {
  const [compact, setCompact] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(compactTableQuery).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(compactTableQuery);
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}
