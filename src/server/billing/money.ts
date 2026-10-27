/**
 * Money is always an integer number of paise (1 INR = 100 paise).
 * Floating point never touches a financial calculation: rupee decimals coming
 * from the legacy NUMERIC(10,2) columns are converted once, via string parsing,
 * at the boundary.
 */
export type Paise = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertPaise(value: unknown, label = "amount"): asserts value is Paise {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new MoneyError(`${label} must be a non-negative integer number of paise`);
  }
}

/** Convert a rupee decimal (number or NUMERIC string such as "499.50") to paise. */
export function rupeesToPaise(rupees: number | string | null | undefined): Paise {
  if (rupees === null || rupees === undefined || rupees === "") return 0;
  const text = typeof rupees === "number" ? rupees.toFixed(2) : String(rupees).trim();
  const match = /^(-?)(\d+)(?:\.(\d{1,}))?$/.exec(text);
  if (!match) throw new MoneyError(`Invalid rupee amount: ${String(rupees)}`);
  const [, sign, whole, fraction = ""] = match;
  const frac = (fraction + "00").slice(0, 2);
  // Round half up on the third decimal when present.
  const roundUp = fraction.length > 2 && Number(fraction[2]) >= 5 ? 1 : 0;
  const paise = Number(whole) * 100 + Number(frac) + roundUp;
  if (sign === "-") throw new MoneyError("Negative amounts are not allowed");
  assertPaise(paise);
  return paise;
}

export function paiseToRupees(paise: Paise): number {
  assertPaise(paise);
  return paise / 100;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatINR(paise: Paise): string {
  assertPaise(paise);
  return inr.format(paise / 100);
}

/** Basis points helper: 1800 bps = 18%. Rounds half up using integer math. */
export function percentOfBps(amount: Paise, bps: number): Paise {
  assertPaise(amount);
  if (!Number.isInteger(bps) || bps < 0) throw new MoneyError("bps must be a non-negative integer");
  return Math.floor((amount * bps + 5000) / 10000);
}

export function sum(values: Paise[]): Paise {
  return values.reduce((acc, v) => {
    assertPaise(v);
    return acc + v;
  }, 0);
}
