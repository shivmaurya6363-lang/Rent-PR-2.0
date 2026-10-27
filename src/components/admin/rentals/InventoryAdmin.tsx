"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { authFetch } from "@/lib/api";
import { fmtDate } from "@/components/account/rentals/ui";

const STATES = ["available", "maintenance", "damaged", "retired"] as const;

export default function InventoryAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-inv"], queryFn: async () => (await authFetch<{ products: any[] }>("/api/admin/inventory")).products });
  const units = useQuery({ queryKey: ["admin-units", open], enabled: !!open, queryFn: async () => (await authFetch<{ units: any[] }>(`/api/admin/inventory?productId=${open}`)).units });
  const set = async (unitId: string, status: string) => { try { await authFetch(`/api/admin/inventory/${unitId}`, { method: "POST", json: { status } }); setMsg("Unit updated"); } catch (e: any) { setMsg(e.message); } qc.invalidateQueries({ queryKey: ["admin-units"] }); qc.invalidateQueries({ queryKey: ["admin-inv"] }); };
  const cols = ["available", "reserved", "rented", "pickup_pending", "maintenance", "damaged"] as const;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-muted-foreground">Units follow each product&apos;s stock quantity. Reserved, rented and pickup-pending units change automatically with rentals; here you can take units out of service or return them to stock.</p>
        {msg && <p role="status" className="rounded-md bg-secondary p-3 text-sm">{msg}</p>}
        {error && <p role="alert" className="text-destructive">{(error as Error).message}</p>}
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2">Product</th>{cols.map((c) => <th key={c} className="px-4 py-2 text-right">{c.replace("_", " ")}</th>)}<th className="px-4 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-border">{isLoading ? <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr> : (data ?? []).map((p) => (
              <><tr key={p.product_id} className="cursor-pointer hover:bg-surface/60" onClick={() => setOpen(open === p.product_id ? null : p.product_id)}><td className="px-4 py-3 font-medium"><button className="text-left" aria-expanded={open === p.product_id}>{p.name}</button></td>{cols.map((c) => <td key={c} className={`px-4 py-3 text-right ${c === "available" && p[c] === 0 ? "font-semibold text-destructive" : ""}`}>{p[c]}</td>)}<td className="px-4 py-3 text-right font-semibold">{p.total}</td></tr>
              {open === p.product_id && <tr key={`${p.product_id}-u`}><td colSpan={8} className="bg-surface/40 px-4 py-3">{units.isLoading ? "Loading units…" : <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{(units.data ?? []).map((u) => <li key={u.id} className="panel flex items-center justify-between gap-2 p-3"><span className="min-w-0"><span className="block truncate font-mono text-xs">{u.serial_number ?? u.id.slice(0, 8)}</span><span className="text-xs text-muted-foreground">{u.status.replace("_", " ")}{u.reservation ? ` · ${u.reservation.agreement_number} until ${fmtDate(u.reservation.until)}` : ""}</span></span>
                <select aria-label={`Status of unit ${u.serial_number}`} value={STATES.includes(u.status) ? u.status : ""} onChange={(e) => e.target.value && set(u.id, e.target.value)} disabled={!!u.reservation} className="h-9 rounded-md border border-input bg-card px-2 text-xs"><option value="" disabled>{u.status.replace("_", " ")}</option>{STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></li>)}</ul>}</td></tr>}</>
            ))}</tbody></table>
        </div>
      </div>
    </AdminLayout>
  );
}
