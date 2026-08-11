import { IngestForm } from "@/components/ingest-form";
import { GuideCard } from "@/components/guide-card";

export const dynamic = "force-dynamic";

export default function LogPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log a problem</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the Problem Log summary from your tutoring session. Recall
          parses it, derives the review grade, and schedules the first review —
          you just confirm.
        </p>
      </div>
      <IngestForm />
      <GuideCard />
    </div>
  );
}
