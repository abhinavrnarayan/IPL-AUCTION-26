// In-memory ring buffer of recent bid timings for a one-shot latency check.
// Lives only in the current Node process — restarts wipe it. That's fine for
// the "should we move bids onto Redis-write-behind?" decision, which only
// needs a snapshot of real production timings, not durable history.

type BidTimingStep = { step: string; ms: number };
type BidTimingRecord = {
  totalMs: number;
  steps: BidTimingStep[];
  recordedAt: number;
  roomCode: string;
  outcome: "ok" | "error";
};

const RING_CAPACITY = 100;
const buffer: BidTimingRecord[] = [];

export function recordBidTiming(record: Omit<BidTimingRecord, "recordedAt">) {
  buffer.push({ ...record, recordedAt: Date.now() });
  if (buffer.length > RING_CAPACITY) {
    buffer.splice(0, buffer.length - RING_CAPACITY);
  }
}

function quantile(sorted: number[], q: number) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

export function getBidTimingSummary() {
  if (buffer.length === 0) {
    return { count: 0, message: "No bids recorded since server start." };
  }

  const okRecords = buffer.filter((r) => r.outcome === "ok");
  const errorCount = buffer.length - okRecords.length;
  const totals = okRecords.map((r) => r.totalMs).sort((a, b) => a - b);

  const stepNames = Array.from(
    new Set(okRecords.flatMap((r) => r.steps.map((s) => s.step))),
  );
  const byStep: Record<string, { p50: number; p95: number; max: number }> = {};
  for (const name of stepNames) {
    const series = okRecords
      .map((r) => {
        const idx = r.steps.findIndex((s) => s.step === name);
        if (idx === -1) return null;
        const prev = idx === 0 ? 0 : r.steps[idx - 1].ms;
        return r.steps[idx].ms - prev; // duration of this step
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (series.length === 0) continue;
    byStep[name] = {
      p50: quantile(series, 0.5),
      p95: quantile(series, 0.95),
      max: series[series.length - 1],
    };
  }

  const slowestStepName = Object.entries(byStep)
    .sort((a, b) => b[1].p95 - a[1].p95)[0]?.[0] ?? null;

  return {
    count: okRecords.length,
    errorCount,
    windowSeconds: okRecords.length > 0
      ? Math.round((Date.now() - okRecords[0].recordedAt) / 1000)
      : 0,
    totals: {
      p50: quantile(totals, 0.5),
      p95: quantile(totals, 0.95),
      max: totals[totals.length - 1],
    },
    slowestStep: slowestStepName,
    byStep,
    recent: okRecords.slice(-5).map((r) => ({
      totalMs: r.totalMs,
      roomCode: r.roomCode,
      ageSeconds: Math.round((Date.now() - r.recordedAt) / 1000),
    })),
  };
}
