"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny localStorage-backed store with cross-tab sync, safe for SSR: the server
 * and the first client render both use `initial`, so there is no hydration
 * mismatch. Every storage access is guarded because storage can be unavailable
 * (private mode, blocked cookies).
 */
export function createLocalStore<T>(key: string, initial: T, sanitize: (raw: unknown) => T = (r) => r as T) {
  let cachedRaw: string | null | undefined;
  let cachedValue: T = initial;
  const listeners = new Set<() => void>();

  const read = (): T => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return cachedValue;
    }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    try {
      cachedValue = raw === null ? initial : sanitize(JSON.parse(raw));
    } catch {
      cachedValue = initial;
    }
    return cachedValue;
  };

  const emit = () => listeners.forEach((l) => l());

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === key) emit();
    });
  }

  return {
    get: read,
    set(value: T) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        cachedValue = value; // keep working in memory for this session
        cachedRaw = undefined;
      }
      emit();
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    use(): T {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        read,
        () => initial,
      );
    },
  };
}
