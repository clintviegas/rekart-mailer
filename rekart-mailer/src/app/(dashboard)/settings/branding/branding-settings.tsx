"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Building2, Globe, Mail, Phone, MapPin, Link2,
  Loader2, CheckCircle2, Upload, X, Palette,
  ExternalLink, Info, ShieldCheck, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useWorkspaceBranding,
  useUpdateBranding,
  useUploadLogo,
  useRemoveLogo,
} from "@/hooks/use-workspace-branding";
import type { WorkspaceBranding } from "@/services/workspace.service";
import { DEFAULT_BRANDING } from "@/services/workspace.service";

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, description, icon: Icon, children }: {
  title: string;
  description?: string;
  icon: React.FC<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-border bg-card p-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" />
        </div>
        <div>
          <h2 className="text-[14px] font-bold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </motion.div>
  );
}

// ── Field ─────────────────────────────────────────────────────────────────────

function Field({
  label, placeholder, value, onChange, type = "text", hint,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 text-[13px]"
      />
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Color picker ──────────────────────────────────────────────────────────────

function ColorField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative size-9 overflow-hidden rounded-lg border-2 border-border cursor-pointer shrink-0">
          <input
            type="color"
            value={value || DEFAULT_BRANDING.primaryColor}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-1 h-[calc(100%+8px)] w-[calc(100%+8px)] cursor-pointer opacity-0"
          />
          <div className="size-full rounded-md" style={{ backgroundColor: value || DEFAULT_BRANDING.primaryColor }} />
        </div>
        <Input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={DEFAULT_BRANDING.primaryColor}
          className="h-9 font-mono text-[12px]"
        />
        <div className="size-7 shrink-0 rounded-lg border border-border" style={{ backgroundColor: value || DEFAULT_BRANDING.primaryColor }} />
      </div>
    </div>
  );
}

// ── Social link row ───────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { key: "facebook",  label: "Facebook",   placeholder: "https://facebook.com/rekartuae" },
  { key: "instagram", label: "Instagram",    placeholder: "https://instagram.com/rekartuae" },
  { key: "tiktok",    label: "TikTok",       placeholder: "https://www.tiktok.com/@rekartuae" },
  { key: "whatsapp",  label: "WhatsApp",     placeholder: "https://wa.me/+971585962788" },
  { key: "twitter",   label: "Twitter / X",  placeholder: "https://twitter.com/yourcompany" },
  { key: "linkedin",  label: "LinkedIn",      placeholder: "https://linkedin.com/company/yourcompany" },
  { key: "youtube",   label: "YouTube",       placeholder: "https://youtube.com/@yourcompany" },
] as const;

// ── Main component ─────────────────────────────────────────────────────────────

