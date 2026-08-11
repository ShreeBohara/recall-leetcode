"use client";

import { ActivityCalendar } from "react-activity-calendar";

interface Day {
  date: string;
  count: number;
  level: number;
}

export function Heatmap({ data }: { data: Day[] }) {
  return (
    <div className="overflow-x-auto">
      <ActivityCalendar
        data={data}
        colorScheme="dark"
        theme={{
          // CSS variables so the ramp follows the app theme (monotonic amber).
          light: ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"],
          dark: ["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"],
        }}
        blockSize={11}
        blockMargin={3}
        fontSize={11}
        labels={{
          totalCount: "{{count}} reviews in the last 6 months",
        }}
      />
    </div>
  );
}
