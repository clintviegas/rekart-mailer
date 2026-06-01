import {
  LayoutDashboard,
  Settings,
  ShoppingBag,
  Palette,
  BarChart3,
  LineChart,
  Wrench,
  KeyRound,
  Recycle,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

export interface NavService {
  id: string;
  title: string;
  icon: LucideIcon;
  items: NavItem[];
}

export interface NavGroup {
  label?: string;
  items?: NavItem[];
  services?: NavService[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      {
        title: "Dashboard",
        href: ROUTES.DASHBOARD,
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: "Services",
    services: [
      {
        id: "sell",
        title: "Sell",
        icon: ShoppingBag,
        items: [
          {
            title: "Overview",
            href: ROUTES.SELL_OVERVIEW,
            icon: BarChart3,
          },
          {
            title: "Requests",
            href: ROUTES.SELL,
            icon: ShoppingBag,
          },
          {
            title: "Analytics",
            href: ROUTES.SELL_ANALYTICS,
            icon: LineChart,
          },
          {
            title: "Email Design",
            href: ROUTES.SELL_DESIGN,
            icon: Palette,
          },
        ],
      },
      {
        id: "repair",
        title: "Repair",
        icon: Wrench,
        items: [
          {
            title: "Overview",
            href: ROUTES.REPAIR_OVERVIEW,
            icon: BarChart3,
          },
          {
            title: "Requests",
            href: ROUTES.REPAIR,
            icon: Wrench,
          },
          {
            title: "Analytics",
            href: ROUTES.REPAIR_ANALYTICS,
            icon: LineChart,
          },
          {
            title: "Email Design",
            href: ROUTES.REPAIR_DESIGN,
            icon: Palette,
          },
        ],
      },
      {
        id: "rent",
        title: "Rent",
        icon: KeyRound,
        items: [
          {
            title: "Overview",
            href: ROUTES.RENT_OVERVIEW,
            icon: BarChart3,
          },
          {
            title: "Requests",
            href: ROUTES.RENT,
            icon: KeyRound,
          },
          {
            title: "Analytics",
            href: ROUTES.RENT_ANALYTICS,
            icon: LineChart,
          },
          {
            title: "Email Design",
            href: ROUTES.RENT_DESIGN,
            icon: Palette,
          },
        ],
      },
      {
        id: "recycle",
        title: "Recycle",
        icon: Recycle,
        items: [
          {
            title: "Overview",
            href: ROUTES.RECYCLE_OVERVIEW,
            icon: BarChart3,
          },
          {
            title: "Requests",
            href: ROUTES.RECYCLE,
            icon: Recycle,
          },
          {
            title: "Analytics",
            href: ROUTES.RECYCLE_ANALYTICS,
            icon: LineChart,
          },
          {
            title: "Email Design",
            href: ROUTES.RECYCLE_DESIGN,
            icon: Palette,
          },
        ],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        title: "Settings",
        href: ROUTES.SETTINGS,
        icon: Settings,
      },
    ],
  },
];

export function getAllNavHrefs(groups: NavGroup[] = NAV_GROUPS): string[] {
  return groups.flatMap((group) => [
    ...(group.items?.map((item) => item.href) ?? []),
    ...(group.services?.flatMap((service) =>
      service.items.map((item) => item.href)
    ) ?? []),
  ]);
}
