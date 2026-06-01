import { formatDateDDMMYY } from "@/lib/date-format";

export const RENT_ESIGN_CONSENT_TEXT =
  "I have read and agree to the rental agreement above. I consent to sign electronically. I understand this electronic signature is intended to be legally valid under applicable laws in the UAE (including Federal Decree-Law No. 46 of 2021 on Electronic Transactions) and India (Information Technology Act, 2000, including Section 10-A on electronic records and signatures), to the extent permitted for this transaction.";

export function todaySignatureDateLabel(): string {
  return formatDateDDMMYY(new Date()) || new Date().toLocaleDateString("en-GB");
}

export function isValidSignatureDataUrl(value: string): boolean {
  const v = value.trim();
  if (!v.startsWith("data:image/png;base64,")) return false;
  const b64 = v.slice("data:image/png;base64,".length);
  if (b64.length < 100 || b64.length > 140_000) return false;
  return /^[A-Za-z0-9+/=]+$/.test(b64);
}
