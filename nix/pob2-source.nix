# Pinned PathOfBuilding-PoE2 source — the single source-of-truth for the
# revision used by the production NixOS module (`nix/pob-server.nix`),
# its sole consumer. Bumping this revision is the only knob. The dev
# shell (`devenv.nix`) does not import this yet — dev-shell PoE2
# integration is a future task.
#
# dev branch @ 2026-07-02 — first revision verified end-to-end against
# wrapper.lua (see cmd/pob-server/wrapper.lua's POB_GAME switch): boots
# under HeadlessWrapper.lua, loads a real pobb.in PoE2 build, and returns
# calc'd summary stats. PoE2 renamed Classes/CompareTradeHelpers.lua to
# Classes/TradeHelpers.lua relative to nix/pob-source.nix's PoE1 pin;
# every other module path wrapper.lua touches is unchanged.
{pkgs}:
pkgs.fetchFromGitHub {
  owner = "PathOfBuildingCommunity";
  repo = "PathOfBuilding-PoE2";
  rev = "11337eddc01c9246318f98c2425d78e7d76d6597";
  hash = "sha256-AGsM+eIous4Za4DGiUioR9CWP0X5yIv16TlAUm0ILUU=";
}
