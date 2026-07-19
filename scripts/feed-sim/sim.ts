/**
 * Tangent feed-algorithm journey simulator.
 *
 * Drives the REAL shipped engine (fetchExploreCandidates + selectNext +
 * buildEngineContext) over live Wikipedia, replicating the web client's
 * traversal (feedState.more / #context / #effectiveTip) and the engagement
 * profile update logic (profile.svelte.ts #bumpTokens / recordSeen / skip).
 *
 * The learning channel tokenizes `title + description`; Candidate.description
 * (Action API) and Article.description (REST summary) are both the Wikidata
 * short description, so we can advance the chain on Candidates with NO per-node
 * article fetch and still feed the profile exactly what production feeds it.
 *
 * Two questions:
 *  1. Does selective engagement shape the served stream toward the user's
 *     interest? (adaptive arm vs no-learning control arm, per persona)
 *  2. How often does a rabbit hole drift into the Hitler / Nazi cluster, and
 *     WHY does the political penalty fail to stop it? (score breakdown at each
 *     cluster landing)
 */

import { fetchExploreCandidates } from '../../src/lib/wikipedia/action.ts';
import { selectNext } from '../../src/lib/feed/select.ts';
import { buildEngineContext } from '../../src/lib/feed/context.ts';
import { specificity, dfWeight } from '../../src/lib/feed/score.ts';
import { categoryTokenSet, tokenize } from '../../src/lib/feed/tokens.ts';
import { eraBuckets, placeTokens, type TangentDirection } from '../../src/lib/feed/directions.ts';
import { tasteAffinity, intrigue, type TasteId } from '../../src/lib/feed/taste.ts';
import { isPolitical } from '../../src/lib/feed/politics.ts';
import { FEED } from '../../src/lib/feed/config.ts';
import type { Candidate } from '../../src/lib/wikipedia/types.ts';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

