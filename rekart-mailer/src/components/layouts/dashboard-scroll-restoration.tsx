"use client";

import { useLayoutEffect, useEffect, useRef, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const DASHBOARD_PRIMARY_SCROLL_ATTR = "data-dashboard-primary-scroll" as const;

const STORAGE_PREFIX = "dash-scroll:";

function scrollKey(pathname: string, search: string) {
  const q = search.trim();
  return q ? `${pathname}?${q}` : pathname;
}

function locationScrollKey(): string {
  return scrollKey(
    window.location.pathname,
    new URLSearchParams(window.location.search).toString(),
  );
}

function findDashboardScrollEl(): HTMLElement | null {
  const main = document.querySelector("main");
  if (!main) return null;
  const marked = main.querySelector<HTMLElement>(`[${DASHBOARD_PRIMARY_SCROLL_ATTR}]`);
  if (marked) return marked;

  let best: HTMLElement | null = null;
  let bestOverflow = 0;
  const sel = "[class*='overflow-y-auto'],[class*='overflow-y-scroll']";
  for (const el of main.querySelectorAll<HTMLElement>(sel)) {
    const extra = el.scrollHeight - el.clientHeight;
    if (extra > bestOverflow) {
      bestOverflow = extra;
      best = el;
    }
  }
  return best;
}

function readStored(key: string): number | null {
  const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeStored(key: string, y: number) {
  sessionStorage.setItem(STORAGE_PREFIX + key, String(Math.max(0, Math.round(y))));
}

function applyScrollY(el: HTMLElement, y: number, smooth: boolean) {
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  const top = Math.min(y, max);
  if (smooth) {
    el.scrollTo({ top, behavior: "smooth" });
  } else {
    el.scrollTop = top;
  }
}

const POP_SUPPRESS_MS = 1800;

export function DashboardScrollRestoration() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const key = scrollKey(pathname, search);

  const popSuppressUntil = useRef(0);
  const restoreIntervalsRef = useRef<number[]>([]);
  const restoreTimeoutsRef = useRef<number[]>([]);
  const prevPathnameRef = useRef<string | null>(null);

  const clearRestoreJobs = () => {
    for (const id of restoreIntervalsRef.current) window.clearInterval(id);
    for (const id of restoreTimeoutsRef.current) window.clearTimeout(id);
    restoreIntervalsRef.current = [];
    restoreTimeoutsRef.current = [];
  };

  const beginScrollRestore = useCallback((k: string) => {
    clearRestoreJobs();
    popSuppressUntil.current = performance.now() + POP_SUPPRESS_MS;

    const y = readStored(k);
    if (y == null) return;

    let ticks = 0;
    const iv = window.setInterval(() => {
      ticks++;
      const el = findDashboardScrollEl();
      if (!el) return;
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      const top = Math.min(y, max);
      el.scrollTop = top;
      const settled = ticks >= 3 && (max >= top - 1 || Math.abs(el.scrollTop - top) < 2);
      if (settled || ticks > 55) {
        window.clearInterval(iv);
        restoreIntervalsRef.current = restoreIntervalsRef.current.filter((x) => x !== iv);
        el.scrollTo({ top, behavior: "smooth" });
      }
    }, 40);
    restoreIntervalsRef.current.push(iv);

    const cap = window.setTimeout(() => {
      window.clearInterval(iv);
      restoreIntervalsRef.current = restoreIntervalsRef.current.filter((x) => x !== iv);
      const el = findDashboardScrollEl();
      if (el) applyScrollY(el, y, true);
    }, 2600);
    restoreTimeoutsRef.current.push(cap);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      beginScrollRestore(locationScrollKey());
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      clearRestoreJobs();
    };
  }, [beginScrollRestore]);

  useLayoutEffect(() => {
    const prevPn = prevPathnameRef.current;
    const curPn = pathname;

    const cameFromChild =
      prevPn != null &&
      prevPn !== curPn &&
      prevPn.startsWith(`${curPn}/`) &&
      prevPn.length > curPn.length + 1;

    if (cameFromChild) {
      beginScrollRestore(scrollKey(pathname, search));
    }

    prevPathnameRef.current = curPn;

    if (performance.now() < popSuppressUntil.current) {
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (performance.now() < popSuppressUntil.current) return;
        findDashboardScrollEl()?.scrollTo({ top: 0, behavior: "instant" });
      });
    });
  }, [pathname, search, beginScrollRestore]);

  useEffect(() => {
    const storageKey = key;
    let attached: HTMLElement | null = null;
    let throttleTimer: number | null = null;

    const persistFromEl = (el: HTMLElement | null, forcedKey?: string) => {
      if (!el) return;
      writeStored(forcedKey ?? storageKey, el.scrollTop);
    };

    const onScroll = () => {
      if (throttleTimer != null) return;
      throttleTimer = window.setTimeout(() => {
        throttleTimer = null;
        if (attached) persistFromEl(attached);
      }, 60);
    };

    const tryAttach = () => {
      const el = findDashboardScrollEl();
      if (el && el !== attached) {
        attached?.removeEventListener("scroll", onScroll);
        attached = el;
        attached.addEventListener("scroll", onScroll, { passive: true });
      }
    };

    tryAttach();
    const poll = window.setInterval(tryAttach, 200);

    const flushLeavingPage = () => {
      const el = attached ?? findDashboardScrollEl();
      persistFromEl(el, storageKey);
    };

    const onPointerDownCapture = () => {
      const el = attached ?? findDashboardScrollEl();
      if (!el) return;
      writeStored(locationScrollKey(), el.scrollTop);
    };

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("pagehide", flushLeavingPage);

    return () => {
      flushLeavingPage();
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("pagehide", flushLeavingPage);
      window.clearInterval(poll);
      if (throttleTimer != null) window.clearTimeout(throttleTimer);
      attached?.removeEventListener("scroll", onScroll);
    };
  }, [key]);

  return null;
}
