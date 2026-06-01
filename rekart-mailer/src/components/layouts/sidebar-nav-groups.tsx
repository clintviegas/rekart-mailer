"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NAV_GROUPS,
  getAllNavHrefs,
  type NavGroup,
  type NavItem,
  type NavService,
} from "./sidebar-items";

interface SidebarNavGroupsProps {
  sidebarCollapsed?: boolean;
  onNavigate?: () => void;
}

export function SidebarNavGroups({
  sidebarCollapsed = false,
  onNavigate,
}: SidebarNavGroupsProps) {
  const pathname = usePathname();
  const [expandedServices, setExpandedServices] = useState<Set<string>>(
    () => new Set()
  );

  const bestMatch = useMemo(() => {
    const allHrefs = getAllNavHrefs();
    return (
      allHrefs
        .filter(
          (h) =>
            (h !== "/dashboard" && pathname.startsWith(h)) || pathname === h
        )
        .sort((a, b) => b.length - a.length)[0] ?? null
    );
  }, [pathname]);

  const setServiceExpanded = (serviceId: string, open: boolean) => {
    setExpandedServices((prev) => {
      const next = new Set(prev);
      if (open) next.add(serviceId);
      else next.delete(serviceId);
      return next;
    });
  };

  const renderNavItem = (item: NavItem, tooltipPrefix?: string) => {
    const isActive = item.href === bestMatch || pathname === item.href;
    const Icon = item.icon;
    const tooltipLabel = tooltipPrefix
      ? `${tooltipPrefix} · ${item.title}`
      : item.title;

    if (sidebarCollapsed) {
      return (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              />
            }
          >
            <Icon className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {tooltipLabel}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 truncate">{item.title}</span>
        {item.badge !== undefined && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-tight",
              isActive
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );
  };

  const renderService = (service: NavService) => {
    const expanded = expandedServices.has(service.id);
    const ServiceIcon = service.icon;

    if (sidebarCollapsed) {
      return (
        <ul key={service.id} className="space-y-0.5">
          {service.items.map((item) => (
            <li key={item.href}>
              {renderNavItem(item, service.title)}
            </li>
          ))}
        </ul>
      );
    }

    return (
      <Collapsible
        key={service.id}
        open={expanded}
        onOpenChange={(open) => setServiceExpanded(service.id, open)}
      >
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <ServiceIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate text-left">{service.title}</span>
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200",
              expanded && "rotate-180"
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden">
          <ul className="ml-3 space-y-0.5 border-l border-border pl-2">
            {service.items.map((item) => (
              <li key={item.href}>{renderNavItem(item)}</li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  const renderGroup = (group: NavGroup, gi: number) => {
    const groupKey = group.label ?? String(gi);

    if (group.services?.length) {
      return (
        <div key={groupKey}>
          {group.label && !sidebarCollapsed && (
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
          )}
          {group.label && sidebarCollapsed && (
            <div className="mb-1.5 h-px bg-border" />
          )}
          <div className="space-y-0.5">
            {group.services.map(renderService)}
          </div>
        </div>
      );
    }

    return (
      <div key={groupKey}>
        {group.label && !sidebarCollapsed && (
          <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </p>
        )}
        {group.label && sidebarCollapsed && (
          <div className="mb-1.5 h-px bg-border" />
        )}
        <ul className="space-y-0.5">
          {group.items?.map((item) => (
            <li key={item.href}>{renderNavItem(item)}</li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <nav className="space-y-4 pb-2">
      {NAV_GROUPS.map(renderGroup)}
    </nav>
  );
}
