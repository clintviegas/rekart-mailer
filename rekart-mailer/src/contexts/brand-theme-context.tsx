"use client";

import React, { createContext, useContext } from "react";
import {
  type BrandTheme,
  DEFAULT_BRAND_THEME,
  getHeaderBg,
  lightenColor,
} from "@/services/workspace.service";

export type { BrandTheme };
export { DEFAULT_BRAND_THEME, getHeaderBg, lightenColor };

const BrandThemeContext = createContext<BrandTheme>(DEFAULT_BRAND_THEME);

export function BrandThemeProvider({
  theme,
  children,
}: {
  theme: BrandTheme;
  children: React.ReactNode;
}) {
  return (
    <BrandThemeContext.Provider value={theme}>
      {children}
    </BrandThemeContext.Provider>
  );
}

export function useBrandTheme(): BrandTheme {
  return useContext(BrandThemeContext);
}
