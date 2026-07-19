/**
 * Directional-tangent report over a sim results file: how often breaks land
 * with a nameable held dimension, how the labels distribute, and a sample of
 * labeled landings (with their run context) for hand-checking precision —
 * the departments validation recipe applied to directions.
 *
 *   bun run directions-report.ts [main]
 */
import { readFileSync } from 'node:fs';

type Step = {
	title: string;
	description: string | null;
	surprised: boolean;
	direction: 'era' | 'place' | 'theme' | null;
	runReset: boolean;
	healed: boolean;
};
type Journey = { seed: string; persona: string; arm: string; path: Step[] };

const mode = process.argv[2] ?? 'main';
const journeys: Journey[] = JSON.parse(
	readFileSync(`${import.meta.dir}/results-${mode}.json`, 'utf8')
);

const tangents: { step: Step; prev: Step[]; seed: string }[] = [];
for (const j of journeys) {
	for (let i = 0; i < j.path.length; i++) {
		const step = j.path[i];
		if (!step.surprised) continue;
		// The run the tangent broke from: walk back to the previous reset (or seed).
		const prev: Step[] = [];
		for (let k = i - 1; k >= 0 && prev.length < 5; k--) {
			prev.unshift(j.path[k]);
			if (j.path[k].runReset) break;
		}
		tangents.push({ step, prev, seed: j.seed });
	}
}

const byDirection = new Map<string, number>();
for (const t of tangents) {
	const d = t.step.direction ?? 'wild';
	byDirection.set(d, (byDirection.get(d) ?? 0) + 1);
}

const total = tangents.length;
const directed = total - (byDirection.get('wild') ?? 0);
console.log(`${journeys.length} journeys, ${total} tangent landings`);
console.log(
	`directed: ${directed} (${((100 * directed) / total).toFixed(1)}%)  wild: ${byDirection.get('wild') ?? 0}`
);
for (const d of ['era', 'place', 'theme']) {
	const n = byDirection.get(d) ?? 0;
	console.log(`  ${d.padEnd(6)} ${String(n).padStart(5)}  (${((100 * n) / total).toFixed(1)}%)`);
}

// Healed (fast-skipped) rate per label — a directed tangent that gets skipped
// MORE than wild ones would mean the labels are lying.
console.log('\nhealed rate by label:');
for (const d of ['era', 'place', 'theme', 'wild']) {
	const of = tangents.filter((t) => (t.step.direction ?? 'wild') === d);
	if (of.length === 0) continue;
	const healed = of.filter((t) => t.step.healed).length;
	console.log(`  ${d.padEnd(6)} ${((100 * healed) / of.length).toFixed(1)}%  (n=${of.length})`);
}

// Hand-check sample: deterministic spread (every Nth) rather than random, so
// re-runs show the same sample.
console.log('\nsample labeled landings (run tail -> tangent):');
const labeled = tangents.filter((t) => t.step.direction);
const stride = Math.max(1, Math.floor(labeled.length / 20));
for (let i = 0; i < labeled.length; i += stride) {
	const t = labeled[i];
	const tail = t.prev
		.slice(-2)
		.map((p) => p.title)
		.join(' -> ');
	console.log(
		`  [${t.step.direction}] ${tail} => ${t.step.title} (${t.step.description ?? 'no description'})`
	);
}
