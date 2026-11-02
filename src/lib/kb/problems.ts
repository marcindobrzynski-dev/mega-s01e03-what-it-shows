// What #4471 holds once each report is placed by what it shows, not by its subject.
// causes.ts places a report by its tenant and channel; this file adds the reports the desk read
// as a one-day move (desk-notes.json). They name the right day and month, a day apart, so no
// day-first reading explains them: they get a problem of their own. They also stay counted where
// the desk files them, so `parser` and `hint` match the desk's own view (CauseTable).
import { causeOf, uniqueById, type Report, type Tenant } from '#lib/kb/causes';

export type Problem = 'parser' | 'hint' | 'shift' | 'unplaced';

export const PROBLEMS: Record<Problem, string> = {
  parser: 'shared parser reads day-first dates month first',
  hint: 'booking-v3 form hints MM/DD/YYYY, then reads the date day first',
  shift: 'date moves by one day',
  unplaced: 'no tenant on file',
};

export function problemsOf(r: Report, t: Tenant | undefined, oneDayMove: readonly string[]): Problem[] {
  const filed = causeOf(r, t) ?? 'unplaced';
  return oneDayMove.includes(r.id) ? [filed, 'shift'] : [filed];
}

export type ProblemGroup = {
  problem: Problem;
  reports: Report[];
  tenants: number;
  channels: Record<string, number>;
  // Reports intake tagged as something other than this problem.
  mistagged: number;
  firstSeen: string;
  lastSeen: string;
};

const tally = (xs: string[]) => xs.reduce<Record<string, number>>((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {});

export function splitTicket(
  all: Report[],
  ticket: number,
  tenantOf: (r: Report) => Tenant | undefined,
  oneDayMove: readonly string[],
): { merged: Report[]; groups: ProblemGroup[]; countedTwice: number; subjects: { subject: string; problems: number }[] } {
  const merged = uniqueById(all).filter((r) => r.mergedInto === ticket);
  const by = new Map<Problem, Report[]>();
  let countedTwice = 0;
  for (const r of merged) {
    const ps = problemsOf(r, tenantOf(r), oneDayMove);
    if (ps.length > 1) countedTwice++;
    for (const p of ps) by.set(p, [...(by.get(p) ?? []), r]);
  }
  const groups = [...by.entries()]
    .map(([problem, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        problem,
        reports: rs,
        tenants: new Set(rs.map((r) => r.tenant)).size,
        channels: tally(rs.map((r) => r.channel)),
        mistagged: rs.filter((r) => r.meta.intakeTag !== problem).length,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);

  // Decision 0001 merges on subject. A subject that spans problems is a merge that was wrong.
  const problemsBySubject = new Map<string, Set<Problem>>();
  for (const g of groups)
    for (const r of g.reports) {
      const key = r.subject.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim();
      problemsBySubject.set(key, (problemsBySubject.get(key) ?? new Set()).add(g.problem));
    }
  const subjects = [...problemsBySubject.entries()]
    .map(([subject, ps]) => ({ subject, problems: ps.size }))
    .sort((a, b) => b.problems - a.problems || a.subject.localeCompare(b.subject));

  return { merged, groups, countedTwice, subjects };
}
