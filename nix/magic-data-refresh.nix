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
      --vectorize-index=mtga-cards${vectorizeSuffix}

    echo "=== ${env}: rules-fetch ==="
    go run ./tools/rules-fetch \
      --d1-database-id=${d1Id} \
      --vectorize-index=mtga-rules${vectorizeSuffix}

    echo "=== ${env}: 17lands-fetch ==="
    go run ./tools/17lands-fetch \
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

    user = lib.mkOption {
      type = lib.types.str;
      default = "joshsymonds";
      description = "User to run the refresh as (must have .envrc.local with Cloudflare credentials).";
    };
  };

  config = lib.mkIf cfg.enable {
    systemd.services.savecraft-data-refresh = {
      description = "Savecraft game data refresh (MTGA + PoE)";
      after = ["network-online.target"];
      wants = ["network-online.target"];

      serviceConfig = {
        Type = "oneshot";
        User = cfg.user;
        ExecStart = "${pkgs.bash}/bin/bash ${refreshScript}";
        TimeoutStartSec = "2h";
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
  };
}
