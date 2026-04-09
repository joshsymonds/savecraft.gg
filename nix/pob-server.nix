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
in {
  options.services.savecraftPobServer = {
    enable = lib.mkEnableOption "PoB calc server (headless Path of Building via LuaJIT)";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The pob-server package to use. Set this to the flake's packages.\${system}.pob-server.";
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
  };

  config = lib.mkIf cfg.enable {
    # Ensure LuaJIT is available
    environment.systemPackages = [pkgs.luajit];

    # Dedicated low-privilege user for the PoB service.
    # Untrusted build codes are processed by PoB's Lua codebase,
    # so the service should not run as a personal user.
    users.users.pob-server = {
      isSystemUser = true;
      group = "pob-server";
      home = "/var/lib/pob-server";
      createHome = true;
    };
    users.groups.pob-server = {};

    systemd.tmpfiles.rules = [
      "d /var/lib/pob-server 0755 pob-server pob-server -"
    ];

    systemd.services.pob-server = {
      description = "PoB Calc Server (headless Path of Building)";
      after = ["network-online.target"];
      wants = ["network-online.target"];
      wantedBy = ["multi-user.target"];

      serviceConfig = {
        Type = "simple";
        User = "pob-server";
        Group = "pob-server";
        Restart = "always";
        RestartSec = "5s";

        ExecStart = let
          runScript = pkgs.writeShellScript "pob-server-run" ''
            set -euo pipefail
            ${lib.optionalString (cfg.apiKeyFile != null) ''
              export POB_API_KEY="$(cat ${lib.escapeShellArg cfg.apiKeyFile})"
            ''}
            exec ${cfg.package}/bin/pob-server \
              -pob-dir ${pobSrc}/src \
              -wrapper ${cfg.package}/share/pob-server/wrapper.lua \
              -luajit ${pkgs.luajit}/bin/luajit \
              -port ${toString cfg.port} \
              -pool-size ${toString cfg.poolSize} \
              -idle-timeout ${cfg.idleTimeout}
          '';
        in "${pkgs.bash}/bin/bash ${runScript}";

        WorkingDirectory = "/var/lib/pob-server";

        Environment = [
          "HOME=/var/lib/pob-server"
          "PATH=${lib.makeBinPath [pkgs.bash pkgs.coreutils pkgs.luajit]}"
        ];

        # Security hardening — process untrusted PoB build codes safely
        PrivateTmp = true;
        NoNewPrivileges = true;
        ProtectHome = true;
        ProtectSystem = "strict";
        ReadOnlyPaths = [
          "${pobSrc}"
        ];
        ReadWritePaths = ["/var/lib/pob-server"];
        PrivateDevices = true;
        RestrictRealtime = true;
      };
    };
  };
}
