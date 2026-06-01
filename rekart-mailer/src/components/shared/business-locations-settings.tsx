"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  useUpdateBranding,
  useWorkspaceBranding,
} from "@/hooks/use-workspace-branding";
import {
  BUSINESS_LOCATION_CURRENCIES,
  CURRENCY_FLAGS,
  newBusinessLocation,
  resolveEditableBusinessLocations,
  normalizeBusinessLocationsByCurrency,
  type BusinessLocation,
  type BusinessLocationsByCurrency,
} from "@/lib/business-locations";
import type { RentJourneyCurrency } from "@/types/rent";

interface BusinessLocationsSettingsProps {
  className?: string;
  /** Shorter intro when embedded in sell/repair design sidebar sections */
  compact?: boolean;
}

export function BusinessLocationsSettings({
  className,
  compact = false,
}: BusinessLocationsSettingsProps) {
  const { data: branding, isLoading } = useWorkspaceBranding();
  const updateBranding = useUpdateBranding();
  const [currency, setCurrency] = useState<RentJourneyCurrency>("AED");
  const [locations, setLocations] = useState<BusinessLocationsByCurrency>(() =>
    resolveEditableBusinessLocations(),
  );
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!branding) return;
    setLocations(
      resolveEditableBusinessLocations(branding.businessLocationsByCurrency),
    );
    setDirty(false);
  }, [branding]);

  const rows = locations[currency] ?? [];

  function patchCurrencyRows(nextRows: BusinessLocation[]) {
    setLocations((prev) => ({ ...prev, [currency]: nextRows }));
    setDirty(true);
  }

  function updateRow(index: number, patch: Partial<BusinessLocation>) {
    patchCurrencyRows(
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function removeRow(index: number) {
    patchCurrencyRows(rows.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const cleaned = normalizeBusinessLocationsByCurrency(locations);
    try {
      await updateBranding.mutateAsync({
        businessLocationsByCurrency: cleaned,
      });
      setLocations(cleaned);
      setDirty(false);
      toast.success("Pickup & store locations saved");
    } catch {
      toast.error("Could not save locations");
    }
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MapPin className="size-4" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">
              Pickup &amp; Store Locations
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {compact
                ? "Currency-wise addresses for customer pickup and staff pickup emails."
                : "Add your store / warehouse addresses per currency. Customers see these when they choose Pickup on the rent confirm page."}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid grid-cols-4 gap-1.5">
          {BUSINESS_LOCATION_CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                "rounded-lg border py-2 text-[12px] font-semibold transition-all",
                currency === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {CURRENCY_FLAGS[c]} {c}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-[12px]">Loading…</span>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {rows.map((row, index) => (
                <div
                  key={row.id}
                  className="rounded-lg border border-border bg-muted/10 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Location {index + 1}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove location"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <Input
                    value={row.label}
                    onChange={(e) => updateRow(index, { label: e.target.value })}
                    placeholder="e.g. Store — Meena Bazaar"
                    className="h-9 text-[13px]"
                  />
                  <Textarea
                    value={row.address}
                    onChange={(e) => updateRow(index, { address: e.target.value })}
                    placeholder="Full address including landmark…"
                    rows={2}
                    className="min-h-[72px] text-[13px]"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => patchCurrencyRows([...rows, newBusinessLocation()])}
              >
                <Plus className="size-3.5" /> Add location
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={!dirty || updateBranding.isPending}
                onClick={() => { void handleSave(); }}
              >
                {updateBranding.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save locations
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