export function BrandingSettingsClient() {
  const { data: branding, isLoading } = useWorkspaceBranding();
  const { mutate: updateBranding, isPending: saving } = useUpdateBranding();
  const { mutate: uploadLogo,     isPending: uploading } = useUploadLogo();
  const { mutate: removeLogo,     isPending: removing }  = useRemoveLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Form state ───────────────────────────────────────────────────────────

  const [companyName,       setCompanyName]       = useState("");
  const [teamDisplayName,   setTeamDisplayName]   = useState("");
  const [website,           setWebsite]           = useState("");
  const [primaryColor,      setPrimaryColor]      = useState(DEFAULT_BRANDING.primaryColor);
  const [secondaryColor,    setSecondaryColor]    = useState(DEFAULT_BRANDING.secondaryColor);
  const [supportEmail,      setSupportEmail]      = useState("");
  const [supportPhone,      setSupportPhone]      = useState("");
  const [address,           setAddress]           = useState("");
  const [privacyPolicyUrl,  setPrivacyPolicyUrl]  = useState("");
  const [termsOfServiceUrl, setTermsOfServiceUrl] = useState("");
  const [supportUrl,        setSupportUrl]        = useState("");
  const [socialLinks,        setSocialLinks]        = useState<Record<string, string>>({});
  const [footerGreetingText, setFooterGreetingText] = useState("");
  const [footerNote,         setFooterNote]         = useState("");
  const [copyrightText,      setCopyrightText]      = useState("");
  const [complianceText,     setComplianceText]     = useState("");
  const [complianceBgColor,  setComplianceBgColor]  = useState("#f8fafc");
  const [complianceTextColor,setComplianceTextColor]= useState("#94a3b8");
  const [saved, setSaved]                          = useState(false);

  useEffect(() => {
    if (!branding) return;
    setCompanyName(branding.companyName       ?? "");
    setTeamDisplayName(branding.teamDisplayName ?? "");
    setWebsite(branding.website               ?? "");
    setPrimaryColor(branding.primaryColor     ?? DEFAULT_BRANDING.primaryColor);
    setSecondaryColor(branding.secondaryColor ?? DEFAULT_BRANDING.secondaryColor);
    setSupportEmail(branding.supportEmail     ?? "");
    setSupportPhone(branding.supportPhone     ?? "");
    setAddress(branding.footerAddress         ?? "");
    setPrivacyPolicyUrl(branding.privacyPolicyUrl  ?? "");
    setTermsOfServiceUrl(branding.termsOfServiceUrl ?? "");
    setSupportUrl(branding.supportUrl         ?? "");
    setSocialLinks(branding.socialLinks           ?? {});
    setFooterGreetingText(branding.footerGreetingText ?? "");
    setFooterNote(branding.footerNote             ?? "");
    setCopyrightText(branding.copyrightText       ?? "");
    setComplianceText(branding.complianceText     ?? "");
    setComplianceBgColor(branding.complianceBgColor   ?? "#f8fafc");
    setComplianceTextColor(branding.complianceTextColor ?? "#94a3b8");
  }, [branding]);

  function handleSave() {
    const payload: Partial<WorkspaceBranding> = {
      companyName,
      teamDisplayName,
      website,
      primaryColor,
      secondaryColor,
      supportEmail,
      supportPhone,
      footerAddress:    address,
      privacyPolicyUrl,
      termsOfServiceUrl,
      supportUrl,
      socialLinks,
      footerGreetingText,
      footerNote,
      copyrightText,
      complianceText,
      complianceBgColor,
      complianceTextColor,
    };
    updateBranding(payload, {
      onSuccess: () => {
        setSaved(true);
        toast.success("Branding saved");
        setTimeout(() => setSaved(false), 3000);
      },
      onError: () => toast.error("Failed to save branding"),
    });
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadLogo(file, {
      onSuccess: () => toast.success("Logo updated"),
      onError:   () => toast.error("Logo upload failed"),
    });
    e.target.value = "";
  }

  function setSocial(key: string, value: string) {
    setSocialLinks((prev) => ({ ...prev, [key]: value }));
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

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Palette className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[16px] font-bold text-foreground">Global Branding</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Company identity, colors, and contact details used across all SELL emails
              </p>
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className={cn("gap-2 min-w-[100px]", saved && "bg-emerald-600 hover:bg-emerald-700")}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <CheckCircle2 className="size-3.5" />
            ) : null}
            {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>

        {/* Info banner */}
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-950/20 px-3 py-2">
          <Info className="size-3.5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            These settings are automatically applied to all SELL workflow emails — company name, logo, colors, support links, and footer.
          </p>
        </div>
      </div>

      {/* ── Scrollable content ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border">
        <div className="mx-auto max-w-2xl space-y-5 p-6">

          {/* Company Identity */}
          <Section title="Company Identity" description="Your company name and logo shown in all emails" icon={Building2}>
            {/* Logo */}
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Company Logo
              </label>
              <div className="flex items-center gap-4">
                <div className="flex size-16 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 overflow-hidden">
                  {branding?.logoUrl ? (
                    <img
                      src={branding.logoUrl}
                      alt="logo"
                      className="size-full object-contain p-1"
                    />
                  ) : (
                    <Building2 className="size-6 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                    {uploading ? "Uploading…" : branding?.logoUrl ? "Change Logo" : "Upload Logo"}
                  </Button>
                  {branding?.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs text-muted-foreground"
                      disabled={removing}
                      onClick={() => removeLogo(undefined, { onSuccess: () => toast.success("Logo removed") })}
                    >
                      {removing ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                      Remove
                    </Button>
                  )}
                  <p className="text-[10px] text-muted-foreground">PNG, JPG, SVG. Max 2MB. Best at 200×60px.</p>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                className="hidden"
                onChange={handleLogoChange}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Company Name"
                placeholder="Rekart Electronics"
                value={companyName}
                onChange={setCompanyName}
                hint="Shown in email subject lines and headers"
              />
              <Field
                label="Team Display Name"
                placeholder="The Rekart Team"
                value={teamDisplayName}
                onChange={setTeamDisplayName}
                hint="Shown in email sign-offs"
              />
            </div>
            <Field
              label="Website"
              type="url"
              placeholder="https://rekart.com"
              value={website}
              onChange={setWebsite}
            />
          </Section>

          {/* Brand Colors */}
          <Section title="Brand Colors" description="Primary and secondary colors used in email buttons and accents" icon={Palette}>
            <div className="grid grid-cols-2 gap-4">
              <ColorField label="Primary Color"   value={primaryColor}   onChange={setPrimaryColor} />
              <ColorField label="Secondary Color" value={secondaryColor} onChange={setSecondaryColor} />
            </div>
            <div className="flex gap-3 pt-1">
              <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: primaryColor }} />
              <div className="flex-1 h-10 rounded-lg" style={{ backgroundColor: secondaryColor }} />
              <div className="flex-1 h-10 rounded-lg" style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              For full email design customization (fonts, spacing, button styles), visit{" "}
              <a href="/settings?tab=Email+Design" className="text-primary hover:underline">Email Design Settings →</a>
            </p>
          </Section>

          {/* Contact & Support */}
          <Section title="Contact & Support" description="Shown in email footers and support links" icon={Mail}>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Support Email</label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    type="email" placeholder="support@rekart.com"
                    value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)}
                    className="h-9 pl-8 text-[13px]"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Support Phone</label>
                <div className="relative">
                  <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                  <Input
                    type="tel" placeholder="+971 50 000 0000"
                    value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)}
                    className="h-9 pl-8 text-[13px]"
                  />
                </div>
              </div>
            </div>
            <div className="relative">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Address</label>
              <div className="relative">
                <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Retake Technologies FZ-LLC — HQ: G01, Boutique Villa 9, Dubai Media City, Dubai"
                  value={address} onChange={(e) => setAddress(e.target.value)}
                  className="h-9 pl-8 text-[13px]"
                />
              </div>
            </div>
          </Section>

          {/* Legal Links */}
          <Section title="Legal & Compliance Links" description="Footer links required for email compliance" icon={Link2}>
            <div className="space-y-3">
              {[
                { label: "Privacy Policy URL",  value: privacyPolicyUrl,  onChange: setPrivacyPolicyUrl,  placeholder: "https://rekart.com/privacy" },
                { label: "Terms of Service URL", value: termsOfServiceUrl, onChange: setTermsOfServiceUrl, placeholder: "https://rekart.com/terms" },
                { label: "Support / Unsubscribe URL", value: supportUrl, onChange: setSupportUrl, placeholder: "https://rekart.com/support", hint: "Used as the unsubscribe link in emails" },
              ].map(({ label, value, onChange, placeholder, hint }) => (
                <div key={label}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
                  <div className="relative">
                    <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="url" placeholder={placeholder}
                      value={value} onChange={(e) => onChange(e.target.value)}
                      className="h-9 pl-8 text-[13px]"
                    />
                    {value && (
                      <a
                        href={value} target="_blank" rel="noopener noreferrer"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                  {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
                </div>
              ))}
            </div>
          </Section>

          {/* Footer & Sign-off */}
          <Section
            title="Footer & Email Sign-off"
            description="Text shown in the email footer above the compliance strip"
            icon={FileText}
          >
            <Field
              label="Footer Greeting"
              placeholder="Warm regards,"
              value={footerGreetingText}
              onChange={setFooterGreetingText}
              hint='Appears before the sign-off name (e.g. "Warm regards,")'
            />
            <Field
              label="Footer Note"
              placeholder="Thank you for choosing us!"
              value={footerNote}
              onChange={setFooterNote}
              hint="Optional italic note shown below the sign-off"
            />
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Copyright Text</label>
              <Input
                placeholder={`© ${new Date().getFullYear()} Your Company. All rights reserved.`}
                value={copyrightText}
                onChange={(e) => setCopyrightText(e.target.value)}
                className="h-9 text-[13px]"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Leave blank to auto-generate: © {new Date().getFullYear()} {"{company name}"}. Supports{" "}
                <code className="text-[10px] bg-muted px-0.5 rounded">{"{{year}}"}</code> variable.
              </p>
            </div>

            {/* Live preview of footer block */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Live Preview</p>
              <div className="text-center space-y-1">
                <p className="text-[12px] text-muted-foreground">{footerGreetingText || "Warm regards,"}</p>
                <p className="text-[13px] font-semibold text-foreground">{teamDisplayName || companyName || "The Team"}</p>
                {footerNote && <p className="text-[11px] italic text-muted-foreground">{footerNote}</p>}
                <p className="text-[11px] text-muted-foreground pt-1">
                  {copyrightText
                    ? copyrightText.replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
                    : `© ${new Date().getFullYear()} ${companyName || "Your Company"}`}
                </p>
              </div>
            </div>
          </Section>

          {/* Compliance Footer */}
          <Section
            title="Email Compliance Footer"
            description="The legal strip shown at the very bottom of every email. Supports {{year}} and {{workspaceName}} variables."
            icon={ShieldCheck}
          >
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Compliance Text
              </label>
              <textarea
                rows={3}
                placeholder={`e.g. © {{year}} Your Company. All rights reserved. You are receiving this email because you initiated a device sell request on our platform.`}
                value={complianceText}
                onChange={(e) => setComplianceText(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Leave blank to use the default "You are receiving this email as a customer of…" text.
              </p>
            </div>

            {/* Live preview */}
            {complianceText && (
              <div
                className="rounded-lg p-3 text-center text-[10px] leading-relaxed"
                style={{ backgroundColor: complianceBgColor, color: complianceTextColor }}
              >
                {complianceText
                  .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
                  .replace(/\{\{workspaceName\}\}/g, companyName || "Your Company")}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <ColorField
                label="Background Color"
                value={complianceBgColor}
                onChange={setComplianceBgColor}
              />
              <ColorField
                label="Text Color"
                value={complianceTextColor}
                onChange={setComplianceTextColor}
              />
            </div>
          </Section>

          {/* Social Links */}
          <Section title="Social Links" description="Linked icons shown in email footers" icon={Globe}>
            <div className="space-y-2.5">
              {SOCIAL_PLATFORMS.map(({ key, label, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
                  <div className="relative">
                    <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      type="url" placeholder={placeholder}
                      value={socialLinks[key] ?? ""}
                      onChange={(e) => setSocial(key, e.target.value)}
                      className="h-9 pl-8 text-[13px]"
                    />
                    {socialLinks[key] && (
                      <a
                        href={socialLinks[key]} target="_blank" rel="noopener noreferrer"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                      >
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Bottom save button */}
          <div className="flex justify-end pb-4">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className={cn("gap-2 min-w-[120px]", saved && "bg-emerald-600 hover:bg-emerald-700")}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="size-3.5" />
              ) : null}
              {saving ? "Saving…" : saved ? "Saved!" : "Save All Changes"}
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
