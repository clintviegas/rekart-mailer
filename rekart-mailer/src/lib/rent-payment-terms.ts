/** When security deposit and rental fee are due — used in emails, e-sign, and downloads. */

export function rentHandoverTimingLabel(fulfillmentMode?: string): string {
  const mode = String(fulfillmentMode ?? "").toLowerCase();
  if (mode === "pickup") return "at pickup when you collect the equipment";
  if (mode === "delivery") return "at delivery when you receive the equipment";
  return "at pickup or delivery when you take handover of the equipment";
}

export function rentHandoverDueLabel(fulfillmentMode?: string): string {
  return rentHandoverTimingLabel(fulfillmentMode).replace(/^at /, "Due at ");
}

export function rentDepositDueLine(fulfillmentMode?: string): string {
  return `Security deposit is payable ${rentHandoverTimingLabel(fulfillmentMode)}.`;
}

export function rentRentalFeeDueLine(fulfillmentMode?: string): string {
  return `Rental fee (full quote total) is payable ${rentHandoverTimingLabel(fulfillmentMode)}.`;
}

export function rentDepositAndPaymentSection(fulfillmentMode?: string): string {
  return `${rentDepositDueLine(fulfillmentMode)} ${rentRentalFeeDueLine(fulfillmentMode)} The security deposit may be applied against damage, loss, late return, or unpaid charges. Any refundable balance is settled after return inspection.`;
}

export function rentPaymentScheduleRows(
  fulfillmentMode?: string,
  depositAmount?: string,
  rentalAmount?: string,
): Array<{ label: string; amount?: string; due: string }> {
  const due = rentHandoverDueLabel(fulfillmentMode);
  const rows: Array<{ label: string; amount?: string; due: string }> = [];
  if (String(depositAmount ?? "").trim()) {
    rows.push({
      label: "Security deposit",
      amount: depositAmount,
      due,
    });
  }
  if (String(rentalAmount ?? "").trim()) {
    rows.push({
      label: "Rental fee (full quote total)",
      amount: rentalAmount,
      due,
    });
  }
  return rows;
}
