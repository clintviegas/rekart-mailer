/** Build RFC5322 From for Nodemailer: `"Display Name" <addr@domain>`. */
export function formatSmtpFromAddress(email: string, displayName?: string): string {
  const e = (email || '').trim();
  const n = (displayName || '').trim();
  if (!e) return '';
  if (!n) return e;
  const escaped = n.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}" <${e}>`;
}
