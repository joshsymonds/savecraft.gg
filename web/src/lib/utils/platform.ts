interface DefaultPaths {
  windows?: string;
  linux?: string;
  darwin?: string;
}

export function defaultPathForPlatform(
  platform: string | null | undefined,
  paths: DefaultPaths | undefined,
): string {
  if (!paths) return "";
  if (platform === "linux" || platform === "windows" || platform === "darwin") {
    return paths[platform] ?? "";
  }
  return "";
}
