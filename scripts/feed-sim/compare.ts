/** Compare two result sets (baseline vs new config) on the metrics that matter.
 *  Usage: bun run compare.ts "one-line description of the config change" */
import { readFileSync } from 'node:fs';

interface PathStep {
	title: string;
	onInterest: boolean;
	tier: 'core' | 'broad' | null;
	surprised?: boolean;
	intrigue?: number;
	spec?: number;
}
interface Journey {
	seed: string; persona: string; arm: 'adaptive' | 'control'; rngSeed: number;
	path: PathStep[]; firstCoreStep: number | null; firstBroadStep: number | null;
	sinkLandings: { political: boolean }[]; deadEndedAt: number | null;
}
const load = (f: string): Journey[] => JSON.parse(readFileSync(`${import.meta.dir}/${f}`, 'utf8'));
const A = load('results-baseline.json');
const B = load('results-main.json');

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => xs.length < 2 ? 0 : Math.sqrt(xs.reduce((a, b) => a + (b - mean(xs)) ** 2, 0) / (xs.length - 1));
const ci = (xs: number[]) => 1.96 * std(xs) / Math.sqrt(Math.max(1, xs.length));
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const oi = (j: Journey) => (j.path.length ? j.path.filter((p) => p.onInterest).length / j.path.length : null);
const coldStart = (J: Journey[]) => J.filter((j) => j.arm === 'control' && j.persona === 'balanced');
const personas = [...new Set(A.filter((j) => j.persona !== 'balanced').map((j) => j.persona))];

console.log('# Baseline vs New config\n');
console.log(`${process.argv[2] ?? '(pass a change description as argv[2])'}\n`);

// ----------------------------------------------------------------------------
// Cold open — opening-card feel (cold-start balanced arm). Path index i is the
// card chosen at engine stepIndex i+1, so the first 5 entries are the cards the
// opening pacing/epsilon schedule governs and index >= 6 is steady state.
// ----------------------------------------------------------------------------
console.log('## Cold open — opening-card feel (cold-start balanced, n=' + coldStart(A).length + '/arm)');
{
	const csA = coldStart(A);
	const csB = coldStart(B);
	const firstSurprise = (j: Journey) => {
		const i = j.path.findIndex((p) => p.surprised);
		return i === -1 ? null : i + 1;
	};
	const frac = (J: Journey[], f: (j: Journey) => boolean) =>
		J.filter(f).length / Math.max(1, J.length);
	const fracRows: [string, (j: Journey) => boolean][] = [
		['surprise on card 1', (j) => firstSurprise(j) === 1],
		['surprise within 5 cards', (j) => { const s = firstSurprise(j); return s !== null && s <= 5; }],
		['any cluster by step 5', (j) => j.firstBroadStep !== null && j.firstBroadStep <= 5]
	];
	for (const [label, f] of fracRows)
		console.log(`  ${label.padEnd(28)} ${pct(frac(csA, f))}  ->  ${pct(frac(csB, f))}`);

	const hasHooks = (J: Journey[]) => J.some((j) => j.path.some((p) => p.intrigue !== undefined));
	if (hasHooks(csA) && hasHooks(csB)) {
		const perJourney = (J: Journey[], lo: number, hi: number, key: 'intrigue' | 'spec') =>
			J.map((j) => j.path.slice(lo, hi))
				.filter((s) => s.length > 0)
				.map((s) => mean(s.map((p) => p[key] ?? 0)));
		const hookRows: [string, number, number, 'intrigue' | 'spec'][] = [
			['mean intrigue, cards 1-5', 0, 5, 'intrigue'],
			['mean intrigue, cards 7+', 6, Number.MAX_SAFE_INTEGER, 'intrigue'],
			['mean specificity, cards 1-5', 0, 5, 'spec']
		];
		for (const [label, lo, hi, key] of hookRows) {
			const a = perJourney(csA, lo, hi, key);
			const b = perJourney(csB, lo, hi, key);
			console.log(
				`  ${label.padEnd(28)} ${mean(a).toFixed(2)}±${ci(a).toFixed(2)}  ->  ${mean(b).toFixed(2)}±${ci(b).toFixed(2)}`
			);
		}
	} else {
		console.log('  (per-step intrigue/spec missing in a result set — rerun sim.ts to record them)');
	}
	const steadyRate = (J: Journey[]) => {
		const s = J.flatMap((j) => j.path.slice(6));
		return s.length ? s.filter((p) => p.surprised).length / s.length : 0;
	};
	console.log(`  ${'steady surprise rate (7+)'.padEnd(28)} ${pct(steadyRate(csA))}  ->  ${pct(steadyRate(csB))}\n`);
}

