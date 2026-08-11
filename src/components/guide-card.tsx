"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionTitle } from "@/components/primitives";
import { TUTOR_PROMPT, SUMMARY_TEMPLATE } from "@/lib/guide";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(`${label} copied — paste it into your Claude chat.`);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied ✓" : `Copy ${label.toLowerCase()}`}
    </Button>
  );
}

/** The "how do I actually run a session?" guide, always at hand on the Log page. */
export function GuideCard() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col gap-3 px-5 py-4">
        <SectionTitle>How a session works</SectionTitle>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Claude Code:</strong> just type{" "}
            <code className="rounded bg-secondary px-1 font-mono text-xs">/solve</code> — it
            fetches the next problem and runs the session. Nothing to paste.{" "}
            <strong className="text-foreground">claude.ai:</strong> paste the tutor
            prompt once into a Project called &ldquo;DSA Tutor&rdquo;.
          </li>
          <li>
            Say your confidence (1–5). High → fast path: state your approach,
            code, done. Low → guided, one short question at a time. No pattern
            spoilers either way.
          </li>
          <li>
            Say <strong className="text-foreground">&ldquo;log it&rdquo;</strong> — it saves
            itself and tells you the next review date. (No connector? It emits
            the template below — paste it here.)
          </li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <CopyButton text={TUTOR_PROMPT} label="Tutor prompt" />
          <CopyButton text={SUMMARY_TEMPLATE} label="Template" />
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-mono uppercase tracking-wider hover:text-foreground">
            Preview the tutor prompt
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed">
            {TUTOR_PROMPT}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
