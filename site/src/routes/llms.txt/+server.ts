import { discoverPlugins } from "$lib/server/plugins";

export const prerender = true;

const ORIGIN = "https://savecraft.gg";

export function GET() {
  const gameLines = discoverPlugins()
    .map((game) => `- [${game.name}](${ORIGIN}/${game.gameId}): ${game.description}`)
    .join("\n");

  const body = `# Savecraft

Savecraft connects AI assistants — Claude, ChatGPT — to real, current game data: rules, items, builds, economy reference plus live save state.

## Games

${gameLines}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
