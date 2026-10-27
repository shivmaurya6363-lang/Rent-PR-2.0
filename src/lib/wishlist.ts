"use client";

import { createLocalStore } from "./local-store";

const store = createLocalStore<string[]>("rentpr.wishlist.v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 200) : [],
);

/** Wishlist of product ids. Stored on this device; it does not need an account. */
export function useWishlist() {
  const ids = store.use();
  return {
    ids,
    count: ids.length,
    has: (id: string) => ids.includes(id),
    toggle(id: string) {
      const cur = store.get();
      store.set(cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 200));
    },
  };
}

const recent = createLocalStore<string[]>("rentpr.recent.v1", [], (raw) =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
);

export function useRecentlyViewed() {
  const slugs = recent.use();
  return {
    slugs,
    add(slug: string) {
      const cur = recent.get();
      if (cur[0] === slug) return;
      recent.set([slug, ...cur.filter((s) => s !== slug)].slice(0, 12));
    },
  };
}
