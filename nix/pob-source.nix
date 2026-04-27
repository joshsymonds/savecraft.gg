# Pinned Path of Building source — the single source-of-truth for the
# revision used by the production NixOS module (`nix/pob-server.nix`)
# AND the dev shell (`devenv.nix`). Bumping this revision is the only
# knob; both consumers import from here so dev/CI/prod can never drift.
#
# v2.65.0 — required for Classes/CompareCalcsHelpers + CompareTradeHelpers,
# which the ride-along statSources / buy-similar / dump_query_mods paths
# need. wrapper.lua + the Go integration tests assume the helpers are
# present.
{pkgs}:
pkgs.fetchFromGitHub {
  owner = "PathOfBuildingCommunity";
  repo = "PathOfBuilding";
  rev = "f9f4f3b4ab6a3a37d2eb693265b5c73317ff42a6";
  hash = "sha256-lNr9e7gifr7g+UsmyhEVqbQ9wBBWzlhHTKCsLnjsn6Y=";
}
