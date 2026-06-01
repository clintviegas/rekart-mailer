"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const REKART_LOGO_SRC = "/rekart-logo.png";

export function CustomerRekartLogo({
  className,
  variant = "default",
  size = "md",
}: {
  className?: string;
  variant?: "default" | "onDark";
  size?: "sm" | "md" | "lg";
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const onDark = variant === "onDark";
  const imgSize =
    size === "lg"
      ? "h-12 max-w-[188px]"
      : size === "md"
        ? "h-11 max-w-[168px]"
        : "h-9 max-w-[140px]";

  if (imgFailed) {
    return (
      <div className={cn(onDark ? "text-left" : "text-center", className)}>
        <span className={cn("font-bold tracking-tight", size === "lg" ? "text-[28px]" : size === "md" ? "text-[26px]" : "text-2xl")}>
          <span className={onDark ? "text-white" : "text-sky-400"}>R</span>
          <span className={onDark ? "text-white" : "text-[#0f172a]"}>ekart</span>
        </span>
      </div>
    );
  }

  return (
    <div className={cn(onDark ? "text-left" : "text-center", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={REKART_LOGO_SRC}
        alt="Rekart"
        className={cn(
          "block w-auto object-contain object-left",
          imgSize,
          !onDark && "mx-auto",
          onDark && "brightness-0 invert",
        )}
        onError={() => setImgFailed(true)}
      />
    </div>
  );
}
