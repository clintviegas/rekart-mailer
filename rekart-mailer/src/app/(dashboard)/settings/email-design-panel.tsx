"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  useWorkspaceBranding,
  useUpdateBranding,
} from "@/hooks/use-workspace-branding";
import { toast } from "sonner";
import {
  DEFAULT_BRANDING,
  getBrandingValue,
  SUPPORTED_FONTS,
  type WorkspaceBranding,
} from "@/services/workspace.service";
import {
  Loader2, Save, RotateCcw, Palette, Type, Square,
  Layout, AlignLeft, Eye, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Sub-section tabs ──────────────────────────────────────────────────────────
type DesignTab = "Colors" | "Typography" | "Buttons" | "Layout" | "Footer";
const DESIGN_TABS: DesignTab[] = ["Colors", "Typography", "Buttons", "Layout", "Footer"];
const TAB_ICONS: Record<DesignTab, React.ElementType> = {
  Colors: Palette,
  Typography: Type,
  Buttons: Square,
  Layout: Layout,
  Footer: AlignLeft,
};

// ── Color Swatch Picker ───────────────────────────────────────────────────────
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
        <p className="text-xs font-medium text-foreground">{label}</p>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => { const v = e.target.value; if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v); }}
        className="w-[90px] rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        maxLength={7}
      />
    </div>
  );
}

