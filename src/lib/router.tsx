"use client";

/**
 * Transitional shim: lets the legacy client views (admin, vendor, account),
 * written against react-router-dom, run under the Next.js App Router.
 * New code must import from `next/link` and `next/navigation` directly.
 * Delete this file once the last legacy view is migrated.
 */
import NextLink from "next/link";
import {
  usePathname,
  useRouter,
  useParams as useNextParams,
  useSearchParams as useNextSearchParams,
} from "next/navigation";
import React, { forwardRef, useCallback, useEffect, useMemo } from "react";

const STATE_KEY = "__nav_state__";

function writeState(state: unknown) {
  try {
    sessionStorage.setItem(STATE_KEY, JSON.stringify(state ?? null));
  } catch {
    /* storage unavailable */
  }
}

function readState(): any {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type To = string | { pathname?: string; search?: string };
const toHref = (to: To) => (typeof to === "string" ? to : `${to.pathname ?? ""}${to.search ?? ""}`);

export const Link = forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentProps<typeof NextLink>, "href"> & { to: To; state?: unknown }
>(({ to, state, onClick, ...props }, ref) => (
  <NextLink
    ref={ref}
    href={toHref(to)}
    onClick={(e) => {
      if (state !== undefined) writeState(state);
      onClick?.(e);
    }}
    {...props}
  />
));
Link.displayName = "Link";

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: To | number, opts?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === "number") {
        if (to < 0) router.back();
        else router.forward();
        return;
      }
      if (opts?.state !== undefined) writeState(opts.state);
      if (opts?.replace) router.replace(toHref(to));
      else router.push(toHref(to));
    },
    [router],
  );
}

export function useLocation() {
  const pathname = usePathname() ?? "/";
  return useMemo(
    () => ({
      pathname,
      search: typeof window !== "undefined" ? window.location.search : "",
      hash: "",
      state: readState() as any,
    }),
    [pathname],
  );
}

export function useParams<T extends Record<string, string> = Record<string, string>>() {
  return (useNextParams() ?? {}) as unknown as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>, opts?: { replace?: boolean }) => void] {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const current = useNextSearchParams();
  const params = useMemo(() => new URLSearchParams(current?.toString() ?? ""), [current]);
  const set = useCallback(
    (next: URLSearchParams | Record<string, string>, opts?: { replace?: boolean }) => {
      const qs = new URLSearchParams(next as any).toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [router, pathname],
  );
  return [params, set];
}

export function Navigate({ to, replace, state }: { to: To; replace?: boolean; state?: unknown }) {
  const router = useRouter();
  useEffect(() => {
    if (state !== undefined) writeState(state);
    if (replace) router.replace(toHref(to));
    else router.push(toHref(to));
  }, [router, to, replace, state]);
  return null;
}
