export type OS = "windows" | "linux" | "darwin";

export function detectOS(): OS {
  const ua = globalThis.navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "darwin";
  return "linux";
}
