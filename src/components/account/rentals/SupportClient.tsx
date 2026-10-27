"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Empty, Skeleton, fmtDate } from "./ui";

export default function SupportClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const agreementId = useSearchParams().get("agreement") ?? undefined;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["tickets"], enabled: !!user, queryFn: async () => (await authFetch<{ tickets: any[] }>("/api/support")).tickets });
  const create = useMutation({
    mutationFn: () => authFetch("/api/support", { method: "POST", json: { subject, body, agreementId: agreementId && /^[0-9a-f-]{36}$/i.test(agreementId) ? agreementId : undefined } }),
    onSuccess: () => { setSubject(""); setBody(""); qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
  return (
    <div className="space-y-8">
      <h1 className="t-display text-3xl">Support</h1>
      <form className="panel space-y-3 p-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <h2 className="text-base font-semibold">Contact us</h2>
        {agreementId && <p className="text-xs text-muted-foreground">This request will be linked to your rental.</p>}
        <label className="block text-sm font-medium">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} className="mt-1 h-11 w-full rounded-md border border-input bg-card px-3" /></label>
        <label className="block text-sm font-medium">How can we help?<textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000} className="mt-1 w-full rounded-md border border-input bg-card p-3 text-sm" /></label>
        {create.isError && <p role="alert" className="text-sm text-destructive">{(create.error as Error).message}</p>}
        {create.isSuccess && <p role="status" className="text-sm text-success">Thanks, we have received your request.</p>}
        <Button type="submit" className="h-11" disabled={create.isPending || subject.trim().length < 3 || body.trim().length < 10}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Sending" /> : "Send request"}</Button>
      </form>
      <section aria-labelledby="mine"><h2 id="mine" className="mb-3 text-lg font-semibold">Your requests</h2>
        {isLoading ? <Skeleton rows={2} /> : !data?.length ? <Empty title="No requests yet" /> : <ul className="panel divide-y divide-border">{data.map((t) => <li key={t.id} className="p-4 text-sm"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{t.subject}</span><span className="chip">{t.status}</span></div><p className="mt-1 line-clamp-2 text-muted-foreground">{t.body}</p><p className="mt-1 text-xs text-muted-foreground">{fmtDate(t.created_at)}</p></li>)}</ul>}
      </section>
    </div>
  );
}
