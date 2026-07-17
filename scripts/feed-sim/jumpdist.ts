/**
 * Jump-distance analysis over sim results — the diagnostic behind the run-based
 * feed spec (docs/specs/2026-07-16-run-based-feed-design.md).
 *
 * Question: what does the reader-felt topical jump between CONSECUTIVELY SHOWN
 * cards look like? The spec claims the current engine produces a unimodal
 * medium-distance walk (every card a moderate hop) and the run model should make
 * it bimodal (near-zero within runs, far at breaks). This script measures the
 * baseline before any knob moves.
 *
 * Distances are computed in path order — what the user actually scrolls past —
 * regardless of the engine's detour-tip mechanics. That matters: a surprise card
 * is followed by a card built from the PRE-surprise tip, so one surprise creates
 * up to TWO felt jumps (into the tangent, back out of it). Transitions are
 * therefore segmented: normal, surprise (into), post-surprise (back out).
 *
 * Three similarity lenses per transition (reported as similarity in [0,1]):
 *  - catJaccard:      Jaccard over exact non-hidden category titles
 *  - catTokenJaccard: Jaccard over normalized category-name tokens (digits kept —
 *                     era/region categories are digit-laden: "1st-century BC")
 *  - lexJaccard:      Jaccard over engine tokens of title + description
 *
 * The seed -> card-1 transition is skipped (seeds carry no categories in the sim).
 * Means come with cluster bootstrap CIs (resampling journeys, not transitions —
 * transitions within a walk are correlated).
 *
 * Run: bun run jumpdist.ts [mode]   # reads results-<mode>.json, default 'main'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { tokenSet } from '../../src/lib/feed/tokens.ts';

interface PathStep {
	title: string;
	description: string | null;
	categories: string[];
	surprised: boolean;
}
interface Journey {
	seed: string;
	persona: string;
	arm: 'adaptive' | 'control';
	path: PathStep[];
}

type TransitionKind = 'normal' | 'surprise' | 'post-surprise';
interface Transition {
	journey: number;
	kind: TransitionKind;
	catJaccard: number | null; // null when either side has no categories
	catTokenJaccard: number | null;
	lexJaccard: number;
}

// Category-name tokens. The engine tokenizer drops digits, but era categories
// live in digits ("27 BC", "1st-century establishments"), so this keeps them.
const CAT_GLUE = new Set(['the', 'of', 'in', 'and', 'by', 'from', 'with', 'to', 'or', 'for']);
function catTokens(categories: string[]): Set<string> {
	const out = new Set<string>();
	for (const cat of categories) {
		const name = cat.replace(/^Category:/, '').toLowerCase();
		for (const m of name.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []) {
			if (!CAT_GLUE.has(m) && (m.length >= 2 || /\d/.test(m))) out.add(m);
		}
	}
	return out;
}

function jaccard(a: Set<string>, b: Set<string>): number | null {
	if (a.size === 0 || b.size === 0) return null;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	return inter / (a.size + b.size - inter);
}

function transitions(journeys: Journey[]): Transition[] {
	const out: Transition[] = [];
	journeys.forEach((j, ji) => {
		for (let i = 1; i < j.path.length; i++) {
			const prev = j.path[i - 1];
			const cur = j.path[i];
			const kind: TransitionKind = cur.surprised
				? 'surprise'
				: prev.surprised
					? 'post-surprise'
					: 'normal';
			const lex = jaccard(
				tokenSet(`${prev.title} ${prev.description ?? ''}`),
				tokenSet(`${cur.title} ${cur.description ?? ''}`)
			);
			out.push({
				journey: ji,
				kind,
				catJaccard: jaccard(new Set(prev.categories), new Set(cur.categories)),
				catTokenJaccard: jaccard(catTokens(prev.categories), catTokens(cur.categories)),
				lexJaccard: lex ?? 0
			});
		}
	});
	return out;
}

// ----------------------------------------------------------------------------
// Stats. Bootstrap resamples JOURNEYS (cluster bootstrap) because transitions
// within one walk share a profile and a neighborhood — treating them as iid
// would understate the CI.
// ----------------------------------------------------------------------------
function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return NaN;
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function bootstrapCi(
	byJourney: Map<number, number[]>,
	iterations = 1000
): { lo: number; hi: number } {
	const rng = mulberry32(20260716);
	const keys = [...byJourney.keys()];
	const means: number[] = [];
	for (let it = 0; it < iterations; it++) {
		let sum = 0;
		let n = 0;
		for (let k = 0; k < keys.length; k++) {
			const vals = byJourney.get(keys[Math.floor(rng() * keys.length)])!;
			for (const v of vals) {
				sum += v;
				n++;
			}
		}
		if (n > 0) means.push(sum / n);
	}
	means.sort((a, b) => a - b);
	return { lo: quantile(means, 0.025), hi: quantile(means, 0.975) };
}

interface Summary {
	n: number;
	journeys: number;
	mean: number;
	ci: { lo: number; hi: number };
	sd: number;
	p25: number;
	p50: number;
	p75: number;
	histogram: number[]; // 10 bins over [0,1]
}

function summarize(values: { journey: number; value: number }[]): Summary | null {
	if (values.length === 0) return null;
	const nums = values.map((v) => v.value).sort((a, b) => a - b);
	const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
	const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
	const byJourney = new Map<number, number[]>();
	for (const v of values) {
		if (!byJourney.has(v.journey)) byJourney.set(v.journey, []);
		byJourney.get(v.journey)!.push(v.value);
	}
	const histogram = new Array(10).fill(0);
	for (const v of nums) histogram[Math.min(9, Math.floor(v * 10))]++;
	return {
		n: nums.length,
		journeys: byJourney.size,
		mean,
		ci: bootstrapCi(byJourney),
		sd,
		p25: quantile(nums, 0.25),
		p50: quantile(nums, 0.5),
		p75: quantile(nums, 0.75),
		histogram
	};
}

// ----------------------------------------------------------------------------
// Report.
// ----------------------------------------------------------------------------
function bar(count: number, total: number, width = 40): string {
	const share = total > 0 ? count / total : 0;
	return '#'.repeat(Math.round(share * width)).padEnd(width) + ` ${(share * 100).toFixed(1)}%`;
}

function renderSummary(label: string, s: Summary | null): string {
	if (!s) return `### ${label}\n\n(no transitions)\n`;
	const lines = [
		`### ${label}`,
		'',
		`n=${s.n} transitions across ${s.journeys} journeys`,
		`mean similarity ${s.mean.toFixed(3)} (95% CI ${s.ci.lo.toFixed(3)}-${s.ci.hi.toFixed(3)}, cluster bootstrap by journey), sd ${s.sd.toFixed(3)}`,
		`quartiles p25=${s.p25.toFixed(3)} p50=${s.p50.toFixed(3)} p75=${s.p75.toFixed(3)}`,
		'',
		'```'
	];
	for (let b = 0; b < 10; b++) {
		lines.push(
			`${(b / 10).toFixed(1)}-${((b + 1) / 10).toFixed(1)}  ${bar(s.histogram[b], s.n)}`
		);
	}
	lines.push('```', '');
	return lines.join('\n');
}

const mode = process.argv[2] ?? 'main';
const journeys: Journey[] = JSON.parse(
	readFileSync(`${import.meta.dir}/results-${mode}.json`, 'utf8')
);

const missingFields = journeys.some((j) => j.path.some((p) => p.categories === undefined));
if (missingFields) {
	console.error(
		`results-${mode}.json predates path categories/description recording — re-run sim.ts first.`
	);
	process.exit(1);
}

const all = transitions(journeys);

// Category coverage — if categories were truncated at fetch time this surfaces it.
const steps = journeys.flatMap((j) => j.path);
const withCats = steps.filter((p) => p.categories.length > 0).length;
const avgCats = steps.reduce((a, p) => a + p.categories.length, 0) / Math.max(1, steps.length);

const kinds: TransitionKind[] = ['normal', 'surprise', 'post-surprise'];
const metrics = [
	['catJaccard', 'Category Jaccard (exact titles)'],
	['catTokenJaccard', 'Category token Jaccard (era/region-aware)'],
	['lexJaccard', 'Lexical Jaccard (title + description tokens)']
] as const;

const out: string[] = [
	`# Jump-distance report — results-${mode}.json`,
	'',
	`${journeys.length} journeys, ${steps.length} served cards, ${all.length} consecutive transitions`,
	`(seed -> card-1 transitions excluded: sim seeds carry no categories)`,
	'',
	`Category coverage: ${withCats}/${steps.length} cards (${((100 * withCats) / steps.length).toFixed(1)}%) have >=1 non-hidden category; mean ${avgCats.toFixed(1)} per card.`,
	'',
	'Similarity in [0,1]; 1 = same neighborhood, 0 = disjoint. "Distance" = 1 - similarity.',
	''
];

for (const [key, label] of metrics) {
	out.push(`## ${label}`, '');
	const usable = all.filter((t) => t[key] !== null);
	const dropped = all.length - usable.length;
	if (dropped > 0)
		out.push(`(${dropped} transitions dropped — one side lacked data for this metric)`, '');
	out.push(
		renderSummary(
			'All transitions (pooled reader-felt distribution)',
			summarize(usable.map((t) => ({ journey: t.journey, value: t[key]! })))
		)
	);
	for (const kind of kinds) {
		out.push(
			renderSummary(
				`${kind} (${kind === 'surprise' ? 'into a tangent' : kind === 'post-surprise' ? 'back out of a detour' : 'engine top-K pick'})`,
				summarize(
					usable.filter((t) => t.kind === kind).map((t) => ({ journey: t.journey, value: t[key]! }))
				)
			)
		);
	}
}

const report = out.join('\n');
writeFileSync(`${import.meta.dir}/report-jumpdist-${mode}.md`, report);
console.log(report);
console.error(`\nWrote report-jumpdist-${mode}.md`);
