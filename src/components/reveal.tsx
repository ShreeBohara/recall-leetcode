"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Retrieval-first: solutions and notes stay hidden until deliberately revealed,
 * so opening a problem page never spoils the recall attempt.
 */
export function Reveal({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  if (shown) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10">
      <p className="text-sm text-muted-foreground">
        Approaches, key insight, and tips are hidden.
      </p>
      <p className="max-w-sm text-center text-xs text-muted-foreground">
        Try to recall the pattern, the invariant, and the complexity first —
        then check yourself.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setShown(true)}>
        Reveal notes
      </Button>
    </div>
  );
}
