"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Tag, Package } from "lucide-react";

interface Suggestion { type: "product" | "category"; label: string; href: string; hint?: string }

/** Search with accessible autocomplete (combobox pattern): arrow keys, Enter, Escape. */
export function SearchBox({ className = "", autoFocus = false, onNavigate }: { className?: string; autoFocus?: boolean; onNavigate?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search/suggest?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (r.ok) {
          const d = await r.json();
          setItems(d.suggestions ?? []);
          setActive(-1);
        }
      } catch {
        /* aborted or offline: keep the search form usable */
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) return go(items[active].href);
          if (q.trim()) go(`/products?q=${encodeURIComponent(q.trim())}`);
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">Search rentals</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id={`${listId}-input`}
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, -1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Search washing machines, sofas, laptops…"
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </form>
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-80 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {items.map((s, i) => (
            <li key={`${s.type}-${s.href}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s.href)}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm ${i === active ? "bg-secondary" : ""}`}
              >
                {s.type === "category" ? <Tag className="h-4 w-4 text-muted-foreground" aria-hidden /> : <Package className="h-4 w-4 text-muted-foreground" aria-hidden />}
                <span className="flex-1 truncate font-medium">{s.label}</span>
                {s.hint && <span className="text-xs text-muted-foreground">{s.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
