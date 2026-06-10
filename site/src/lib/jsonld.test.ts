import { describe, expect, it } from "vitest";

import { jsonLd } from "./jsonld";

describe("jsonLd", () => {
  it("wraps the payload in a JSON-LD script tag", () => {
    const tag = jsonLd({ "@type": "WebSite", name: "Savecraft" });
    expect(tag).toMatch(/^<script type="application\/ld\+json">.*<\/script>$/);
  });

  it("escapes < so data-derived strings cannot terminate the script element", () => {
    const tag = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(tag).toContain("\\u003c/script>");
    // The only literal </script> left is the tag's own closing one.
    expect(tag.indexOf("</script>")).toBe(tag.length - "</script>".length);
  });

  it("round-trips through JSON.parse despite the escaping", () => {
    const payload = { name: "a < b </script>", nested: { items: ["<x>"] } };
    const tag = jsonLd(payload);
    const json = tag
      .replace(/^<script type="application\/ld\+json">/, "")
      .replace(/<\/script>$/, "");
    expect(JSON.parse(json)).toEqual(payload);
  });
});
