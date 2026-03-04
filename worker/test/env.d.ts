import type { Env } from "../src/types";

declare module "cloudflare:test" {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation requires this pattern
  interface ProvidedEnv extends Env {}
}
