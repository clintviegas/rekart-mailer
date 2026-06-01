/**
 * Sell journey email HTML preview — dimensions aligned with
 * New SELL Request → Email Preview (narrow column + fixed iframe height).
 */

export const SELL_EMAIL_PREVIEW_IFRAME_CLASS =
  "h-[min(55vh,480px)] w-full rounded-lg border border-border bg-white";

export const SELL_EMAIL_PREVIEW_FRAME_WRAP_CLASS =
  "overflow-hidden rounded-xl border border-border bg-muted/40 p-2";

/** Dialog shell: same width class as create modal (`max-w-lg` / 32rem). */
export const SELL_EMAIL_PREVIEW_DIALOG_CLASS =
  "flex w-full max-w-lg max-h-[min(94vh,860px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg";