console.log('## Goal 2 — cluster drift (cold-start balanced, n=' + coldStart(A).length + ')');
for (const [label, sel] of [
	['reached "Adolf Hitler"', (J: Journey[]) => J.filter((j) => j.path.some((p) => p.title === 'Adolf Hitler')).length],
	['reached core', (J: Journey[]) => J.filter((j) => j.firstCoreStep !== null).length],
	['reached any cluster', (J: Journey[]) => J.filter((j) => j.firstBroadStep !== null).length]
] as const) {
	const a = sel(coldStart(A)) / coldStart(A).length;
	const b = sel(coldStart(B)) / coldStart(B).length;
	console.log(`  ${label.padEnd(22)} ${pct(a)}  ->  ${pct(b)}`);
}
const landings = (J: Journey[]) => J.flatMap((j) => j.sinkLandings);
const fired = (J: Journey[]) => { const l = landings(J); return `${l.filter((x) => x.political).length}/${l.length}`; };
console.log(`  political penalty fired   ${fired(A)}  ->  ${fired(B)}  (all arms)\n`);

console.log('## Goal 1 — on-interest rate, control vs adaptive, baseline -> new');
console.log('persona      | ctrl base -> new        | adpt base -> new        | lift base -> new');
for (const p of personas) {
	const cA = A.filter((j) => j.persona === p && j.arm === 'control').map(oi).filter((x): x is number => x !== null);
	const aA = A.filter((j) => j.persona === p && j.arm === 'adaptive').map(oi).filter((x): x is number => x !== null);
	const cB = B.filter((j) => j.persona === p && j.arm === 'control').map(oi).filter((x): x is number => x !== null);
	const aB = B.filter((j) => j.persona === p && j.arm === 'adaptive').map(oi).filter((x): x is number => x !== null);
	const lA = mean(aA) - mean(cA), lB = mean(aB) - mean(cB);
	console.log(
		`${p.padEnd(12)} | ${pct(mean(cA))} -> ${pct(mean(cB))}`.padEnd(40) +
		` | ${pct(mean(aA))}±${pct(ci(aA))} -> ${pct(mean(aB))}±${pct(ci(aB))}`.padEnd(40) +
		` | ${lA >= 0 ? '+' : ''}${pct(lA)} -> ${lB >= 0 ? '+' : ''}${pct(lB)}`
	);
}
const pooledLift = (J: Journey[]) => {
	const c = J.filter((j) => j.persona !== 'balanced' && j.arm === 'control').map(oi).filter((x): x is number => x !== null);
	const a = J.filter((j) => j.persona !== 'balanced' && j.arm === 'adaptive').map(oi).filter((x): x is number => x !== null);
	return { c: mean(c), a: mean(a), ciA: ci(a), ciC: ci(c), lift: mean(a) - mean(c) };
};
const pA = pooledLift(A), pB = pooledLift(B);
console.log(`\n  POOLED control  ${pct(pA.c)}±${pct(pA.ciC)} -> ${pct(pB.c)}±${pct(pB.ciC)}`);
console.log(`  POOLED adaptive ${pct(pA.a)}±${pct(pA.ciA)} -> ${pct(pB.a)}±${pct(pB.ciA)}`);
console.log(`  POOLED lift     ${pA.lift >= 0 ? '+' : ''}${pct(pA.lift)} -> ${pB.lift >= 0 ? '+' : ''}${pct(pB.lift)}`);

const health = (J: Journey[]) => `mean len ${mean(J.map((j) => j.path.length)).toFixed(1)}, dead-ends ${J.filter((j) => j.deadEndedAt !== null).length}/${J.length}`;
console.log(`\n## Run health\n  baseline: ${health(A)}\n  new:      ${health(B)}`);
