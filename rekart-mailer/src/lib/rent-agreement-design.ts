/** Rekart rent agreement — matches email header (#398ff7) + light blue body tints. */
export const RENT_AGREEMENT_COLORS = {
  topBar: "#398ff7",
  topBarDark: "#2d7fe0",
  lightBg: "#eff6ff",
  lightBgAlt: "#f8fbff",
  lightBorder: "#bfdbfe",
  pageBg: "#eef6ff",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#398ff7",
  signedBg: "#ecfdf5",
  signedBorder: "#6ee7b7",
  white: "#ffffff",
} as const;

export const REKART_LOGO_PATH = "/rekart-logo.png";

export async function resolveRekartLogoDataUri(): Promise<string> {
  if (typeof window === "undefined") return REKART_LOGO_PATH;

  try {
    const res = await fetch(REKART_LOGO_PATH, { cache: "force-cache" });
    if (!res.ok) return `${window.location.origin}${REKART_LOGO_PATH}`;
    const blob = await res.blob();
    const dataUri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("logo read failed"));
      reader.readAsDataURL(blob);
    });
    return dataUri || `${window.location.origin}${REKART_LOGO_PATH}`;
  } catch {
    return `${window.location.origin}${REKART_LOGO_PATH}`;
  }
}
