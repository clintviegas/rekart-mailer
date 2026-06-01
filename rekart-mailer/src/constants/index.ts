export const APP_NAME = "Rekart Mailer";
export const APP_DESCRIPTION = "Premium SaaS Email Automation Platform";

export const QUERY_KEYS = {
  USER: ["user"],
  CAMPAIGNS: ["campaigns"],
  CAMPAIGN: (id: string) => ["campaigns", id],
  TEMPLATES: ["templates"],
  TEMPLATE: (id: string) => ["templates", id],
  ANALYTICS: ["analytics"],
  ANALYTICS_OVERVIEW: ["analytics", "overview"],
  CONTACTS: ["contacts"],
  WORKSPACE: ["workspace"],
  WORKSPACES: ["workspaces"],
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
} as const;

export const TOAST_DURATION = 4000;
