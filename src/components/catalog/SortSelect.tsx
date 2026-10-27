"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SORT_LABELS } from "@/lib/catalog-params";

export default function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only text-muted-foreground sm:not-sr-only">Sort by</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(params.toString());
          next.set("sort", e.target.value);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="h-11 max-w-[11.5rem] rounded-md border border-input bg-card px-3 text-sm font-medium focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        {Object.entries(SORT_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
    </label>
  );
}
