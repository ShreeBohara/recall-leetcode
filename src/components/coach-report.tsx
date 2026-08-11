"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTitle } from "@/components/primitives";
import { formatDate } from "@/lib/format";

export function CoachReport({
  id,
  weekStart,
  markdown,
}: {
  id: number;
  weekStart: string;
  markdown: string;
}) {
  const router = useRouter();
  const [dismissing, setDismissing] = useState(false);

  async function dismiss() {
    setDismissing(true);
    try {
      const res = await fetch("/api/coach/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Dismiss failed");
      router.refresh();
    } catch {
      toast.error("Couldn't dismiss the report — try again.");
      setDismissing(false);
    }
  }

  return (
    <Card className="border-primary/30 bg-primary/[0.03]">
      <CardContent className="pt-5">
        <div className="mb-3 flex items-center justify-between">
          <SectionTitle>
            Coach report · week of {formatDate(weekStart)}
          </SectionTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={dismiss}
            disabled={dismissing}
          >
            Dismiss
          </Button>
        </div>
        <div className="prose-recall text-sm leading-relaxed">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}
