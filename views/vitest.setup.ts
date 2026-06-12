// Component tests run in reduced-motion mode: count-ups and tweens render
// their final values synchronously, so tests assert the same end state a
// prefers-reduced-motion user sees. Individual tests can stub matchMedia
// themselves (vi.stubGlobal) to exercise the animated paths.
const originalMatchMedia = window.matchMedia?.bind(window);

window.matchMedia = (query: string): MediaQueryList => {
  if (query.includes("prefers-reduced-motion")) {
    return {
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList;
  }
  return originalMatchMedia(query);
};
