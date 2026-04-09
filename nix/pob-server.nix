{
  config,
  pkgs,
  lib,
  ...
}: let
  cfg = config.services.savecraftPobServer;

  pobSrc = pkgs.fetchFromGitHub {
    owner = "PathOfBuildingCommunity";
    repo = "PathOfBuilding";
    rev = "d126ab7dc269aaf8371430ad2238e0c8041357e3";
    hash = "sha256-KZSwLT/nIglOjwp4Ddho4Jup0sH1a0SdIrMSWu4CiqE=";
  };

  # Build the pob-server binary from the savecraft repo.
  buildScript = pkgs.writeShellScript "pob-server-build" ''
    set -euo pipefail
    cd ${lib.escapeShellArg cfg.repoPath}
    exec ${pkgs.nix}/bin/nix develop --no-pure-eval \
      --command ${pkgs.go}/bin/go build \
      -o /var/lib/pob-server/pob-server \
      ./cmd/pob-server/
  '';

  # Run the pob-server binary.
  runScript = pkgs.writeShellScript "pob-server-run" ''
    set -euo pipefail

    # Read API key from file if provided.
    export POB_API_KEY=""
    ${lib.optionalString (cfg.apiKeyFile != null) ''
      POB_API_KEY="$(cat ${lib.escapeShellArg cfg.apiKeyFile})"
    ''}

    exec /var/lib/pob-server/pob-server \
      -pob-dir ${pobSrc}/src \
      -wrapper ${lib.escapeShellArg cfg.repoPath}/cmd/pob-server/wrapper.lua \
      -luajit ${pkgs.luajit}/bin/luajit \
      -port ${toString cfg.port} \
      -pool-size ${toString cfg.poolSize} \
      -idle-timeout ${cfg.idleTimeout}
  '';
in {
  options.services.savecraftPobServer = {
    enable = lib.mkEnableOption "PoB calc server (headless Path of Building via LuaJIT)";

    repoPath = lib.mkOption {
      type = lib.types.str;
      default = "/home/joshsymonds/Personal/savecraft.gg";
      description = "Path to the savecraft.gg repository checkout.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8077;
      description = "HTTP listen port.";
    };

    apiKeyFile = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = "Path to file containing the API key (e.g. agenix secret). Null disables auth.";
    };

    poolSize = lib.mkOption {
      type = lib.types.int;
      default = 4;
      description = "Maximum number of concurrent LuaJIT PoB processes.";
    };

    idleTimeout = lib.mkOption {
      type = lib.types.str;
      default = "5m";
      description = "Kill idle LuaJIT processes after this duration (Go duration string).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "joshsymonds";
      description = "User to run the service as.";
    };
  };

  config = lib.mkIf cfg.enable {
    # Ensure LuaJIT is available
    environment.systemPackages = [pkgs.luajit];

    systemd.tmpfiles.rules = [
      "d /var/lib/pob-server 0755 ${cfg.user} ${cfg.user} -"
    ];

    systemd.services.pob-server = {
      description = "PoB Calc Server (headless Path of Building)";
      after = ["network-online.target"];
      wants = ["network-online.target"];
      wantedBy = ["multi-user.target"];

      serviceConfig = {
        Type = "simple";
        User = cfg.user;
        Restart = "always";
        RestartSec = "5s";

        # Build the binary before starting (idempotent, fast if unchanged).
        ExecStartPre = "${pkgs.bash}/bin/bash ${buildScript}";
        ExecStart = "${pkgs.bash}/bin/bash ${runScript}";

        # Working directory for the Go build
        WorkingDirectory = cfg.repoPath;

        Environment = [
          "HOME=/home/${cfg.user}"
          "PATH=${lib.makeBinPath [pkgs.bash pkgs.coreutils pkgs.git pkgs.nix pkgs.go pkgs.luajit]}:/home/${cfg.user}/.nix-profile/bin"
        ];

        # Security hardening
        PrivateTmp = true;
        NoNewPrivileges = true;
      };
    };
  };
}