// ----------------------------------------------------------------------------
// PRNG — mulberry32, seeded & deterministic so journeys reproduce.
// ----------------------------------------------------------------------------
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
function hashStr(s: string): number {
	let h = 2166136261 >>> 0;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

// ----------------------------------------------------------------------------
// Persistent candidate cache (title -> Candidate[]) + in-flight dedup.
// ----------------------------------------------------------------------------
const CACHE_PATH = `${import.meta.dir}/cache.json`;
const cache: Record<string, Candidate[]> = existsSync(CACHE_PATH)
	? JSON.parse(readFileSync(CACHE_PATH, 'utf8'))
	: {};
type FetchOutcome = { cands: Candidate[]; failed: boolean };
const inflight = new Map<string, Promise<FetchOutcome>>();
let fetchCount = 0;
let cacheDirty = 0;

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/** `failed: true` = the fetch never succeeded (retries exhausted) — a walk ending
 *  here is a harness artifact, not an engine dead end. Distinguished so walk-length
 *  stats can separate the two (a 429-heavy cold run once read as 75% dead ends). */
async function getCandidates(title: string): Promise<FetchOutcome> {
	// Only non-empty results are cached, so a transient 429 never poisons a title.
	if (cache[title] && cache[title].length > 0) return { cands: cache[title], failed: false };
	const pending = inflight.get(title);
	if (pending) return pending;
	const p = (async (): Promise<FetchOutcome> => {
		await sleep(300); // politeness on uncached fetches (each is ~8-11 API requests now)
		fetchCount++;
		// Retry with exponential backoff — Wikipedia 429s under burst load.
		for (let attempt = 0; attempt < 5; attempt++) {
			try {
				const cands = await fetchExploreCandidates(title);
				if (cands.length > 0) {
					cache[title] = cands;
					if (++cacheDirty % 25 === 0) flushCache();
				}
				return { cands, failed: false };
			} catch {
				await sleep(1000 * 2 ** attempt); // 1s .. 16s
			}
		}
		return { cands: [], failed: true }; // give up — NOT cached, so it retries on a later run
	})();
	inflight.set(title, p);
	const res = await p;
	inflight.delete(title);
	return res;
}
function flushCache() {
	writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

// Seed descriptions (for recordSeen of the seed itself) via REST summary — one
// call per distinct seed, cached.
const seedDescCache: Record<string, string | null> = {};
async function seedDescription(title: string): Promise<string | null> {
	if (title in seedDescCache) return seedDescCache[title];
	try {
		const res = await fetch(
			`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
			{ headers: { 'User-Agent': 'Tangent-sim/0.1 (tannervass@gmail.com)' } }
		);
		const data = res.ok ? ((await res.json()) as { description?: string }) : {};
		seedDescCache[title] = data.description ?? null;
	} catch {
		seedDescCache[title] = null;
	}
	return seedDescCache[title];
}

// ----------------------------------------------------------------------------
// Engagement profile port (mirrors profile.svelte.ts; pure, per-journey).
// ----------------------------------------------------------------------------
class Profile {
	tokenWeights: Record<string, number> = {};
	tokenAvoidWeights: Record<string, number> = {};
	tokenDocFreq: Record<string, number> = {};
	#seenForDf = new Set<string>();
	#engaged = new Set<string>();
	#skipped = new Set<string>();
	#liked = new Set<string>();
	#click = new Set<string>();

	#bump(text: string, delta: number, cap: number, target: Record<string, number>) {
		for (const token of new Set(tokenize(text))) {
			const v = (target[token] ?? 0) + delta;
			if (v <= 0) delete target[token];
			else target[token] = Math.min(v, cap);
		}
	}
	#bumpTokens(text: string, delta: number) {
		this.#bump(text, delta, FEED.tokenWeightCap, this.tokenWeights);
	}
	#bumpAvoid(text: string, delta: number) {
		this.#bump(text, delta, FEED.avoidTokenWeightCap, this.tokenAvoidWeights);
	}
	#clearSkip(title: string, text: string) {
		if (!this.#skipped.has(title)) return;
		this.#skipped.delete(title);
		this.#bumpAvoid(text, -FEED.skipTokenWeight);
	}
	#hasPositive(title: string) {
		return this.#liked.has(title) || this.#click.has(title) || this.#engaged.has(title);
	}

	recordSeen(title: string, text: string) {
		if (this.#seenForDf.has(title)) return;
		this.#seenForDf.add(title);
		for (const token of new Set(tokenize(text)))
			this.tokenDocFreq[token] = (this.tokenDocFreq[token] ?? 0) + 1;
	}
	dwell(title: string, text: string) {
		if (this.#engaged.has(title)) return;
		this.#engaged.add(title);
		this.#clearSkip(title, text);
		this.#bumpTokens(text, FEED.dwellTokenWeight);
	}
	like(title: string, text: string) {
		if (this.#liked.has(title)) return;
		this.#liked.add(title);
		this.#clearSkip(title, text);
		this.#bumpTokens(text, FEED.likeTokenWeight);
	}
	clickthrough(title: string, text: string) {
		if (this.#click.has(title)) return;
		this.#click.add(title);
		this.#clearSkip(title, text);
		this.#bumpTokens(text, FEED.clickthroughTokenWeight);
	}
	skip(title: string, text: string) {
		if (this.#hasPositive(title) || this.#skipped.has(title)) return;
		this.#skipped.add(title);
		this.#bumpAvoid(text, FEED.skipTokenWeight);
	}
}

// ----------------------------------------------------------------------------
// Sink detection.
// ----------------------------------------------------------------------------
// Core "goes to Hitler" cluster: Nazi / Third Reich / Holocaust apparatus.
const NAZI_CORE =
	/\b(hitler|nazi|nazism|holocaust|gestapo|himmler|goebbels|göring|goering|waffen-ss|schutzstaffel|wehrmacht|third reich|hitler youth|kristallnacht|auschwitz|reichstag)\b/i;
// Broader 20th-c authoritarian / world-war cluster.
const WAR_BROAD =
	/\b(mussolini|fascis|stalin|soviet union|world war|wwii|wwi|axis powers|totalitarian|dictator)\b/i;

function clusterTier(title: string, description: string | null): 'core' | 'broad' | null {
	const blob = `${title} ${description ?? ''}`;
	if (NAZI_CORE.test(blob) || /^adolf hitler$/i.test(title)) return 'core';
	if (WAR_BROAD.test(blob)) return 'broad';
	return null;
}

// ----------------------------------------------------------------------------
// Score breakdown (mirrors scoreCandidate term-by-term) for sink diagnostics.
// ----------------------------------------------------------------------------
interface Ctx {
	tokenWeights: Record<string, number>;
	tokenAvoidWeights: Record<string, number>;
	tokenDocFreq: Record<string, number>;
	taste: TasteId;
	runTokens: Set<string>;
	seenTitles: Set<string>;
}
function breakdown(c: Candidate, ctx: Ctx) {
	const tokens = tokenize(`${c.title} ${c.description ?? ''}`);
	let relevance = 0,
		avoidance = 0,
		runOverlap = 0;
	for (const t of tokens) {
		relevance += dfWeight(ctx.tokenWeights[t] ?? 0, ctx.tokenDocFreq[t] ?? 0);
		avoidance += dfWeight(ctx.tokenAvoidWeights[t] ?? 0, ctx.tokenDocFreq[t] ?? 0);
		if (ctx.runTokens.has(t)) runOverlap += 1;
	}
	const spec = specificity(c);
	const position = c.position ?? FEED.positionHalfLife;
	const cats = c.categories ?? [];
	const blob = `${c.title} ${c.description ?? ''} ${cats.join(' ')}`;
	const political = isPolitical(blob);
	// Base terms only — the run-phase terms (coherence in-run / variety at break)
	// are reported informationally since a sink can land via either phase.
	const terms = {
		base: FEED.base,
		relevance: FEED.relevanceWeight * Math.tanh(relevance / 2),
		avoidance: -FEED.avoidanceWeight * Math.tanh(avoidance / 2),
		coherenceIfInRun: FEED.coherenceWeight * Math.tanh(runOverlap / 2),
		varietyIfBreak: runOverlap * FEED.varietyPenalty,
		image: c.thumbnail ? FEED.imageBonus : 0,
		related: c.relation === 'related' ? FEED.relatedPenalty : 0,
		taste: FEED.tasteWeight * tasteAffinity(c, ctx.taste),
		intrigue: FEED.intrigueWeight * intrigue(c),
		specificity: (FEED.specificityWeight * spec) / (1 + relevance),
		position: FEED.positionWeight * Math.exp(-position / FEED.positionHalfLife),
		political: political ? FEED.politicalPenalty : 0
	};
	const score = Object.values(terms).reduce((a, b) => a + b, 0);
	return { score, terms, political, specRaw: spec, positionRaw: position, relRaw: relevance };
}

// ----------------------------------------------------------------------------
// Behavior model — the simulated reader.
// ----------------------------------------------------------------------------
type Persona = TasteId; // 'nature' | 'science' | ... ('balanced' = no selective engagement)
const P_LIKE = 0.25; // P(like | on-interest)
const P_SKIP = 0.8; // P(skip | off-interest)

// ----------------------------------------------------------------------------
// One journey.
// ----------------------------------------------------------------------------
interface JourneyResult {
	seed: string;
	persona: Persona;
	arm: 'adaptive' | 'control';
	rngSeed: number;
	/** intrigue/spec are the engine's own hook/concreteness reads of each served card,
	 *  recorded at walk time so cold-open feel is measurable offline. description and
	 *  categories are recorded so consecutive-card jump distance (lexical + category
	 *  overlap) is computable offline — see jumpdist.ts. */
	path: {
		title: string;
		description: string | null;
		categories: string[];
		surprised: boolean;
		/** Directional-tangent label, when the pick held a dimension of the run. */
		direction: TangentDirection | null;
		/** This pick started a new run (tangent or drift fall-through). */
		runReset: boolean;
		/** The reader fast-skipped this tangent; the chain healed back past it. */
		healed: boolean;
		onInterest: boolean;
		tier: 'core' | 'broad' | null;
		intrigue: number;
		spec: number;
	}[];
	firstCoreStep: number | null; // step index (1-based among non-seed cards) of first core hit, else null
	firstBroadStep: number | null;
	sinkLandings: {
		step: number;
		title: string;
		tier: 'core' | 'broad';
		political: boolean;
		score: number;
		terms: Record<string, number>;
	}[];
	deadEndedAt: number | null;
	/** Why the walk ended early: 'fetch-failed' is a harness/network artifact;
	 *  'no-links' (page with no usable candidates) and 'engine-exhausted'
	 *  (candidates exist but none eligible) are real dead ends. */
	deadEndKind: 'fetch-failed' | 'no-links' | 'engine-exhausted' | null;
}

async function runJourney(
	seed: string,
	persona: Persona,
	arm: 'adaptive' | 'control',
	rngSeed: number,
	maxLen: number
): Promise<JourneyResult> {
	const profile = new Profile();
	const engineRng = mulberry32(hashStr(`${seed}|${persona}|${arm}|engine`) ^ rngSeed);
	const behaviorRng = mulberry32(hashStr(`${seed}|${persona}|${arm}|behavior`) ^ (rngSeed * 2654435761));

	const visited: { title: string; description: string | null }[] = [];
	const seenTitles = new Set<string>();
	const path: JourneyResult['path'] = [];
	const sinkLandings: JourneyResult['sinkLandings'] = [];
	let firstCoreStep: number | null = null;
	let firstBroadStep: number | null = null;
	let deadEndedAt: number | null = null;
	let deadEndKind: JourneyResult['deadEndKind'] = null;

	// behavior: react to a revealed card (adaptive arm only mutates the profile).
	// Returns 'skipped' so the traversal can heal a fast-skipped tangent.
	const react = (
		title: string,
		description: string | null,
		persona: Persona
	): 'skipped' | 'engaged' | 'neutral' => {
		const text = `${title} ${description ?? ''}`;
		profile.recordSeen(title, text);
		if (arm === 'control' || persona === 'balanced') return 'neutral';
		const onInterest =
			tasteAffinity({ title, description, thumbnail: null, isDisambiguation: false, relation: 'link', categories: [], position: 0 }, persona) > 0;
		if (onInterest) {
			profile.dwell(title, text); // a reader reads what interests them
			if (behaviorRng() < P_LIKE) profile.like(title, text);
			return 'engaged';
		}
		if (behaviorRng() < P_SKIP) {
			profile.skip(title, text);
			return 'skipped';
		}
		return 'neutral';
	};

	// seed
	const seedDesc = await seedDescription(seed);
	react(seed, seedDesc, persona);
	visited.push({ title: seed, description: seedDesc });
	seenTitles.add(seed);
	let tip = seed;

	// Run accounting (mirrors feedState.#runState / FeedStore.sessionPayload):
	// the current run's cards, boundary inclusive, feeding coherence in-run and
	// variety at a break. Tangents re-root; a fast-skipped tangent heals back.
	type RunCard = {
		title: string;
		description: string | null;
		catTokens: Set<string>;
		eras: Set<string>;
		places: Set<string>;
	};
	let run: RunCard[] = [
		{ title: seed, description: seedDesc, catTokens: new Set(), eras: new Set(), places: new Set() }
	];
	let preTangent: { run: RunCard[]; tip: string } | null = null;

	for (let step = 1; step <= maxLen; step++) {
		const { cands: candidates, failed } = await getCandidates(tip);
		if (candidates.length === 0) {
			deadEndedAt = step;
			deadEndKind = failed ? 'fetch-failed' : 'no-links';
			break;
		}

		const runTokens = new Set<string>();
		const runCategories = new Set<string>();
		const runEras = new Set<string>();
		const runPlaces = new Set<string>();
		for (const card of run) {
			for (const t of tokenize(`${card.title} ${card.description ?? ''}`)) runTokens.add(t);
			for (const t of card.catTokens) runCategories.add(t);
			for (const t of card.eras) runEras.add(t);
			for (const t of card.places) runPlaces.add(t);
		}

		const interest = {
			tokenWeights: profile.tokenWeights,
			tokenAvoidWeights: profile.tokenAvoidWeights,
			tokenDocFreq: profile.tokenDocFreq,
			taste: 'balanced' as TasteId
		};
		const session = {
			seenTitles: [...seenTitles],
			stepIndex: visited.length,
			noSurprise: false,
			runDepth: run.length,
			runTokens: [...runTokens],
			runCategories: [...runCategories],
			runEras: [...runEras],
			runPlaces: [...runPlaces]
		};
		const ctx = buildEngineContext(interest, session, engineRng);
		const sel = selectNext(candidates, ctx);
		if (!sel) {
			deadEndedAt = step;
			deadEndKind = 'engine-exhausted';
			break;
		}
		const c = sel.candidate;
		const tier = clusterTier(c.title, c.description);
		const onInterest =
			persona !== 'balanced' &&
			tasteAffinity(c, persona) > 0;

		if (tier) {
			const bd = breakdown(c, {
				tokenWeights: profile.tokenWeights,
				tokenAvoidWeights: profile.tokenAvoidWeights,
				tokenDocFreq: profile.tokenDocFreq,
				taste: 'balanced',
				runTokens,
				seenTitles
			});
			sinkLandings.push({ step, title: c.title, tier, political: bd.political, score: bd.score, terms: bd.terms });
			if (tier === 'core' && firstCoreStep === null) firstCoreStep = step;
			if (firstBroadStep === null) firstBroadStep = step;
		}

		// Advance the chain: every pick re-roots or extends the run.
		const runCard: RunCard = {
			title: c.title,
			description: c.description,
			catTokens: categoryTokenSet(c.categories),
			eras: eraBuckets(c),
			places: placeTokens(c)
		};
		if (sel.runReset) {
			preTangent = sel.surprised ? { run, tip } : null; // only tangents can heal
			run = [runCard];
		} else {
			preTangent = null;
			run = [...run, runCard];
		}
		tip = c.title;

		const reaction = react(c.title, c.description, persona);
		visited.push({ title: c.title, description: c.description });
		seenTitles.add(c.title);

		// Heal: the reader fast-skipped a tangent — rebuild from the pre-tangent tip
		// with the pre-tangent run (the healed card stays seen, matching the client).
		const healed = sel.surprised && reaction === 'skipped' && preTangent !== null;
		if (healed && preTangent) {
			run = preTangent.run;
			tip = preTangent.tip;
			preTangent = null;
		}

		path.push({
			title: c.title,
			description: c.description,
			categories: c.categories ?? [],
			surprised: sel.surprised,
			direction: sel.direction ?? null,
			runReset: sel.runReset,
			healed,
			onInterest,
			tier,
			intrigue: intrigue(c),
			spec: specificity(c)
		});
	}

	return {
		seed,
		persona,
		arm,
		rngSeed,
		path,
		firstCoreStep,
		firstBroadStep,
		sinkLandings,
		deadEndedAt,
		deadEndKind
	};
}

// ----------------------------------------------------------------------------
// Concurrency-limited runner.
// ----------------------------------------------------------------------------
async function runAll<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let next = 0;
	let done = 0;
	const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
		while (true) {
			const i = next++;
			if (i >= tasks.length) return;
			results[i] = await tasks[i]();
			done++;
			if (done % 20 === 0) console.error(`  ...${done}/${tasks.length} journeys`);
		}
	});
	await Promise.all(workers);
	return results;
}

// ----------------------------------------------------------------------------
// Config + main.
// ----------------------------------------------------------------------------
const SEEDS = [
	'Octopus',
	'Coffee',
	'Black hole',
	'Jazz',
	'Mycology',
	'Roman Empire',
	'Silk Road',
	'Photosynthesis',
	'Volcano',
	'Chess',
	'Bioluminescence',
	'Typography'
];
const GOAL1_PERSONAS: Persona[] = ['nature', 'science', 'culture', 'history', 'technology'];

const mode = process.argv[2] ?? 'pilot';
const MAXLEN = Number(process.argv[3] ?? 30);

async function validate() {
	// Validation gate: confirm the sim reaches the Hitler/Nazi cluster from
	// German-history seeds (if it can't, the traversal port is broken).
	const seeds = ['Weimar Republic', 'Otto von Bismarck', 'House of Habsburg', 'Beer Hall Putsch', 'Treaty of Versailles'];
	for (const seed of seeds) {
		for (const r of [1, 2, 3]) {
			const j = await runJourney(seed, 'balanced', 'control', r, 30);
			const reached = j.firstCoreStep ?? j.firstBroadStep;
			console.log(
				`\n[${seed} r${r}] coreStep=${j.firstCoreStep} broadStep=${j.firstBroadStep} deadEnd=${j.deadEndedAt}`
			);
			console.log('  path:', j.path.map((p) => (p.tier ? `*${p.title}*` : p.title)).join(' -> '));
			if (j.sinkLandings.length) {
				const s = j.sinkLandings[0];
				console.log(`  first sink "${s.title}" (${s.tier}) political=${s.political} score=${s.score.toFixed(2)}`);
				console.log('   terms:', Object.fromEntries(Object.entries(s.terms).map(([k, v]) => [k, +v.toFixed(2)])));
			}
		}
	}
	flushCache();
	console.error(`\n${fetchCount} live fetches, ${Object.keys(cache).length} cached titles.`);
}

async function main() {
	if (mode === 'validate') {
		await validate();
		return;
	}
	const tasks: (() => Promise<JourneyResult>)[] = [];

	let rngSeeds: number[];
	let seeds: string[];
	if (mode === 'pilot') {
		rngSeeds = [1, 2, 3];
		seeds = SEEDS;
	} else {
		rngSeeds = [1, 2, 3, 4, 5];
		seeds = SEEDS;
	}

	// Goal 2 headline: cold-start balanced (default new user). arm=control, persona=balanced.
	for (const seed of seeds)
		for (const r of rngSeeds)
			tasks.push(() => runJourney(seed, 'balanced', 'control', r, MAXLEN));

	// Goal 1: adaptive vs control per persona (taste stays balanced; shaping comes from learning).
	for (const persona of GOAL1_PERSONAS)
		for (const seed of seeds)
			for (const r of rngSeeds) {
				tasks.push(() => runJourney(seed, persona, 'adaptive', r, MAXLEN));
				tasks.push(() => runJourney(seed, persona, 'control', r, MAXLEN));
			}

	console.error(`Running ${tasks.length} journeys (mode=${mode}, maxLen=${MAXLEN})...`);
	const t0 = Date.now();
	// Concurrency 2: each uncached tip now costs ~8-11 API requests (categories
	// ride a second pass), so 3 parallel journeys under a cold cache draws 429s.
	const results = await runAll(tasks, 2);
	flushCache();
	console.error(`Done in ${((Date.now() - t0) / 1000).toFixed(0)}s, ${fetchCount} live fetches, ${Object.keys(cache).length} cached titles.`);

	const outPath = `${import.meta.dir}/results-${mode}.json`;
	writeFileSync(outPath, JSON.stringify(results, null, 0));
	console.error(`Wrote ${outPath}`);
}

await main();
