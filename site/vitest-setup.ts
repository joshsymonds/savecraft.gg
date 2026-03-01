import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement IntersectionObserver — stub it for component tests
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "IntersectionObserver", {
  value: IntersectionObserverStub,
  writable: true,
});
