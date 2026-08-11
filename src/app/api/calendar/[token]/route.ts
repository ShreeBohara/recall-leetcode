import ical from "ical-generator";
import { getScheduledProblems } from "@/lib/data";
import { sharedToken } from "@/lib/secrets";

export const dynamic = "force-dynamic";

/**
 * Dynamic iCalendar feed — subscribe once in Google Calendar
 * ("Other calendars → From URL") and every scheduled review shows up.
 * The token is a shared secret in the URL; set CALENDAR_TOKEN in .env.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const expected = sharedToken("CALENDAR_TOKEN");
  if (expected == null || (token !== `${expected}.ics` && token !== expected)) {
    return new Response("Not found", { status: 404 });
  }

  const calendar = ical({
    name: "Recall — LeetCode reviews",
    prodId: { company: "recall", product: "recall", language: "EN" },
    ttl: 60 * 60 * 4,
  });

  // UTC-anchored midnights of the intended LOCAL calendar day: ical-generator
  // serializes all-day dates with UTC getters, so a plain local-midnight Date
  // would come out one day early in any UTC+ timezone.
  const today = new Date();
  const todayStart = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  );

  for (const p of await getScheduledProblems()) {
    const due = new Date(p.due!);
    // Overdue reviews surface on today's calendar, not in the invisible past.
    let day = new Date(
      Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())
    );
    if (day < todayStart) day = todayStart;
    calendar.createEvent({
      id: `recall-problem-${p.id}`,
      start: day,
      allDay: true,
      summary: `Review: ${p.number ? `${p.number}. ` : ""}${p.title}`,
      description: [
        p.url,
        "",
        "2-minute approach recall: state the pattern, the invariant, and the complexity — then check yourself in Recall.",
      ]
        .filter((l) => l != null)
        .join("\n"),
      url: p.url ?? undefined,
    });
  }

  return new Response(calendar.toString(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="recall.ics"',
    },
  });
}
