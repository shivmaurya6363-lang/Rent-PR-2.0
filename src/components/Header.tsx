"use client";

import { useQuery } from "@tanstack/react-query";
import HeaderShell from "@/components/site/HeaderShell";
import type { CategoryNode } from "@/server/catalog";

/**
 * Header for client-rendered screens (account, auth, legal, vendor flows).
 * Server-rendered pages use <SiteHeader /> instead so categories are in the HTML.
 */
export default function Header() {
  const { data } = useQuery({
    queryKey: ["categories-tree"],
    queryFn: async (): Promise<CategoryNode[]> => {
      const r = await fetch("/api/categories");
      return r.ok ? (await r.json()).categories : [];
    },
    staleTime: 5 * 60_000,
  });
  return <HeaderShell categories={data ?? []} />;
}
