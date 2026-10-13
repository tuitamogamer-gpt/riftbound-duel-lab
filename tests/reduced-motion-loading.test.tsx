import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MomentMotion } from "../src/motion/MomentMotion";

afterEach(() => vi.unstubAllGlobals());

describe("reduced motion", () => {
  it.each(["champion", "victory", "counter", "combat", "conquer"] as const)(
    "renders %s feedback without mounting an animation player",
    (kind) => {
      vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
      const html = renderToStaticMarkup(
        <MomentMotion kind={kind} paused={false} speed={1} />,
      );
      expect(html).toContain('data-motion-engine="static"');
      expect(html).toContain("moment-motion-fallback");
      expect(html).toContain('aria-hidden="true"');
      expect(html).not.toContain("template");
    },
  );
});