// ── Font Selector ─────────────────────────────────────────────────────────────
function FontSelect({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {SUPPORTED_FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
    </div>
  );
}

// ── Number + unit input ───────────────────────────────────────────────────────
function NumInput({
  label, value, onChange, unit = "px", min = 0, max = 999, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  unit?: string; min?: number; max?: number; hint?: string;
}) {
  const num = parseInt(value, 10) || 0;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <input
          type="range"
          min={min} max={max}
          value={num}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 accent-primary"
        />
        <div className="flex w-20 shrink-0 items-center gap-0.5 rounded-lg border border-border bg-background px-2 py-1.5">
          <input
            type="number"
            min={min} max={max}
            value={num}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 bg-transparent text-xs text-foreground focus:outline-none"
          />
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Weight selector ───────────────────────────────────────────────────────────
function WeightSelect({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  const weights = [
    { label: "Regular (400)", value: "400" },
    { label: "Medium (500)",  value: "500" },
    { label: "Semi-bold (600)", value: "600" },
    { label: "Bold (700)",    value: "700" },
    { label: "Extra-bold (800)", value: "800" },
  ];
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-foreground">{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {weights.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
      </select>
    </div>
  );
}

// ── Email Design Live Preview ─────────────────────────────────────────────────
function EmailDesignPreview({ d }: { d: WorkspaceBranding }) {
  const primary   = d.primaryColor   || DEFAULT_BRANDING.primaryColor;
  const secondary = d.secondaryColor || DEFAULT_BRANDING.secondaryColor;
  const bodyText  = d.bodyTextColor  || DEFAULT_BRANDING.bodyTextColor;
  const headerText = d.headerTextColor || DEFAULT_BRANDING.headerTextColor;
  const btnText   = d.buttonTextColor || DEFAULT_BRANDING.buttonTextColor;
  const emailBg   = d.emailBackgroundColor || DEFAULT_BRANDING.emailBackgroundColor;
  const cardBg    = d.cardBackgroundColor  || DEFAULT_BRANDING.cardBackgroundColor;
  const border    = d.borderColor    || DEFAULT_BRANDING.borderColor;
  const heading   = d.headingFontFamily || "Inter";
  const body      = d.bodyFontFamily    || "Inter";
  const headSz    = parseInt(d.headingFontSize || "18", 10);
  const bodySz    = parseInt(d.bodyFontSize    || "14", 10);
  const btnRadius = parseInt(d.buttonRadius    || "8",  10);
  const cardRadius = parseInt(d.cardRadius     || "12", 10);
  const btnStyle  = d.buttonStyle || "solid";
  const mode      = d.brandMode   || "default";
  const footerText = d.footerTextColor || DEFAULT_BRANDING.footerTextColor;
  const greeting  = d.footerGreetingText || "Warm regards,";
  const copyright = d.copyrightText || `© ${new Date().getFullYear()} Your Company`;

  const headerBg = mode === "gradient"
    ? `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
    : primary;

  let btnBg: string, btnColor: string, btnBorder: string;
  if (btnStyle === "outline") {
    btnBg = "transparent"; btnColor = primary; btnBorder = `2px solid ${primary}`;
  } else if (btnStyle === "soft") {
    btnBg = `${primary}20`; btnColor = primary; btnBorder = "none";
  } else {
    btnBg = primary; btnColor = btnText; btnBorder = "none";
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
      <div className="bg-muted/50 px-3 py-1.5 flex items-center gap-2">
        <Eye className="size-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Live Email Preview</span>
      </div>
      <div style={{ backgroundColor: emailBg }} className="p-3">
        <div style={{ backgroundColor: cardBg, borderRadius: `${cardRadius}px`, overflow: "hidden", maxWidth: 420, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ background: headerBg, padding: "18px 24px", textAlign: "center" }}>
            <div style={{ color: headerText, fontFamily: heading, fontWeight: 700, fontSize: 15 }}>
              {d.companyName || "Your Company"} <span style={{ opacity: 0.7, fontWeight: 400 }}>Mailer</span>
            </div>
            <div style={{ display: "inline-block", marginTop: 6, backgroundColor: "rgba(255,255,255,0.18)", color: headerText, fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 20, letterSpacing: "0.5px" }}>
              OFFER READY
            </div>
          </div>
          {/* Body */}
          <div style={{ padding: "16px 20px", backgroundColor: cardBg }}>
            <p style={{ fontFamily: heading, fontSize: headSz * 0.75, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>Hi Customer,</p>
            <p style={{ fontFamily: body, fontSize: bodySz * 0.9, color: bodyText, lineHeight: 1.5, marginBottom: 12 }}>
              We have reviewed your item and we're ready to make you an offer.
            </p>
            {/* Highlight box */}
            <div style={{ backgroundColor: `${primary}14`, border: `1px solid ${primary}40`, borderRadius: 8, padding: 10, textAlign: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: primary, textTransform: "uppercase", letterSpacing: "0.5px" }}>Your Offer</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: primary }}>₹18,500</div>
            </div>
            {/* CTA buttons */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 10 }}>
              <div style={{ padding: "7px 14px", borderRadius: `${btnRadius}px`, backgroundColor: "#16a34a", color: "#ffffff", fontSize: 11, fontWeight: 600 }}>✓ Accept</div>
              <div style={{ padding: "7px 14px", borderRadius: `${btnRadius}px`, backgroundColor: btnBg, color: btnColor, border: btnBorder, fontSize: 11, fontWeight: 600 }}>View Details</div>
            </div>
            {/* Info table preview */}
            <div style={{ backgroundColor: "#f8fafc", border: `1px solid ${border}`, borderRadius: 6, overflow: "hidden", fontSize: 10 }}>
              <div style={{ backgroundColor: "#f1f5f9", padding: "5px 10px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${border}` }}>Request Details</div>
              {[["Request ID", "RKTS47914"], ["Item", "LG washing machine"], ["Grade", "A+"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 10px", borderBottom: `1px solid #f1f5f9` }}>
                  <span style={{ color: "#64748b" }}>{k}</span>
                  <span style={{ color: "#0f172a", fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Footer */}
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${border}`, backgroundColor: "#f8fafc", textAlign: "center" }}>
            <p style={{ fontSize: 10, color: footerText, lineHeight: 1.7 }}>
              {greeting}<br />
              <strong>{d.teamDisplayName || d.companyName || "Support Team"}</strong>
            </p>
            {d.copyrightText !== undefined && (
              <p style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>{copyright}</p>
            )}
            <p style={{ fontSize: 9, color: primary, marginTop: 4 }}>Privacy Policy · Terms · Support</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function EmailDesignPanel() {
  const { data: branding, isLoading } = useWorkspaceBranding();
  const updateBranding = useUpdateBranding();

  const [activeTab, setActiveTab] = useState<DesignTab>("Colors");
  const [local, setLocal] = useState<Partial<WorkspaceBranding> | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const isDirty = local !== null && Object.keys(local).length > 0;

  // Merged values: local overrides server, server overrides defaults
  const merged: WorkspaceBranding = { ...branding, ...local };

  function get<K extends keyof WorkspaceBranding>(key: K): string {
    return (merged[key] as string) || (getBrandingValue(branding, key as keyof typeof DEFAULT_BRANDING) as string) || "";
  }

  function set(key: keyof WorkspaceBranding, value: string) {
    setLocal((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  async function handleSave() {
    if (!local) return;
    try {
      await updateBranding.mutateAsync(local);
      setLocal(null);
      toast.success("Email design settings saved!");
    } catch {
      toast.error("Failed to save design settings.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Email Design System</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Customize colors, typography, layout and footer for all SELL emails.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowPreview((p) => !p)}>
            <Eye className="size-3" />{showPreview ? "Hide" : "Preview"}
          </Button>
          {isDirty && (
            <>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => setLocal(null)}>
                <RotateCcw className="size-3" />Reset
              </Button>
              <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSave} disabled={updateBranding.isPending}>
                {updateBranding.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Live preview */}
      {showPreview && <EmailDesignPreview d={merged} />}

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-muted/30 p-1">
        {DESIGN_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab];
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}>
              <Icon className="size-3 shrink-0" />
              <span className="hidden sm:inline">{tab}</span>
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">

        {/* ── Colors ── */}
        {activeTab === "Colors" && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Brand Colors</p>
            <ColorRow label="Primary Color"   hint="Header bg, CTA buttons, links"     value={get("primaryColor")}   onChange={(v) => set("primaryColor", v)} />
            <ColorRow label="Secondary Color" hint="Gradient end (when gradient mode)" value={get("secondaryColor")} onChange={(v) => set("secondaryColor", v)} />
            <ColorRow label="Accent Color"    hint="Icons and active indicators"        value={get("accentColor")}    onChange={(v) => set("accentColor", v)} />
            <Separator className="my-1" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Text Colors</p>
            <ColorRow label="Header Text"  hint="Logo / company name in header"     value={get("headerTextColor")}  onChange={(v) => set("headerTextColor", v)} />
            <ColorRow label="Body Text"    hint="Main paragraph text"               value={get("bodyTextColor")}    onChange={(v) => set("bodyTextColor", v)} />
            <ColorRow label="Muted Text"   hint="Labels, sub-text"                  value={get("mutedTextColor")}   onChange={(v) => set("mutedTextColor", v)} />
            <ColorRow label="Footer Text"  hint="Sign-off and address text"         value={get("footerTextColor")}  onChange={(v) => set("footerTextColor", v)} />
            <ColorRow label="Button Text"  hint="Text on filled primary buttons"    value={get("buttonTextColor")}  onChange={(v) => set("buttonTextColor", v)} />
            <Separator className="my-1" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Background Colors</p>
            <ColorRow label="Email Background" hint="Page/wrapper background"         value={get("emailBackgroundColor")} onChange={(v) => set("emailBackgroundColor", v)} />
            <ColorRow label="Card Background"  hint="Email card / content background" value={get("cardBackgroundColor")}  onChange={(v) => set("cardBackgroundColor", v)} />
            <ColorRow label="Border Color"     hint="Table borders, dividers"         value={get("borderColor")}          onChange={(v) => set("borderColor", v)} />
            <Separator className="my-1" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Header Style</p>
            <div className="grid grid-cols-2 gap-2">
              {(["default", "gradient"] as const).map((mode) => (
                <button key={mode} type="button" onClick={() => set("brandMode", mode)}
                  className={cn("rounded-xl border p-3 text-left transition-all text-xs",
                    get("brandMode") === mode ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                  )}>
                  <div className="font-semibold capitalize">{mode === "default" ? "Solid" : "Gradient"}</div>
                  <div className="text-[10px] opacity-70">{mode === "default" ? "Flat primary color" : "Primary → secondary blend"}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Typography ── */}
        {activeTab === "Typography" && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FontSelect label="Heading Font" value={get("headingFontFamily")} onChange={(v) => set("headingFontFamily", v)} />
              <FontSelect label="Body Font"    value={get("bodyFontFamily")}    onChange={(v) => set("bodyFontFamily", v)} />
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumInput label="Heading Size"  value={get("headingFontSize")} onChange={(v) => set("headingFontSize", v)} min={12} max={36} />
              <NumInput label="Body Size"     value={get("bodyFontSize")}    onChange={(v) => set("bodyFontSize", v)}    min={10} max={24} />
              <NumInput label="Button Size"   value={get("buttonFontSize")}  onChange={(v) => set("buttonFontSize", v)}  min={10} max={20} />
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">Line Height</Label>
                <div className="flex items-center gap-2">
                  <input type="range" min={1} max={2.5} step={0.05}
                    value={parseFloat(get("lineHeight") || "1.65")}
                    onChange={(e) => set("lineHeight", e.target.value)}
                    className="flex-1 accent-primary"
                  />
                  <span className="w-12 text-center text-xs font-mono text-foreground rounded-md border border-border px-2 py-1">
                    {(parseFloat(get("lineHeight") || "1.65")).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <WeightSelect label="Heading Weight" value={get("headingFontWeight")} onChange={(v) => set("headingFontWeight", v)} />
              <WeightSelect label="Body Weight"    value={get("bodyFontWeight")}    onChange={(v) => set("bodyFontWeight", v)} />
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Font Preview</p>
              <p style={{ fontFamily: get("headingFontFamily"), fontSize: parseInt(get("headingFontSize") || "18", 10) * 0.7, fontWeight: parseInt(get("headingFontWeight") || "600") }}>
                Hi Customer, Your offer is ready!
              </p>
              <p style={{ fontFamily: get("bodyFontFamily"), fontSize: parseInt(get("bodyFontSize") || "14", 10) * 0.75, fontWeight: parseInt(get("bodyFontWeight") || "400"), color: "#475569", lineHeight: parseFloat(get("lineHeight") || "1.65"), marginTop: 6 }}>
                Our team has reviewed your item and we're ready to make you an amazing offer. Please review the details below.
              </p>
            </div>
          </div>
        )}

        {/* ── Buttons ── */}
        {activeTab === "Buttons" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Button Style</p>
              <div className="grid grid-cols-3 gap-2">
                {(["solid", "outline", "soft"] as const).map((style) => {
                  const p = get("primaryColor") || "#6366f1";
                  const btnBg   = style === "outline" ? "transparent" : style === "soft" ? `${p}20` : p;
                  const btnClr  = style === "solid" ? (get("buttonTextColor") || "#fff") : p;
                  const btnBdr  = style === "outline" ? `2px solid ${p}` : "none";
                  return (
                    <button key={style} type="button" onClick={() => set("buttonStyle", style)}
                      className={cn("rounded-xl border p-3 text-center transition-all",
                        get("buttonStyle") === style ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      )}>
                      <div style={{ backgroundColor: btnBg, color: btnClr, border: btnBdr, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, marginBottom: 6, display: "inline-block" }}>
                        Accept
                      </div>
                      <p className={cn("text-[11px] font-medium capitalize", get("buttonStyle") === style ? "text-primary" : "text-muted-foreground")}>
                        {style}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
            <Separator />
            <NumInput label="Button Border Radius" value={get("buttonRadius")} onChange={(v) => set("buttonRadius", v)} min={0} max={50} hint="0 = square, 50 = pill" />
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Button Padding</Label>
              <Input
                className="h-9 text-sm font-mono"
                placeholder="13px 28px"
                value={get("buttonPadding")}
                onChange={(e) => set("buttonPadding", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">CSS padding: vertical horizontal (e.g. 13px 28px)</p>
            </div>
            <NumInput label="Button Font Size" value={get("buttonFontSize")} onChange={(v) => set("buttonFontSize", v)} min={10} max={20} />
          </div>
        )}

        {/* ── Layout ── */}
        {activeTab === "Layout" && (
          <div className="space-y-4">
            <NumInput label="Email Max Width" value={get("emailWidth")} onChange={(v) => set("emailWidth", v)} min={480} max={800} hint="Recommended: 600px" />
            <NumInput label="Content Padding" value={get("contentPadding")} onChange={(v) => set("contentPadding", v)} min={16} max={64} hint="Side padding inside email body" />
            <NumInput label="Section Spacing" value={get("sectionSpacing")} onChange={(v) => set("sectionSpacing", v)} min={12} max={48} hint="Margin-bottom between sections" />
            <NumInput label="Card Border Radius" value={get("cardRadius")} onChange={(v) => set("cardRadius", v)} min={0} max={32} hint="Outer email card corner radius" />
          </div>
        )}

        {/* ── Footer Text ── */}
        {activeTab === "Footer" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Greeting Line</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Warm regards,"
                value={get("footerGreetingText")}
                onChange={(e) => set("footerGreetingText", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Appears above team name in footer. Default: "Warm regards,"</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Footer Note</Label>
              <textarea
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                placeholder="e.g. This offer is valid for 48 hours."
                value={get("footerNote")}
                onChange={(e) => set("footerNote", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Optional italic note shown in every email footer (global default)</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Copyright Line</Label>
              <Input
                className="h-9 text-sm"
                placeholder={`© ${new Date().getFullYear()} Your Company`}
                value={get("copyrightText")}
                onChange={(e) => set("copyrightText", e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">Overrides the auto-generated copyright line. Leave blank to use default.</p>
            </div>
            {/* Footer preview */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Footer Preview</div>
              <div className="bg-[#f8fafc] px-5 py-4 text-center space-y-2">
                <p className="text-[11px] text-[#64748b] leading-relaxed">
                  {get("footerGreetingText") || "Warm regards,"}<br />
                  <strong>{branding?.teamDisplayName || branding?.companyName || "Your Company Team"}</strong>
                </p>
                {get("footerNote") && (
                  <p className="text-[11px] text-[#64748b] italic">{get("footerNote")}</p>
                )}
                {branding?.footerAddress && (
                  <p className="text-[11px] text-[#64748b]">📍 {branding.footerAddress}</p>
                )}
                <p className="text-[10px]" style={{ color: get("primaryColor") || "#6366f1" }}>
                  Privacy Policy · Terms of Service · Support
                </p>
                <p className="text-[9px] text-[#94a3b8]">
                  {get("copyrightText") || `© ${new Date().getFullYear()} ${branding?.companyName || "Your Company"}`}
                </p>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Save bar */}
      {isDirty && (
        <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5">
          <p className="text-xs text-muted-foreground">Unsaved email design changes</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocal(null)}>
              <RotateCcw className="size-3 mr-1" />Discard
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={handleSave} disabled={updateBranding.isPending}>
              {updateBranding.isPending ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
              Save changes
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
