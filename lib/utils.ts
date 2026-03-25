export function mergeClassNames(
  ...values: Array<string | false | null | undefined>
) {
  return values.filter(Boolean).join(" ");
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function formatCurrencyShort(value: number) {
  if (value >= 10_000_000) {
    const crore = value / 10_000_000;
    return `Rs.${crore % 1 === 0 ? crore : crore.toFixed(1)}Cr`;
  }

  if (value >= 100_000) {
    const lakh = value / 100_000;
    return `Rs.${lakh % 1 === 0 ? lakh : lakh.toFixed(1)}L`;
  }

  if (value >= 1_000) {
    const thousand = value / 1_000;
    return `Rs.${thousand % 1 === 0 ? thousand : thousand.toFixed(1)}K`;
  }

  return `Rs.${value}`;
}

export function formatIncrement(value: number) {
  if (value >= 10_000_000) return `${value / 10_000_000}Cr`;
  if (value >= 100_000) return `${value / 100_000}L`;
  return `${value / 1_000}K`;
}

export function formatAmountInput(value: number) {
  if (value >= 10_000_000) {
    const cr = value / 10_000_000;
    return `${cr % 1 === 0 ? cr : cr.toFixed(1)}Cr`;
  }

  if (value >= 100_000) {
    const lakh = value / 100_000;
    return `${lakh % 1 === 0 ? lakh : lakh.toFixed(1)}L`;
  }

  if (value >= 1_000) {
    const thousand = value / 1_000;
    return `${thousand % 1 === 0 ? thousand : thousand.toFixed(1)}K`;
  }

  return String(value);
}

export function parseAmountInput(value: string) {
  const normalized = value
    .trim()
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/rs\.?/gi, "")
    .replace(/inr/gi, "")
    .replace(/₹/g, "");

  if (!normalized) {
    throw new Error("Enter an amount like 50L or 2Cr.");
  }

  const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)(cr|crore|crores|l|lac|lakh|lakhs|k|thousand)?$/i);

  if (!match) {
    throw new Error("Use a purse amount like 50L, 1.5Cr, 250K, or 2500000.");
  }

  const amount = Number(match[1]);
  const suffix = (match[2] ?? "").toLowerCase();

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a valid non-negative purse amount.");
  }

  if (suffix === "cr" || suffix === "crore" || suffix === "crores") {
    return Math.round(amount * 10_000_000);
  }

  if (suffix === "l" || suffix === "lac" || suffix === "lakh" || suffix === "lakhs") {
    return Math.round(amount * 100_000);
  }

  if (suffix === "k" || suffix === "thousand") {
    return Math.round(amount * 1_000);
  }

  return Math.round(amount);
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Something went wrong.";
}

export function deriveRoleLabel(member: {
  isAdmin: boolean;
  isPlayer: boolean;
}) {
  if (member.isAdmin && member.isPlayer) {
    return "Admin + Player";
  }

  if (member.isAdmin) {
    return "Admin";
  }

  return "Player";
}

export function safeJsonParse<T>(value: string, fallback: T) {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
