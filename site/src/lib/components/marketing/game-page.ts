import type { DemoMessage, ModeExample } from "./types";

/** Frame rendered by HeroScreenshots. */
export interface HeroFrame {
  src: string;
  alt: string;
  caption?: string;
  /** Intrinsic pixel dimensions; when present the rendered <img> reserves
   *  its layout box, preventing CLS while the frame loads. */
  width?: number;
  height?: number;
}

/**
 * Per-game visual theme. Every value lands in a CSS custom property on the
 * page root, so the shared template renders each game in its own palette.
 */
export interface GameTheme {
  /** Main accent color (CSS color). Threads through eyebrows, module names,
   *  proof separators, flow numbers, buttons, and card hover states. */
  accent: string;
  /** Brighter accent for gradients and hover glows. */
  accentBright: string;
  /** Ink color readable on top of an accent-filled button. */
  onAccent: string;
  /** Full CSS background value for the hero atmosphere. */
  heroBackground: string;
  /** Seed for the hero ParticleField. */
  particleSeed: number;
  /** Accent preset passed to HeroScreenshots frames. */
  heroAccent: "gold" | "crimson" | "blue" | "green";
}

export interface HeroCta {
  label: string;
  /** Defaults to the app sign-in URL when omitted. */
  href?: string;
}

export interface GameHero {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Image-led hero. Omit for a demo-led hero. */
  frames?: HeroFrame[];
  /** Demo-led hero for games without capture assets. */
  demo?: { conversation: DemoMessage[]; headerLabel: string };
  /** HeroScreenshots variant when image-led. */
  variant?: "stacked" | "overlap" | "carousel" | "solo" | "solo-peek" | "side-solo";
  primaryCta: HeroCta;
  secondaryCta?: HeroCta;
}

export type SectionTreatment = "plain" | "tinted" | "bleed";

/** Labeled source/description entries in a two-column grid. */
export interface MethodItem {
  source: string;
  desc: string;
}

/** One without/with conversation pair in the compare section. */
export interface ComparePair {
  headerLabel: string;
  without: DemoMessage[];
  withoutCaption: string;
  with: DemoMessage[];
  withCaption: string;
}

export interface ModeCardContent {
  icon: string;
  label: string;
  color: string;
  examples: ModeExample[];
}

export interface FlowStep {
  title: string;
  desc: string;
}

interface SectionBase {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  treatment?: SectionTreatment;
}

export type GameSection =
  | (SectionBase & { kind: "methodGrid"; items: MethodItem[]; ctaLabel?: string })
  | (SectionBase & { kind: "modules" })
  | (SectionBase & { kind: "compare"; pairs: ComparePair[] })
  | (SectionBase & { kind: "modes"; cards: ModeCardContent[] })
  | (SectionBase & { kind: "flow"; steps: FlowStep[] });

export interface GameSeo {
  /** <title> and JSON-LD name. */
  title: string;
  /** <meta name="description">. */
  metaDescription: string;
  /** Social card title/description (og: + twitter:). */
  ogTitle: string;
  ogDescription: string;
  /** JSON-LD WebPage description. */
  jsonDescription: string;
  /** Route path, e.g. "/poe". Also the OG image slug (leading slash stripped). */
  path: string;
}

export interface GamePageContent {
  seo: GameSeo;
  /** VideoGame name for JSON-LD `about`. */
  gameName: string;
  theme: GameTheme;
  hero: GameHero;
  proofItems: string[];
  sections: GameSection[];
  cta: { title: string; sub: string; label: string };
}
