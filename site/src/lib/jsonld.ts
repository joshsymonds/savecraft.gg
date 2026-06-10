/**
 * Serialize a schema.org object as a JSON-LD script tag for {@html} inside
 * <svelte:head>. Svelte can't render <script> elements in markup directly,
 * so pages inject the serialized tag. Escapes "<" to keep any data-derived
 * strings from terminating the script element early.
 */
export function jsonLd(data: Record<string, unknown>): string {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
