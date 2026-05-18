{
  config,
  pkgs,
  lib,
  ...
}: let
  cfg = config.services.savecraftDataRefresh;

  stagingD1 = "0147892e-82e6-413e-a0ef-52f6d8787fdf";
  productionD1 = "df241bb0-9b7d-48e5-a4d4-f84ebf09e6e5";

  runMtgaFetchers = env: d1Id: vectorizeSuffix: ''
    echo "=== ${env}: scryfall-fetch ==="
    go run ./tools/scryfall-fetch \
      --d1-database-id=${d1Id} \
      --vectorize-index=magic-cards${vectorizeSuffix}

    echo "=== ${env}: rules-fetch ==="
    go run ./tools/rules-fetch \
      --d1-database-id=${d1Id} \
      --vectorize-index=magic-rules${vectorizeSuffix}

    echo "=== ${env}: 17lands-fetch ==="
    go run ./tools/17lands-fetch \
      --d1-database-id=${d1Id}

    # edhrec-fetch runs last in this section: enumerateCommanders queries
    # magic_cards for legality (populated by scryfall-fetch above), and the
    # card-price scrape phase iterates every recommendation card name.
    # Cold scrape is ~100 min for ~2k commanders + ~25k card pages; warm runs
    # are much faster thanks to per-commander hash-skip. Card prices are
    # wipe-and-replace each run so they always re-scrape.
    echo "=== ${env}: edhrec-fetch ==="
    go run ./tools/edhrec-fetch \
      --d1-database-id=${d1Id}
  '';

  runPoeFetchers = env: d1Id: vectorizeSuffix: ''
    echo "=== ${env}: pob-fetch ==="
    go run ./tools/pob-fetch \
      --d1-database-id=${d1Id} \
      --pob-dir=../../.reference/pob
  '';

  innerScript = pkgs.writeShellScript "savecraft-data-refresh-inner" ''
    set -euo pipefail

    echo "=== Savecraft data refresh started at $(date) ==="

    # Load Cloudflare credentials.
    # Sourced here (inside nix develop) because nix develop resets the environment.
    set -a
    source .env.local
    set +a

    # ── MTGA ──────────────────────────────────────────────
    cd plugins/magic

    # Staging first (canary) — failure here prevents production run.
    ${runMtgaFetchers "Staging" stagingD1 "-staging"}

    # Production — only reached if staging succeeded.
    ${runMtgaFetchers "Production" productionD1 ""}

    # ── PoE ───────────────────────────────────────────────
    cd ../../plugins/poe

    ${runPoeFetchers "Staging" stagingD1 "-staging"}
    ${runPoeFetchers "Production" productionD1 ""}

    echo "=== Savecraft data refresh completed at $(date) ==="
  '';

  # Outer script: source secrets, then enter the flake devShell to run fetchers.
  refreshScript = pkgs.writeShellScript "savecraft-data-refresh" ''
    set -euo pipefail
    cd ${lib.escapeShellArg cfg.repoPath}

    exec ${pkgs.nix}/bin/nix develop --no-pure-eval \
      --command ${pkgs.bash}/bin/bash ${innerScript}
  '';

  # Datagen (game-dependabot): regenerate committed version-pinned codegen
  # and open a PR only when the upstream game data changed. This is a
  # SEPARATE unit from the D1 data refresh — codegen has its own (release-
  # paced) lifecycle and must never ride the D1 cadence (epic invariant).
  # No-diff runs are a true no-op; a real diff opens/updates a PR via the
  # host's existing `gh` auth. Never pushes main, never mutates the
  # primary tree (the recipe builds the commit in an isolated worktree).
  datagenScript = pkgs.writeShellScript "savecraft-datagen-magic" ''
    set -euo pipefail
    cd ${lib.escapeShellArg cfg.repoPath}

    exec ${pkgs.nix}/bin/nix develop --no-pure-eval \
      --command ${pkgs.bash}/bin/bash -c 'just datagen-magic'
  '';
