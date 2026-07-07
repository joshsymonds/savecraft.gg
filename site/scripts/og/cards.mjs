// OG card definitions for the four marketing pages.
//
// Strings are reused verbatim from each page's shipped hero/section copy
// (already through the marketing-copy review) — do not invent new copy here.
// Screenshots are the pages' own hero frames, one distinct image per card.

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/**
 * @typedef {Object} OgCard
 * @property {string} slug      Output filename: static/og/<slug>.png
 * @property {string} eyebrow   Gold kicker line above the title
 * @property {string} title     Headline, rendered in the pixel display font
 * @property {string} screenshot Path under static/ for the framed screenshot
 */

/** @type {OgCard[]} */
export const cards = [
  {
    slug: "home",
    eyebrow: "FIX AI HALLUCINATIONS",
    title: "Real game data for your AI.",
    screenshot: "images/stellaris/stellaris1.jpg",
  },
  {
    slug: "magic",
    eyebrow: "MAGIC, WITHOUT THE HALLUCINATED CARDS",
    title: "Your AI stops inventing cards here.",
    screenshot: "images/magic/magic-good.jpeg",
  },
  {
    slug: "poe",
    eyebrow: "PATH OF BUILDING IN CHAT",
    title: "Real DPS deltas, real tree math, your actual build.",
    screenshot: "images/poe/poe3.jpeg",
  },
  {
    slug: "games",
    eyebrow: "EVERY GAME SAVECRAFT SUPPORTS",
    title: "Supported Games",
    screenshot: "images/factorio/factorio3.jpg",
  },
  {
    slug: "poe2",
    eyebrow: "GGG-APPROVED ACCOUNT CONNECT",
    title: "Your Path of Exile 2 characters, in Claude.",
    screenshot: "images/poe2/gear-check-demo.png",
  },
  {
    slug: "factorio",
    eyebrow: "THE FACTORY, DIAGNOSED IN CHAT",
    title: "Your Factorio factory, diagnosed in Claude.",
    screenshot: "images/factorio/views-productionflow-bottlenecked-factory.png",
  },
  {
    slug: "stellaris",
    eyebrow: "YOUR EMPIRE, AUDITED",
    title: "Your Stellaris empire, briefed in Claude.",
    screenshot: "images/stellaris/empirehealth-empire-in-crisis.png",
  },
  {
    slug: "rimworld",
    eyebrow: "THE GAME'S EXACT FORMULAS, IN CHAT",
    title: "RimWorld's real math, in Claude.",
    screenshot: "images/rimworld/surgery-low-success.png",
  },
  {
    slug: "docs",
    eyebrow: "HOW SAVECRAFT WORKS",
    title: "Documentation",
    screenshot: "images/magic/magic2.jpg",
  },
  {
    slug: "privacy",
    eyebrow: "SAVECRAFT PRIVACY POLICY",
    title: "Privacy Policy",
    screenshot: "images/poe/poe2.jpg",
  },
  {
    slug: "terms",
    eyebrow: "SAVECRAFT TERMS OF SERVICE",
    title: "Terms of Service",
    screenshot: "images/stellaris/stellaris2.jpg",
  },
  {
    slug: "support",
    eyebrow: "GET HELP WITH SAVECRAFT",
    title: "Support",
    screenshot: "images/factorio/factorio1.jpg",
  },
];
