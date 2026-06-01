export const ROUTES = {
  // Auth
  LOGIN: "/login",
  SIGNUP: "/signup",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",

  // Dashboard
  DASHBOARD: "/dashboard",

  // Campaigns
  CAMPAIGNS: "/campaigns",
  CAMPAIGNS_NEW: "/campaigns/new",
  CAMPAIGN_DETAIL: (id: string) => `/campaigns/${id}`,

  // Templates
  TEMPLATES: "/templates",
  TEMPLATES_NEW: "/templates/new",
  TEMPLATE_DETAIL: (id: string) => `/templates/${id}`,

  // Analytics
  ANALYTICS: "/analytics",

  // Sell
  SELL: "/dashboard/sell",
  SELL_OVERVIEW: "/dashboard/sell/overview",
  SELL_DETAIL: (id: string) => `/dashboard/sell/${id}`,
  SELL_DESIGN: "/dashboard/sell/design",
  SELL_ANALYTICS: "/dashboard/sell/analytics",

  // Repair
  REPAIR: "/dashboard/repair",
  REPAIR_OVERVIEW: "/dashboard/repair/overview",
  REPAIR_DETAIL: (id: string) => `/dashboard/repair/${id}`,
  REPAIR_DESIGN: "/dashboard/repair/design",
  REPAIR_ANALYTICS: "/dashboard/repair/analytics",

  // Rent
  RENT: "/dashboard/rent",
  RENT_OVERVIEW: "/dashboard/rent/overview",
  RENT_DETAIL: (id: string) => `/dashboard/rent/${id}`,
  RENT_DESIGN: "/dashboard/rent/design",
  RENT_ANALYTICS: "/dashboard/rent/analytics",

  // Recycle
  RECYCLE: "/dashboard/recycle",
  RECYCLE_OVERVIEW: "/dashboard/recycle/overview",
  RECYCLE_DETAIL: (id: string) => `/dashboard/recycle/${id}`,
  RECYCLE_DESIGN: "/dashboard/recycle/design",
  RECYCLE_ANALYTICS: "/dashboard/recycle/analytics",

  // Contacts
  CONTACTS: "/contacts",
  CONTACTS_IMPORT: "/contacts/import",

  // Settings
  SETTINGS: "/settings",
  SETTINGS_BRANDING: "/settings/branding",
  SETTINGS_PROFILE: "/settings/profile",
  SETTINGS_WORKSPACE: "/settings/workspace",
  SETTINGS_BILLING: "/settings/billing",
  SETTINGS_API: "/settings/api",
  SETTINGS_TEAM: "/settings/team",
  SETTINGS_INTEGRATIONS: "/settings/integrations",

  // Workspace
  WORKSPACE: "/workspace",
} as const;