in {
  options.services.savecraftDataRefresh = {
    enable = lib.mkEnableOption "Weekly game data refresh (MTGA + PoE reference data)";

    repoPath = lib.mkOption {
      type = lib.types.str;
      default = "/home/joshsymonds/Personal/savecraft.gg";
      description = "Path to the savecraft.gg repository checkout.";
    };

    onCalendar = lib.mkOption {
      type = lib.types.str;
      default = "Mon *-*-* 04:00:00";
      description = "systemd OnCalendar expression for when to run the refresh.";
    };

    enableDatagen = lib.mkEnableOption ''
      the datagen game-dependabot timer: periodically runs
      `just datagen-magic`, which regenerates committed codegen and opens
      a PR only when the upstream MTGA card DB changed (no-op otherwise).
      Independent of the D1 refresh above'';

    datagenOnCalendar = lib.mkOption {
      type = lib.types.str;
      default = "Mon *-*-* 05:30:00";
      description = ''
        systemd OnCalendar for the datagen PR check. Defaults to 90min
        after the data refresh so they never contend; cadence is weekly
        but real diffs are ~monthly (new sets), so most runs are no-ops.
      '';
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "joshsymonds";
      description = "User to run the refresh as (must have .envrc.local with Cloudflare credentials).";
    };
  };

  config = lib.mkMerge [
    (lib.mkIf cfg.enable {
      systemd.services.savecraft-data-refresh = {
        description = "Savecraft game data refresh (MTGA + PoE)";
        after = ["network-online.target"];
        wants = ["network-online.target"];

        serviceConfig = {
          Type = "oneshot";
          User = cfg.user;
          ExecStart = "${pkgs.bash}/bin/bash ${refreshScript}";
          # 6h budget. Cold cache cost per env: scryfall+rules+17lands ≈ 25min,
          # edhrec commanders ≈ 100min, edhrec card prices ≈ 90min. Run twice
          # (staging+prod) ≈ 7h worst-case; warm runs (after the first cold pass)
          # are much shorter thanks to per-commander hash-skip and unchanged-card
          # price skip. 6h is the sweet spot: covers any single warm-cache run
          # comfortably and one cold-cache half (whichever side missed).
          TimeoutStartSec = "6h";
          Environment = [
            "HOME=/home/${cfg.user}"
            "PATH=${lib.makeBinPath [pkgs.bash pkgs.coreutils pkgs.git pkgs.nix]}:/home/${cfg.user}/.nix-profile/bin"
          ];
        };
      };

      systemd.timers.savecraft-data-refresh = {
        description = "Weekly game data refresh timer (MTGA + PoE)";
        wantedBy = ["timers.target"];
        timerConfig = {
          OnCalendar = cfg.onCalendar;
          Persistent = true;
        };
      };
    })

    (lib.mkIf cfg.enableDatagen {
      systemd.services.savecraft-datagen-magic = {
        description = "Savecraft datagen game-dependabot (arena_cards PR)";
        after = ["network-online.target"];
        wants = ["network-online.target"];

        serviceConfig = {
          Type = "oneshot";
          User = cfg.user;
          ExecStart = "${pkgs.bash}/bin/bash ${datagenScript}";
          # The recipe regenerates one Go file then, only on a diff, runs
          # the full `just check` gate inside an isolated worktree before
          # pushing. 2h covers a cold-cache check comfortably; no-op runs
          # finish in seconds.
          TimeoutStartSec = "2h";
          Environment = [
            "HOME=/home/${cfg.user}"
            "PATH=${lib.makeBinPath [pkgs.bash pkgs.coreutils pkgs.git pkgs.nix]}:/home/${cfg.user}/.nix-profile/bin"
          ];
        };
      };

      systemd.timers.savecraft-datagen-magic = {
        description = "Weekly datagen PR check (MTGA arena_cards)";
        wantedBy = ["timers.target"];
        timerConfig = {
          OnCalendar = cfg.datagenOnCalendar;
          Persistent = true;
        };
      };
    })
  ];
}
