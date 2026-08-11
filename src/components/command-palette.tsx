"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export interface PaletteProblem {
  id: number;
  number: number | null;
  title: string;
}

export function CommandPalette({
  problems,
  dueCount,
}: {
  problems: PaletteProblem[];
  dueCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Recall" description="Jump anywhere">
      <CommandInput placeholder="Type a command or problem name…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          {dueCount > 0 ? (
            <CommandItem onSelect={() => go("/review")}>
              Start review session
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {dueCount} due
              </span>
            </CommandItem>
          ) : null}
          <CommandItem onSelect={() => go("/log")}>Log a problem</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go("/")}>Today</CommandItem>
          <CommandItem onSelect={() => go("/library")}>Library</CommandItem>
          <CommandItem onSelect={() => go("/insights")}>Insights</CommandItem>
        </CommandGroup>
        {problems.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Problems">
              {problems.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.number ?? ""} ${p.title}`}
                  onSelect={() => go(`/library/${p.id}`)}
                >
                  {p.number ? `${p.number}. ` : ""}
                  {p.title}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
