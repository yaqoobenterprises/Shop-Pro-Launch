import { describe, expect, it } from "vitest";
import baseStyles from "../src/index.css?raw";
import typographyStyles from "../src/typography.css?raw";

describe("project-wide typography system", () => {
  it("uses the bundled Manrope variable font with a resilient system fallback", () => {
    expect(baseStyles).toContain('@import "@fontsource-variable/manrope"');
    expect(baseStyles).toContain('--font-sans: "Manrope"');
    expect(baseStyles).toContain("system-ui");
  });

  it("defines a consistent, readable type scale and spacing rhythm", () => {
    expect(typographyStyles).toContain("--type-body: 0.9375rem");
    expect(typographyStyles).toContain("--type-label: 0.875rem");
    expect(typographyStyles).toContain("--type-caption: 0.75rem");
    expect(typographyStyles).toContain("--leading-copy: 1.6");
    expect(typographyStyles).toContain("--tracking-heading: -0.03em");
  });

  it("keeps responsive and Urdu reading adjustments available", () => {
    expect(typographyStyles).toContain("@media (max-width: 639px)");
    expect(typographyStyles).toContain('html[lang="ur"]');
    expect(typographyStyles).toContain("text-wrap: balance");
  });

  it("keeps financial values aligned with tabular numerals", () => {
    expect(typographyStyles).toContain("font-variant-numeric: tabular-nums lining-nums");
  });
});
