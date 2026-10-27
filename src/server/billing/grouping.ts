/**
 * A cart can hold items with different durations or start dates. Such items
 * cannot share one recurring schedule, so each distinct (duration, start date)
 * becomes its own rental agreement with its own provider subscription.
 * Items are never silently merged across incompatible schedules.
 */
export interface CartLine {
  lineId: string;
  productId: string;
  planId: string;
  durationMonths: number;
  /** ISO calendar date (YYYY-MM-DD) the rental should start. */
  startDate: string;
}

export interface AgreementGroup<T extends CartLine = CartLine> {
  key: string;
  durationMonths: number;
  startDate: string;
  lines: T[];
}

export function groupCartIntoAgreements<T extends CartLine>(lines: T[]): AgreementGroup<T>[] {
  const groups = new Map<string, AgreementGroup<T>>();
  for (const line of lines) {
    const key = `${line.durationMonths}|${line.startDate}`;
    const existing = groups.get(key);
    if (existing) existing.lines.push(line);
    else
      groups.set(key, {
        key,
        durationMonths: line.durationMonths,
        startDate: line.startDate,
        lines: [line],
      });
  }
  return [...groups.values()].sort((a, b) =>
    a.startDate === b.startDate ? a.durationMonths - b.durationMonths : a.startDate < b.startDate ? -1 : 1,
  );
}
