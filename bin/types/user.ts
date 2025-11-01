export interface Beneficts {
  instances: {
    private: number;
    public?: number | null;
    testing?: number | null;
  };
  smPlayers: number;
  organizationSpaces?: number | null;
  dashboard: {
    roles: boolean;
    advanced: boolean;
    analytics: {
      enable: boolean;
      type: "basic" | "advanced";
    };
    backups: {
      enable: boolean;
      amount: number;
    };
  };
  launcher: {
    discord: "full" | "limited" | "none";
    assets: boolean;
  };
  additionals: {
    marketplace: boolean;
    iSell: boolean;
    cloudflare: boolean;
  };
}
