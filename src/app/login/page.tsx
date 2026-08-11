"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Wrong passphrase.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xs flex-col items-center gap-6 py-32">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-lg font-semibold tracking-wide">
          recall
        </span>
        <span className="size-1.5 translate-y-[-2px] rounded-full bg-primary" />
      </div>
      <form onSubmit={submit} className="flex w-full flex-col gap-3">
        <Input
          type="password"
          autoFocus
          placeholder="Passphrase"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <p className="text-xs text-warn">{error}</p> : null}
        <Button type="submit" disabled={busy || !password}>
          {busy ? "…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}
