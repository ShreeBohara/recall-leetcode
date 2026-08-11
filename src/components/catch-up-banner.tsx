"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { BacklogState } from "@/lib/backlog";

export function CatchUpBanner({ backlog }: { backlog: BacklogState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function spread() {
    setBusy(true);
    try {
      const res = await fetch("/api/backlog", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(
        `${data.postponed} reviews spread over ${data.days} day${data.days === 1 ? "" : "s"} — the most at-risk ${data.kept} stay today. Memories safe.`
      );
      router.refresh();
    } catch {
      toast.error("Couldn't spread the backlog — try again.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-accent/50 px-4 py-3">
      <div className="text-sm">
        <span className="font-medium">
          Catch-up plan: ~{backlog.cap} a day for ~{backlog.days} days.
        </span>{" "}
        <span className="text-muted-foreground">
          Today&apos;s session is the {backlog.cap} most rescuable memories —
          no need to clear all {backlog.dueCount}.
        </span>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={spread}>
        {busy ? "Spreading…" : "I was away — spread it out"}
      </Button>
    </div>
  );
}
