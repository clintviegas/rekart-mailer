import { cn } from "@/lib/utils";

const REKART_LOGO = "/rekart-logo.png";

interface LogoProps {
  collapsed?: boolean;
  className?: string;
}

export function Logo({ collapsed = false, className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-0 min-w-0", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={REKART_LOGO}
        alt="Rekart"
        className={cn(
          "shrink-0 object-contain object-left block",
          collapsed ? "h-7 w-7" : "h-8 w-auto max-w-[96px] -mr-1",
        )}
      />
      {!collapsed && (
        <span className="-ml-1 truncate text-[15px] font-semibold tracking-tight text-foreground">
          <span className="text-primary">Mailer</span>
        </span>
      )}
    </div>
  );
}
