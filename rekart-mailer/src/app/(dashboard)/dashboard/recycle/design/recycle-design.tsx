"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Palette, Type, Square, Layout, AlignLeft,
  Globe, ShieldCheck, Loader2, Save, RotateCcw, Upload,
  X, CheckCircle2, Info, ExternalLink, Link2, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useWorkspaceBranding,
  useUpdateBranding,
  useUploadLogo,
  useRemoveLogo,
} from "@/hooks/use-workspace-branding";
import {
  DEFAULT_BRANDING,
  getBrandingValue,
  resolveFooterAddress,
  SUPPORTED_FONTS,
  type WorkspaceBranding,
} from "@/services/workspace.service";
import { BusinessLocationsSettings } from "@/components/shared/business-locations-settings";

// ── Section types ─────────────────────────────────────────────────────────────

type Section =
  | "identity"
  | "colors"
  | "typography"
  | "buttons"
  | "layout"
  | "footer"
  | "compliance"
  | "social"
  | "locations";

interface SectionMeta {
  id: Section;
  label: string;
  icon: React.ElementType;
  hint: string;
}

const SECTIONS: SectionMeta[] = [
  { id: "identity",   label: "Identity",    icon: Building2,  hint: "Logo, name, website" },
  { id: "colors",     label: "Colors",      icon: Palette,    hint: "Brand & email colors" },
  { id: "typography", label: "Typography",  icon: Type,       hint: "Fonts & text sizes" },
  { id: "buttons",    label: "Buttons",     icon: Square,     hint: "CTA button style" },
  { id: "layout",     label: "Layout",      icon: Layout,     hint: "Width & spacing" },
  { id: "footer",     label: "Footer",      icon: AlignLeft,  hint: "Sign-off & copyright" },
  { id: "compliance", label: "Compliance",  icon: ShieldCheck,hint: "Legal strip & colors" },
  { id: "social",     label: "Legal & Social", icon: Globe,   hint: "URLs & social links" },
  { id: "locations",  label: "Locations",   icon: MapPin,   hint: "Pickup & store addresses" },
];

// ── Reusable field primitives ─────────────────────────────────────────────────

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
      {hint && <p className="text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function ColorRow({
  label, hint, value, onChange,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <input
        type="color"
        value={isValid ? value : "#000000"}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-medium text-foreground">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v); }}
        className="w-[82px] rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        maxLength={7}
      />
    </div>
  );
}

function FontSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {SUPPORTED_FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
    </div>
  );
}

