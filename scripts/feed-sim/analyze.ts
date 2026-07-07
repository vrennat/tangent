/** Aggregate sim journeys into the two answers + a sink-leak diagnostic. */
import { readFileSync, writeFileSync } from 'node:fs';

interface PathStep {
	title: string;
	surprised: boolean;
	onInterest: boolean;
	tier: 'core' | 'broad' | null;
	intrigue?: number;
	spec?: number;
}
interface Journey {
	seed: string;
	persona: string;
	arm: 'adaptive' | 'control';
	rngSeed: number;
	path: PathStep[];
	firstCoreStep: number | null;
	firstBroadStep: number | null; // first hit of ANY cluster tier
	sinkLandings: { step: number; title: string; tier: string; political: boolean; score: number; terms: Record<string, number> }[];
	deadEndedAt: number | null;
}

const mode = process.argv[2] ?? 'main';
const J: Journey[] = JSON.parse(readFileSync(`${import.meta.dir}/results-${mode}.json`, 'utf8'));

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const std = (xs: number[]) => {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const ci95 = (xs: number[]) => 1.96 * (std(xs) / Math.sqrt(Math.max(1, xs.length))); // SEM-based

const hitTitle = (j: Journey, t: string) => j.path.some((p) => p.title === t);
const onInterestRate = (j: Journey) => {
	if (j.path.length === 0) return null;
	return j.path.filter((p) => p.onInterest).length / j.path.length;
};

let out = `# Tangent feed-algorithm simulation — results (${mode})\n\n`;
out += `Journeys: ${J.length}. Engine: the shipped \`fetchExploreCandidates\` + \`selectNext\` over live Wikipedia, web traversal + engagement-profile logic replicated faithfully. Taste = balanced in all arms (the realistic default); shaping in the adaptive arm comes only from learned token weights via simulated dwell/like/skip.\n\n`;

// ============================================================================
// GOAL 2 — drift to the Hitler / Nazi cluster
// ============================================================================
out += `## Goal 2 — how often does a rabbit hole reach the Hitler / Nazi cluster?\n\n`;
out += `**core** = Hitler / Nazi / Third Reich / Holocaust apparatus. **any cluster** = core + broader 20th-c authoritarian/world-war (Soviet Union, WWI/WWII, fascism, Stalin). Journey length capped at 30 cards.\n\n`;

function clusterTable(js: Journey[], label: string) {
	const n = js.length;
	if (n === 0) return '';
	const core = js.filter((j) => j.firstCoreStep !== null).length;
	const any = js.filter((j) => j.firstBroadStep !== null).length;
	const hitler = js.filter((j) => hitTitle(j, 'Adolf Hitler')).length;
	const nazi = js.filter((j) => hitTitle(j, 'Nazi Germany')).length;
	return `| ${label} | ${n} | ${pct(hitler / n)} | ${pct(core / n)} | ${pct(any / n)} | ${pct(nazi / n)} |\n`;
}

const coldStart = J.filter((j) => j.arm === 'control' && j.persona === 'balanced');
out += `### Default new user (cold-start, balanced taste, no engagement) — the screenshot scenario\n\n`;
out += `| group | n | reached "Adolf Hitler" | reached core (Nazi/Hitler) | reached any cluster | reached "Nazi Germany" |\n`;
out += `|---|---|---|---|---|---|\n`;
out += clusterTable(coldStart, 'all diverse seeds');
// per seed
const seeds = [...new Set(coldStart.map((j) => j.seed))];
for (const s of seeds) out += clusterTable(coldStart.filter((j) => j.seed === s), s);
out += `\n`;

// cumulative curve (cold start): fraction touched core / any by step k
out += `### Cumulative drift (cold-start): fraction of journeys that have touched the cluster by step k\n\n`;
out += `| by step | reached core | reached any cluster |\n|---|---|---|\n`;
for (const k of [1, 3, 5, 10, 15, 20, 30]) {
	const core = coldStart.filter((j) => j.firstCoreStep !== null && j.firstCoreStep <= k).length;
	const any = coldStart.filter((j) => j.firstBroadStep !== null && j.firstBroadStep <= k).length;
	out += `| ≤${k} | ${pct(core / coldStart.length)} | ${pct(any / coldStart.length)} |\n`;
}
out += `\n`;

// adaptive vs control cluster rate by persona (does learning steer away from / into the sink?)
out += `### Does learning change the drift? (cluster rate by persona & arm)\n\n`;
out += `| persona | arm | n | reached core | reached any |\n|---|---|---|---|---|\n`;
for (const persona of [...new Set(J.filter((j) => j.persona !== 'balanced').map((j) => j.persona))]) {
	for (const arm of ['control', 'adaptive'] as const) {
		const js = J.filter((j) => j.persona === persona && j.arm === arm);
		const core = js.filter((j) => j.firstCoreStep !== null).length;
		const any = js.filter((j) => j.firstBroadStep !== null).length;
		out += `| ${persona} | ${arm} | ${js.length} | ${pct(core / js.length)} | ${pct(any / js.length)} |\n`;
	}
}
out += `\n`;

// ============================================================================
// Sink leak diagnostic — WHY does the political filter miss it?
// ============================================================================
out += `## Sink leak diagnostic — why the political penalty does not stop it\n\n`;
const allLandings = J.flatMap((j) => j.sinkLandings);
const byTitle = new Map<string, { n: number; political: number; scores: number[]; tier: string }>();
for (const l of allLandings) {
	const e = byTitle.get(l.title) ?? { n: 0, political: 0, scores: [], tier: l.tier };
	e.n++;
	if (l.political) e.political++;
	e.scores.push(l.score);
	byTitle.set(l.title, e);
}
const totalLandings = allLandings.length;
const caught = allLandings.filter((l) => l.political).length;
out += `Across **${totalLandings}** cluster landings (all arms), the −500 political penalty fired on **${caught}** of them (**${pct(caught / Math.max(1, totalLandings))}**). The rest scored as ordinary high-quality history cards.\n\n`;
out += `Most-landed cluster pages (by frequency), with how the engine scored them:\n\n`;
out += `| title | tier | landings | political penalty fired | mean score |\n|---|---|---|---|---|\n`;
const top = [...byTitle.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 15);
for (const [title, e] of top) {
	out += `| ${title} | ${e.tier} | ${e.n} | ${e.political}/${e.n} | ${mean(e.scores).toFixed(2)} |\n`;
}
out += `\n`;
// a representative breakdown
const hitlerLanding = allLandings.find((l) => l.title === 'Adolf Hitler');
if (hitlerLanding) {
	out += `Representative score breakdown for an "Adolf Hitler" landing (political penalty = ${hitlerLanding.political ? '−500 FIRED' : '0, MISSED'}):\n\n`;
	out += '```\n';
	for (const [k, v] of Object.entries(hitlerLanding.terms)) out += `  ${k.padEnd(13)} ${v.toFixed(2)}\n`;
	out += `  ${'TOTAL'.padEnd(13)} ${hitlerLanding.score.toFixed(2)}\n`;
	out += '```\n\n';
}

// ============================================================================
// GOAL 1 — does engagement shape the stream toward the user's interest?
// ============================================================================
out += `## Goal 1 — does selective engagement shape the feed toward the user's interest?\n\n`;
out += `On-interest rate = fraction of served cards (excluding seed) matching the persona's topic (\`tasteAffinity > 0\`). **Adaptive** = the reader dwells on / likes on-topic cards and skips off-topic ones. **Control** = identical walks with no engagement (pure cold-start scoring). Both arms scored by the same classifier, so *adaptive − control* attributes the lift to the learning loop (it also nets out topical locality, which both arms share). Per-journey rates; mean ± 95% CI across seeds × RNG seeds.\n\n`;
out += `| persona | control on-interest | adaptive on-interest | lift | n/arm |\n|---|---|---|---|---|\n`;
const personas = [...new Set(J.filter((j) => j.persona !== 'balanced').map((j) => j.persona))];
const liftRows: { persona: string; lift: number }[] = [];
for (const persona of personas) {
	const ctrl = J.filter((j) => j.persona === persona && j.arm === 'control').map(onInterestRate).filter((x): x is number => x !== null);
	const adpt = J.filter((j) => j.persona === persona && j.arm === 'adaptive').map(onInterestRate).filter((x): x is number => x !== null);
	const lift = mean(adpt) - mean(ctrl);
	liftRows.push({ persona, lift });
	out += `| ${persona} | ${pct(mean(ctrl))} ±${pct(ci95(ctrl))} | ${pct(mean(adpt))} ±${pct(ci95(adpt))} | ${lift >= 0 ? '+' : ''}${pct(lift)} | ${ctrl.length} |\n`;
}
// pooled
const ctrlAll = J.filter((j) => j.persona !== 'balanced' && j.arm === 'control').map(onInterestRate).filter((x): x is number => x !== null);
const adptAll = J.filter((j) => j.persona !== 'balanced' && j.arm === 'adaptive').map(onInterestRate).filter((x): x is number => x !== null);
out += `| **pooled** | ${pct(mean(ctrlAll))} ±${pct(ci95(ctrlAll))} | ${pct(mean(adptAll))} ±${pct(ci95(adptAll))} | ${mean(adptAll) - mean(ctrlAll) >= 0 ? '+' : ''}${pct(mean(adptAll) - mean(ctrlAll))} | ${ctrlAll.length} |\n\n`;

// trajectory: on-interest by journey third
out += `### Trajectory — on-interest rate by journey third (pooled across personas)\n\n`;
out += `If learning works, the adaptive arm's on-interest rate should climb from early to late thirds while control stays flat.\n\n`;
out += `| third | control | adaptive |\n|---|---|---|\n`;
const thirdRate = (js: Journey[], third: 0 | 1 | 2) => {
	const rates: number[] = [];
	for (const j of js) {
		if (j.path.length < 3) continue;
		const size = Math.floor(j.path.length / 3);
		const slice = third === 0 ? j.path.slice(0, size) : third === 1 ? j.path.slice(size, 2 * size) : j.path.slice(2 * size);
		if (slice.length) rates.push(slice.filter((p) => p.onInterest).length / slice.length);
	}
	return rates;
};
const ctrlJ = J.filter((j) => j.persona !== 'balanced' && j.arm === 'control');
const adptJ = J.filter((j) => j.persona !== 'balanced' && j.arm === 'adaptive');
for (const [label, t] of [['early', 0], ['middle', 1], ['late', 2]] as const) {
	const c = thirdRate(ctrlJ, t);
	const a = thirdRate(adptJ, t);
	out += `| ${label} | ${pct(mean(c))} ±${pct(ci95(c))} | ${pct(mean(a))} ±${pct(ci95(a))} |\n`;
}
out += `\n`;

// ============================================================================
// Cold open — opening-card feel (cold-start arm). Path index i = the card
// chosen at engine stepIndex i+1: entries 0-4 are what the opening pacing and
// epsilon schedule govern; index >= 6 is steady state.
// ============================================================================
out += `## Cold open — opening-card feel (cold-start)\n\n`;
{
	const firstSurprise = (j: Journey) => {
		const i = j.path.findIndex((p) => p.surprised);
		return i === -1 ? null : i + 1;
	};
	const frac = (f: (j: Journey) => boolean) =>
		coldStart.filter(f).length / Math.max(1, coldStart.length);
	out += `| metric | value |\n|---|---|\n`;
	out += `| surprise on card 1 | ${pct(frac((j) => firstSurprise(j) === 1))} |\n`;
	out += `| surprise within 5 cards | ${pct(frac((j) => { const s = firstSurprise(j); return s !== null && s <= 5; }))} |\n`;
	out += `| any cluster by step 5 | ${pct(frac((j) => j.firstBroadStep !== null && j.firstBroadStep <= 5))} |\n`;
	if (coldStart.some((j) => j.path.some((p) => p.intrigue !== undefined))) {
		const perJourney = (lo: number, hi: number, key: 'intrigue' | 'spec') =>
			coldStart
				.map((j) => j.path.slice(lo, hi))
				.filter((s) => s.length > 0)
				.map((s) => mean(s.map((p) => p[key] ?? 0)));
		const early = perJourney(0, 5, 'intrigue');
		const late = perJourney(6, Number.MAX_SAFE_INTEGER, 'intrigue');
		const spec5 = perJourney(0, 5, 'spec');
		out += `| mean intrigue, cards 1-5 | ${mean(early).toFixed(2)} ±${ci95(early).toFixed(2)} |\n`;
		out += `| mean intrigue, cards 7+ | ${mean(late).toFixed(2)} ±${ci95(late).toFixed(2)} |\n`;
		out += `| mean specificity, cards 1-5 | ${mean(spec5).toFixed(2)} ±${ci95(spec5).toFixed(2)} |\n`;
	}
	const steady = coldStart.flatMap((j) => j.path.slice(6));
	if (steady.length)
		out += `| steady surprise rate (7+) | ${pct(steady.filter((p) => p.surprised).length / steady.length)} |\n`;
	out += `\n`;
}

// avg path length / dead ends
const lens = J.map((j) => j.path.length);
const deadEnds = J.filter((j) => j.deadEndedAt !== null).length;
out += `## Run health\n\n`;
out += `- Mean journey length: ${mean(lens).toFixed(1)} cards (cap 30). Journeys that dead-ended early: ${deadEnds}/${J.length}.\n`;

writeFileSync(`${import.meta.dir}/report-${mode}.md`, out);
console.log(out);