function NumInput({
  label, value, onChange, unit = "px", min = 0, max = 999, hint,
}: { label: string; value: string; onChange: (v: string) => void; unit?: string; min?: number; max?: number; hint?: string }) {
  const num = parseInt(value, 10) || 0;
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={num}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 accent-primary"
        />
        <div className="flex w-20 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background px-2 py-1.5">
          <input type="number" min={min} max={max} value={num}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 bg-transparent text-[12px] text-foreground focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function WeightSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
        {[["Regular (400)","400"],["Medium (500)","500"],["Semi-bold (600)","600"],["Bold (700)","700"],["Extra-bold (800)","800"]].map(([lbl,val]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </div>
  );
}

// ── Live Email Preview ────────────────────────────────────────────────────────

function LiveEmailPreview({ d }: { d: WorkspaceBranding }) {
  const primary    = d.primaryColor         || DEFAULT_BRANDING.primaryColor;
  const secondary  = d.secondaryColor       || DEFAULT_BRANDING.secondaryColor;
  const bodyText   = d.bodyTextColor        || DEFAULT_BRANDING.bodyTextColor;
  const headerText = d.headerTextColor      || DEFAULT_BRANDING.headerTextColor;
  const btnText    = d.buttonTextColor      || DEFAULT_BRANDING.buttonTextColor;
  const emailBg    = d.emailBackgroundColor || DEFAULT_BRANDING.emailBackgroundColor;
  const cardBg     = d.cardBackgroundColor  || DEFAULT_BRANDING.cardBackgroundColor;
  const border     = d.borderColor          || DEFAULT_BRANDING.borderColor;
  const headFont   = d.headingFontFamily    || "Inter";
  const bodyFont   = d.bodyFontFamily       || "Inter";
  const headSz     = parseInt(d.headingFontSize   || "18", 10);
  const bodySz     = parseInt(d.bodyFontSize      || "14", 10);
  const btnRadius  = parseInt(d.buttonRadius      || "8",  10);
  const cardRadius = parseInt(d.cardRadius        || "12", 10);
  const btnStyle   = d.buttonStyle          || "solid";
  const mode       = d.brandMode            || "default";
  const footerClr  = d.footerTextColor      || DEFAULT_BRANDING.footerTextColor;
  const greeting   = d.footerGreetingText   || "Warm regards,";
  const copyright  = d.copyrightText        || `© ${new Date().getFullYear()} ${d.companyName || "Your Company"}`;
  const footerNote = d.footerNote           || "";
  const compliance = (d.complianceText || "You are receiving this email because you submitted an e-waste recycling request on our platform.")
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{workspaceName\}\}/g, d.companyName || "Your Company");
  const compBg     = d.complianceBgColor    || "#f8fafc";
  const compClr    = d.complianceTextColor  || "#94a3b8";

  const headerBg = mode === "gradient"
    ? `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
    : primary;

  let btnBg: string, btnClr: string, btnBdr: string;
  if (btnStyle === "outline") { btnBg = "transparent"; btnClr = primary; btnBdr = `2px solid ${primary}`; }
  else if (btnStyle === "soft") { btnBg = `${primary}20`; btnClr = primary; btnBdr = "none"; }
  else { btnBg = primary; btnClr = btnText; btnBdr = "none"; }

  return (
    <div className="w-full overflow-auto rounded-xl border border-border shadow-sm">
      {/* Email wrapper */}
      <div style={{ backgroundColor: emailBg }} className="p-4">
        <div style={{ backgroundColor: cardBg, borderRadius: `${cardRadius}px`, overflow: "hidden", maxWidth: 480, margin: "0 auto", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>

          {/* Header */}
          <div style={{ background: headerBg, padding: "20px 28px", textAlign: "center" }}>
            {d.logoUrl ? (
              <img src={d.logoUrl} alt="logo" style={{ maxHeight: 36, maxWidth: 140, margin: "0 auto 8px", display: "block", objectFit: "contain" }} />
            ) : (
              <div style={{ color: headerText, fontFamily: headFont, fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
                {d.companyName || "Your Company"}
              </div>
            )}
            <div style={{ display: "inline-block", backgroundColor: "rgba(255,255,255,0.18)", color: headerText, fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.8px" }}>
              RECYCLE REQUEST
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: "20px 24px", backgroundColor: cardBg }}>
            <p style={{ fontFamily: headFont, fontSize: headSz * 0.75, fontWeight: parseInt(d.headingFontWeight || "600"), color: "#0f172a", marginBottom: 8, lineHeight: 1.3 }}>
              Hi Rahul, confirm your e-waste pickup request
            </p>
            <p style={{ fontFamily: bodyFont, fontSize: bodySz * 0.9, color: bodyText, lineHeight: parseFloat(d.lineHeight || "1.65"), marginBottom: 14 }}>
              Please review the items below and confirm pickup so we can schedule collection from your location.
            </p>

            {/* Items highlight */}
            <div style={{ backgroundColor: `${primary}12`, border: `1px solid ${primary}35`, borderRadius: 10, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: primary, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4 }}>Items to recycle</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", lineHeight: 1.4 }}>MacBook Pro ×1, Dell Monitor ×2</div>
              <div style={{ fontSize: 10, color: bodyText, marginTop: 4 }}>Pickup: Business Bay, Dubai · Request ID: RKRC47914</div>
            </div>

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 14 }}>
              <div style={{ padding: "9px 18px", borderRadius: `${btnRadius}px`, backgroundColor: "#16a34a", color: "#ffffff", fontSize: 12, fontWeight: 700 }}>
                ✓ Confirm Pickup
              </div>
              <div style={{ padding: "9px 18px", borderRadius: `${btnRadius}px`, backgroundColor: btnBg, color: btnClr, border: btnBdr, fontSize: 12, fontWeight: 600 }}>
                ✗ Decline
              </div>
            </div>

            {/* Info table */}
            <div style={{ backgroundColor: "#f8fafc", border: `1px solid ${border}`, borderRadius: 8, overflow: "hidden", fontSize: 11 }}>
              <div style={{ backgroundColor: "#f1f5f9", padding: "6px 12px", color: "#64748b", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${border}` }}>
                Request Details
              </div>
              {[["Request ID", "RKRC47914"], ["Mode", "Known items"], ["Est. items", "3 devices"], ["Notes", "Ground floor reception"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 12px", borderBottom: `1px solid #f1f5f9` }}>
                  <span style={{ color: "#64748b" }}>{k}</span>
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${border}`, backgroundColor: "#f8fafc", textAlign: "center" }}>
            <p style={{ fontFamily: bodyFont, fontSize: 11, color: footerClr, lineHeight: 1.8, margin: "0 0 4px" }}>
              {greeting}<br />
              <strong>{d.teamDisplayName || d.companyName || "Support Team"}</strong>
            </p>
            {footerNote && (
              <p style={{ fontSize: 10, color: footerClr, fontStyle: "italic", marginBottom: 4 }}>{footerNote}</p>
            )}
            <p style={{ fontSize: 9, color: "#94a3b8", margin: "2px 0", whiteSpace: "pre-line" }}>
              📍 {resolveFooterAddress(d.footerAddress)}
            </p>
            <p style={{ fontSize: 10, color: primary, margin: "4px 0 2px" }}>
              Privacy Policy · Terms of Service · Support
            </p>
            <p style={{ fontSize: 9, color: "#94a3b8" }}>{copyright}</p>
          </div>

          {/* Compliance strip */}
          <div style={{ padding: "8px 24px", backgroundColor: compBg, textAlign: "center" }}>
            <p style={{ fontSize: 9, color: compClr, margin: 0, lineHeight: 1.6 }}>{compliance}</p>
            <p style={{ fontSize: 9, color: primary, margin: "3px 0 0" }}>Unsubscribe</p>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Social platform list ──────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { key: "facebook",  label: "Facebook",   placeholder: "https://facebook.com/rekartuae" },
  { key: "instagram", label: "Instagram",    placeholder: "https://instagram.com/rekartuae" },
  { key: "tiktok",    label: "TikTok",       placeholder: "https://www.tiktok.com/@rekartuae" },
  { key: "whatsapp",  label: "WhatsApp",     placeholder: "https://wa.me/+971585962788" },
  { key: "twitter",   label: "Twitter / X",  placeholder: "https://twitter.com/yourcompany" },
  { key: "linkedin",  label: "LinkedIn",      placeholder: "https://linkedin.com/company/yourcompany" },
  { key: "youtube",   label: "YouTube",       placeholder: "https://youtube.com/@yourcompany" },
] as const;

// ── Main unified component ────────────────────────────────────────────────────

export function RecycleDesignClient() {
  const { data: branding, isLoading } = useWorkspaceBranding();
  const { mutate: updateBranding, isPending: saving } = useUpdateBranding();
  const { mutate: uploadLogo,     isPending: uploading } = useUploadLogo();
  const { mutate: removeLogo,     isPending: removing }  = useRemoveLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const [active, setActive] = useState<Section>("identity");
  const [local, setLocal]   = useState<Partial<WorkspaceBranding>>({});
  const [saved, setSaved]   = useState(false);

  // Extra state for fields not in WorkspaceBranding key list (string arrays / objects)
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>({});

  const isDirty = Object.keys(local).length > 0;

  // Merged: local overrides server, server overrides defaults
  const merged: WorkspaceBranding = { ...branding, ...local, socialLinks };

  useEffect(() => {
    if (!branding) return;
    setSocialLinks(branding.socialLinks ?? {});
  }, [branding]);

  function get<K extends keyof WorkspaceBranding>(key: K): string {
    const v = merged[key];
    if (v !== undefined && v !== null) return String(v);
    return (getBrandingValue(branding, key as keyof typeof DEFAULT_BRANDING) as string) || "";
  }

  function set(key: keyof WorkspaceBranding, value: string) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function setSocial(key: string, value: string) {
    setSocialLinks((prev) => ({ ...prev, [key]: value }));
    setLocal((prev) => ({ ...prev })); // mark dirty
  }

  function handleSave() {
    updateBranding(
      { ...local, socialLinks },
      {
        onSuccess: () => {
          setLocal({});
          setSaved(true);
          toast.success("Design settings saved!");
          setTimeout(() => setSaved(false), 3000);
        },
        onError: () => toast.error("Failed to save"),
      },
    );
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo(file, {
      onSuccess: () => toast.success("Logo updated"),
      onError:   () => toast.error("Upload failed"),
    });
    e.target.value = "";
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Palette className="size-4 text-primary" />
            </div>
            <div>
              <h1 className="text-[14px] font-bold text-foreground leading-tight">Recycle Email Design</h1>
              <p className="text-[10px] text-muted-foreground">Branding · colors · typography · footer — all Recycle emails update automatically</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setLocal({})}>
                <RotateCcw className="size-3" /> Discard
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || (!isDirty && !saved)}
              className={cn("h-7 gap-1.5 text-xs min-w-[90px]", saved && "bg-emerald-600 hover:bg-emerald-700")}
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : saved ? <CheckCircle2 className="size-3" /> : <Save className="size-3" />}
              {saving ? "Saving…" : saved ? "Saved!" : "Save"}
            </Button>
          </div>
        </div>

        {/* Info strip */}
        <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-blue-200/60 bg-blue-50/60 dark:border-blue-800/30 dark:bg-blue-950/20 px-3 py-1.5">
          <Info className="size-3 shrink-0 text-blue-500" />
          <p className="text-[10px] text-blue-700 dark:text-blue-300">
            Changes here apply to all Recycle workflow emails in real-time. The preview on the right updates as you type.
          </p>
        </div>
      </div>

      {/* ── Body: left panel + right preview ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: section nav + form ─────────────────────────────────────── */}
        <div className="flex w-[400px] shrink-0 flex-col border-r border-border overflow-hidden">

          {/* Section nav — 2-col grid, always fully visible */}
          <div className="shrink-0 border-b border-border bg-muted/30 p-2">
            <div className="grid grid-cols-4 gap-1">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActive(id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition-all",
                    active === id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn("text-[10px] font-semibold leading-tight", active === id ? "text-primary-foreground" : "text-foreground")}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Active section label */}
          <div className="shrink-0 border-b border-border bg-card px-4 py-2">
            {(() => {
              const s = SECTIONS.find((s) => s.id === active)!;
              const Icon = s.icon;
              return (
                <div className="flex items-center gap-2">
                  <Icon className="size-3.5 text-primary" />
                  <span className="text-[12px] font-bold text-foreground">{s.label}</span>
                  <span className="text-[11px] text-muted-foreground">— {s.hint}</span>
                </div>
              );
            })()}
          </div>

          {/* Form area */}
          <div
            className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border p-4"
            data-dashboard-primary-scroll=""
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >

                {/* ── IDENTITY ── */}
                {active === "identity" && (
                  <>
                    {/* Logo */}
                    <div>
                      <FieldLabel hint="PNG, JPG, SVG. Best at 200×60px — shown at top of every email">Company Logo</FieldLabel>
                      <div className="flex items-center gap-3">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
                          {branding?.logoUrl ? (
                            <img src={branding.logoUrl} alt="logo" className="size-full object-contain p-1" />
                          ) : (
                            <Building2 className="size-6 text-muted-foreground/40" />
                          )}
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                            {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                            {uploading ? "Uploading…" : branding?.logoUrl ? "Change" : "Upload"}
                          </Button>
                          {branding?.logoUrl && (
                            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground" disabled={removing}
                              onClick={() => removeLogo(undefined, { onSuccess: () => toast.success("Logo removed") })}>
                              {removing ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoChange} />
                    </div>

                    <Separator />

                    <div>
                      <FieldLabel hint="Used in email subject lines and headers">Company Name</FieldLabel>
                      <Input placeholder="Rekart Electronics" value={get("companyName")} onChange={(e) => set("companyName", e.target.value)} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <FieldLabel hint='Shown in email sign-offs (e.g. "The Rekart Team")'>Team Display Name</FieldLabel>
                      <Input placeholder="The Rekart Team" value={get("teamDisplayName")} onChange={(e) => set("teamDisplayName", e.target.value)} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <FieldLabel>Website URL</FieldLabel>
                      <Input type="url" placeholder="https://rekart.com" value={get("website")} onChange={(e) => set("website", e.target.value)} className="h-9 text-[13px]" />
                    </div>

                    <Separator />
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact Details</p>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Support Email</FieldLabel>
                        <Input type="email" placeholder="support@rekart.com" value={get("supportEmail")} onChange={(e) => set("supportEmail", e.target.value)} className="h-8 text-[12px]" />
                      </div>
                      <div>
                        <FieldLabel>Support Phone</FieldLabel>
                        <Input type="tel" placeholder="+971 50 000 0000" value={get("supportPhone")} onChange={(e) => set("supportPhone", e.target.value)} className="h-8 text-[12px]" />
                      </div>
                    </div>
                    <div>
                      <FieldLabel>Address (shown in footer)</FieldLabel>
                      <Input placeholder="Retake Technologies FZ-LLC — HQ: G01, Boutique Villa 9, Dubai Media City, Dubai" value={get("footerAddress")} onChange={(e) => set("footerAddress", e.target.value)} className="h-9 text-[13px]" />
                    </div>
                  </>
                )}

                {/* ── COLORS ── */}
                {active === "colors" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand</p>
                    <ColorRow label="Primary"   hint="Header bg, buttons, links"         value={get("primaryColor")}   onChange={(v) => set("primaryColor", v)} />
                    <ColorRow label="Secondary" hint="Gradient end, accents"             value={get("secondaryColor")} onChange={(v) => set("secondaryColor", v)} />
                    <ColorRow label="Accent"    hint="Icons, active indicators"          value={get("accentColor")}    onChange={(v) => set("accentColor", v)} />

                    {/* Header mode */}
                    <div>
                      <FieldLabel hint="How the email header background is styled">Header Style</FieldLabel>
                      <div className="grid grid-cols-2 gap-2">
                        {(["default", "gradient"] as const).map((mode) => (
                          <button key={mode} type="button" onClick={() => set("brandMode", mode)}
                            className={cn("rounded-xl border p-3 text-left transition-all text-[12px]",
                              get("brandMode") === mode ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40")}>
                            <div className="font-semibold capitalize">{mode === "default" ? "Solid" : "Gradient"}</div>
                            <div className="text-[10px] opacity-70">{mode === "default" ? "Flat primary color" : "Primary → secondary blend"}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Separator />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Text</p>
                    <ColorRow label="Header Text"  hint="Company name / logo alt text in header" value={get("headerTextColor")} onChange={(v) => set("headerTextColor", v)} />
                    <ColorRow label="Body Text"    hint="Main paragraph text"                    value={get("bodyTextColor")}   onChange={(v) => set("bodyTextColor", v)} />
                    <ColorRow label="Muted Text"   hint="Labels, sub-text, captions"             value={get("mutedTextColor")}  onChange={(v) => set("mutedTextColor", v)} />
                    <ColorRow label="Footer Text"  hint="Sign-off, address text"                 value={get("footerTextColor")} onChange={(v) => set("footerTextColor", v)} />
                    <ColorRow label="Button Text"  hint="Text on primary filled buttons"         value={get("buttonTextColor")} onChange={(v) => set("buttonTextColor", v)} />

                    <Separator />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Backgrounds</p>
                    <ColorRow label="Email Background" hint="Outer wrapper / page bg"            value={get("emailBackgroundColor")} onChange={(v) => set("emailBackgroundColor", v)} />
                    <ColorRow label="Card Background"  hint="Email content card bg"              value={get("cardBackgroundColor")}  onChange={(v) => set("cardBackgroundColor", v)} />
                    <ColorRow label="Border / Divider" hint="Table lines, section dividers"      value={get("borderColor")}          onChange={(v) => set("borderColor", v)} />
                  </>
                )}

                {/* ── TYPOGRAPHY ── */}
                {active === "typography" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <FontSelect label="Heading Font" value={get("headingFontFamily")} onChange={(v) => set("headingFontFamily", v)} />
                      <FontSelect label="Body Font"    value={get("bodyFontFamily")}    onChange={(v) => set("bodyFontFamily", v)} />
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <NumInput label="Heading Size" value={get("headingFontSize")} onChange={(v) => set("headingFontSize", v)} min={12} max={36} />
                      <NumInput label="Body Size"    value={get("bodyFontSize")}    onChange={(v) => set("bodyFontSize", v)}    min={10} max={24} />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Line Height</Label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <input type="range" min={1} max={2.5} step={0.05}
                          value={parseFloat(get("lineHeight") || "1.65")}
                          onChange={(e) => set("lineHeight", e.target.value)}
                          className="flex-1 accent-primary"
                        />
                        <span className="w-12 text-center text-[12px] font-mono text-foreground rounded-md border border-border px-2 py-1">
                          {parseFloat(get("lineHeight") || "1.65").toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <WeightSelect label="Heading Weight" value={get("headingFontWeight")} onChange={(v) => set("headingFontWeight", v)} />
                      <WeightSelect label="Body Weight"    value={get("bodyFontWeight")}    onChange={(v) => set("bodyFontWeight", v)} />
                    </div>
                    {/* Font preview */}
                    <div className="rounded-xl border border-border bg-muted/30 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Font Preview</p>
                      <p style={{ fontFamily: get("headingFontFamily"), fontSize: parseInt(get("headingFontSize")||"18",10)*0.75, fontWeight: parseInt(get("headingFontWeight")||"600") }}>
                        Hi Rahul, confirm your e-waste pickup
                      </p>
                      <p style={{ fontFamily: get("bodyFontFamily"), fontSize: parseInt(get("bodyFontSize")||"14",10)*0.85, fontWeight: parseInt(get("bodyFontWeight")||"400"), color: "#475569", lineHeight: parseFloat(get("lineHeight")||"1.65"), marginTop: 6 }}>
                        Confirm your e-waste pickup — MacBook Pro ×1, Dell Monitor ×2. Business Bay, Dubai.
                      </p>
                    </div>
                  </>
                )}

                {/* ── BUTTONS ── */}
                {active === "buttons" && (
                  <>
                    <div>
                      <FieldLabel hint="How email CTA buttons look">Button Style</FieldLabel>
                      <div className="grid grid-cols-3 gap-2">
                        {(["solid", "outline", "soft"] as const).map((style) => {
                          const p = get("primaryColor") || "#6366f1";
                          const bg  = style === "outline" ? "transparent" : style === "soft" ? `${p}20` : p;
                          const clr = style === "solid" ? (get("buttonTextColor") || "#fff") : p;
                          const bdr = style === "outline" ? `2px solid ${p}` : "none";
                          return (
                            <button key={style} type="button" onClick={() => set("buttonStyle", style)}
                              className={cn("rounded-xl border p-3 text-center transition-all",
                                get("buttonStyle") === style ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                              <div style={{ backgroundColor: bg, color: clr, border: bdr, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, marginBottom: 4, display: "inline-block" }}>
                                Confirm
                              </div>
                              <p className={cn("text-[11px] font-medium capitalize", get("buttonStyle") === style ? "text-primary" : "text-muted-foreground")}>{style}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <Separator />
                    <NumInput label="Button Border Radius" value={get("buttonRadius")} onChange={(v) => set("buttonRadius", v)} min={0} max={50} hint="0 = square, 50 = pill" />
                    <div>
                      <FieldLabel hint="CSS: vertical horizontal — e.g. 13px 28px">Button Padding</FieldLabel>
                      <Input className="h-9 text-[12px] font-mono" placeholder="13px 28px" value={get("buttonPadding")} onChange={(e) => set("buttonPadding", e.target.value)} />
                    </div>
                    <NumInput label="Button Font Size" value={get("buttonFontSize")} onChange={(v) => set("buttonFontSize", v)} min={10} max={20} />
                  </>
                )}

                {/* ── LAYOUT ── */}
                {active === "layout" && (
                  <>
                    <NumInput label="Email Max Width"   value={get("emailWidth")}       onChange={(v) => set("emailWidth", v)}       min={480} max={800} hint="Recommended: 600px" />
                    <NumInput label="Content Padding"   value={get("contentPadding")}   onChange={(v) => set("contentPadding", v)}   min={16}  max={64}  hint="Side padding inside email body" />
                    <NumInput label="Section Spacing"   value={get("sectionSpacing")}   onChange={(v) => set("sectionSpacing", v)}   min={12}  max={48}  hint="Gap between email sections" />
                    <NumInput label="Card Border Radius" value={get("cardRadius")}       onChange={(v) => set("cardRadius", v)}       min={0}   max={32}  hint="Outer email card corners" />
                  </>
                )}

                {/* ── FOOTER ── */}
                {active === "footer" && (
                  <>
                    <div>
                      <FieldLabel hint='Shown before team sign-off e.g. "Warm regards,"'>Footer Greeting</FieldLabel>
                      <Input placeholder="Warm regards," value={get("footerGreetingText")} onChange={(e) => set("footerGreetingText", e.target.value)} className="h-9 text-[13px]" />
                    </div>
                    <div>
                      <FieldLabel hint="Optional italic note shown below sign-off in every email">Footer Note</FieldLabel>
                      <textarea rows={2} placeholder="e.g. Thank you for choosing us!"
                        value={get("footerNote")} onChange={(e) => set("footerNote", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                      <FieldLabel hint={`Supports {{year}} · blank = auto: © ${new Date().getFullYear()} {company}`}>Copyright Text</FieldLabel>
                      <Input
                        placeholder={`© ${new Date().getFullYear()} Your Company. All rights reserved.`}
                        value={get("copyrightText")} onChange={(e) => set("copyrightText", e.target.value)}
                        className="h-9 text-[13px]"
                      />
                    </div>

                    {/* Footer preview */}
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Footer Preview</div>
                      <div className="bg-[#f8fafc] px-5 py-4 text-center space-y-1.5">
                        <p className="text-[12px] text-[#64748b] leading-relaxed">
                          {get("footerGreetingText") || "Warm regards,"}<br />
                          <strong>{merged.teamDisplayName || merged.companyName || "Your Company Team"}</strong>
                        </p>
                        {get("footerNote") && <p className="text-[11px] text-[#64748b] italic">{get("footerNote")}</p>}
                        <p className="text-[11px] text-[#64748b] whitespace-pre-line">📍 {resolveFooterAddress(merged.footerAddress)}</p>
                        <p className="text-[10px]" style={{ color: get("primaryColor") || "#6366f1" }}>Privacy Policy · Terms of Service · Support</p>
                        <p className="text-[9px] text-[#94a3b8]">
                          {get("copyrightText") || `© ${new Date().getFullYear()} ${merged.companyName || "Your Company"}`}
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* ── COMPLIANCE ── */}
                {active === "compliance" && (
                  <>
                    <div className="rounded-lg border border-amber-200/60 bg-amber-50/60 dark:border-amber-800/30 dark:bg-amber-950/20 px-3 py-2">
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        This is the small legal strip at the very bottom of every email (below the footer). Supports <code className="bg-amber-100 dark:bg-amber-900/40 px-0.5 rounded text-[10px]">{"{{year}}"}</code> and <code className="bg-amber-100 dark:bg-amber-900/40 px-0.5 rounded text-[10px]">{"{{workspaceName}}"}</code> variables.
                      </p>
                    </div>

                    <div>
                      <FieldLabel>Compliance Text</FieldLabel>
                      <textarea rows={3}
                        placeholder={`© {{year}} Your Company. All rights reserved. You are receiving this email because you initiated a device Recycle request on our platform.`}
                        value={get("complianceText")} onChange={(e) => set("complianceText", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <p className="mt-1 text-[10px] text-muted-foreground">Leave blank to use the default "You are receiving this email…" text.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel>Strip Background</FieldLabel>
                        <ColorRow label="Background" value={get("complianceBgColor") || "#f8fafc"} onChange={(v) => set("complianceBgColor", v)} />
                      </div>
                      <div>
                        <FieldLabel>Text Color</FieldLabel>
                        <ColorRow label="Text" value={get("complianceTextColor") || "#94a3b8"} onChange={(v) => set("complianceTextColor", v)} />
                      </div>
                    </div>

                    {/* Live compliance strip preview */}
                    {get("complianceText") && (
                      <div className="rounded-lg p-3 text-center text-[10px] leading-relaxed"
                        style={{ backgroundColor: get("complianceBgColor") || "#f8fafc", color: get("complianceTextColor") || "#94a3b8" }}>
                        {get("complianceText")
                          .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
                          .replace(/\{\{workspaceName\}\}/g, merged.companyName || "Your Company")}
                        <br />
                        <span style={{ color: get("primaryColor") || "#6366f1" }}>Unsubscribe</span>
                      </div>
                    )}
                  </>
                )}

                {/* ── LEGAL & SOCIAL ── */}
                {active === "social" && (
                  <>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Legal Links</p>
                    {[
                      { key: "privacyPolicyUrl",  label: "Privacy Policy URL",        placeholder: "https://rekart.com/privacy" },
                      { key: "termsOfServiceUrl", label: "Terms of Service URL",      placeholder: "https://rekart.com/terms" },
                      { key: "supportUrl",        label: "Support / Unsubscribe URL", placeholder: "https://rekart.com/support" },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <div className="relative">
                          <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                          <Input type="url" placeholder={placeholder}
                            value={get(key as keyof WorkspaceBranding)} onChange={(e) => set(key as keyof WorkspaceBranding, e.target.value)}
                            className="h-9 pl-8 text-[13px]"
                          />
                          {get(key as keyof WorkspaceBranding) && (
                            <a href={get(key as keyof WorkspaceBranding)} target="_blank" rel="noopener noreferrer"
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}

                    <Separator />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Social Links</p>
                    {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <FieldLabel>{label}</FieldLabel>
                        <div className="relative">
                          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                          <Input type="url" placeholder={placeholder}
                            value={socialLinks[key] ?? ""} onChange={(e) => setSocial(key, e.target.value)}
                            className="h-9 pl-8 text-[13px]"
                          />
                          {socialLinks[key] && (
                            <a href={socialLinks[key]} target="_blank" rel="noopener noreferrer"
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {active === "locations" && (
                  <BusinessLocationsSettings compact className="border-0 bg-transparent shadow-none" />
                )}

              </motion.div>
            </AnimatePresence>
          </div>

        </div>

        {/* ── Right: persistent live email preview ─────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden bg-muted/20">
          <div className="shrink-0 border-b border-border bg-card/60 px-4 py-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Email Preview</p>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              Live
            </span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border p-5">
            <LiveEmailPreview d={merged} />
          </div>
        </div>

      </div>
    </div>
  );
}
