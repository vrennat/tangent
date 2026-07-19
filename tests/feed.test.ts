import { describe, it, expect } from 'vitest';
import type { Candidate } from '../src/lib/wikipedia/types';
import type { EngineContext } from '../src/lib/feed/types';
import {
	categoryAffinity,
	coherence,
	runVariety,
	scoreCandidate,
	specificity
} from '../src/lib/feed/score';
import { selectNext } from '../src/lib/feed/select';
import { FEED } from '../src/lib/feed/config';

function candidate(overrides: Partial<Candidate> = {}): Candidate {
	return {
		title: 'Aqueduct',
		description: 'water channel',
		thumbnail: { source: 'x', width: 1, height: 1 },
		isDisambiguation: false,
		relation: 'link',
		categories: [],
		position: 0,
		...overrides
	};
}

function context(overrides: Partial<EngineContext> = {}): EngineContext {
	return {
		tokenWeights: {},
		tokenAvoidWeights: {},
		tokenDocFreq: {},
		taste: 'balanced',
		runDepth: 0,
		runTokens: new Set(),
		runCategories: new Set(),
		runEras: new Set(),
		runPlaces: new Set(),
		seenTitles: new Set(),
		noSurprise: false,
		stepIndex: 10,
		rng: () => 0.5,
		...overrides
	};
}

/** Deterministic RNG that yields a fixed sequence, repeating the last value. */
function seq(values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)];
}

describe('scoreCandidate', () => {
	describe('exclusions', () => {
		it('excludes already-seen titles', () => {
			const ctx = context({ seenTitles: new Set(['Aqueduct']) });
			expect(scoreCandidate(candidate(), ctx)).toBe(-Infinity);
		});

		it('excludes disambiguation pages', () => {
			expect(scoreCandidate(candidate({ isDisambiguation: true }), context())).toBe(-Infinity);
		});
	});

	describe('relevance', () => {
		it('scores a candidate matching the interest vector higher', () => {
			const ctx = context({ tokenWeights: { water: 2, channel: 2 } });
			const relevant = scoreCandidate(candidate(), ctx);
			const irrelevant = scoreCandidate(
				candidate({ title: 'Jazz', description: 'music genre' }),
				ctx
			);
			expect(relevant).toBeGreaterThan(irrelevant);
		});
	});

	describe('signals', () => {
		it('rewards a lead image', () => {
			const withImage = scoreCandidate(candidate(), context());
			const without = scoreCandidate(candidate({ thumbnail: null }), context());
			expect(withImage).toBeGreaterThan(without);
		});

		it('keeps base scoring free of run-phase terms (selectNext composes them)', () => {
			const ctx = context({ runTokens: new Set(['water', 'channel']) });
			const overlapping = scoreCandidate(candidate(), ctx);
			const fresh = scoreCandidate(
				candidate({ title: 'Volcano', description: 'erupting mountain' }),
				ctx
			);
			// Same intrinsic profile either way — neighborhood shaping is a phase decision.
			expect(overlapping).toBeCloseTo(fresh, 5);
		});

		it('penalizes candidates matching skipped tokens', () => {
			const ctx = context({ tokenAvoidWeights: { water: 2, channel: 2 } });
			const skippedTopic = scoreCandidate(candidate(), ctx);
			const fresh = scoreCandidate(candidate({ title: 'Volcano', description: 'erupting mountain' }), ctx);
			expect(fresh).toBeGreaterThan(skippedTopic);
		});

		it('slightly prefers real links over related fallbacks', () => {
			const link = scoreCandidate(candidate({ relation: 'link' }), context());
			const related = scoreCandidate(candidate({ relation: 'related' }), context());
			expect(link).toBeGreaterThan(related);
		});

		it('prefers prominent (earlier-in-article) links', () => {
			const lead = scoreCandidate(candidate({ position: 0 }), context());
			const deep = scoreCandidate(candidate({ position: 40 }), context());
			expect(lead).toBeGreaterThan(deep);
		});

		it('boosts candidates that match the selected tangent flavor', () => {
			const tech = candidate({
				title: 'Transistor',
				description: 'semiconductor device',
				categories: ['Category:Electronics']
			});
			const culture = candidate({
				title: 'Supper club',
				description: 'traditional dining establishment',
				categories: ['Category:Food culture']
			});
			const ctx = context({ taste: 'technology' });

			expect(scoreCandidate(tech, ctx)).toBeGreaterThan(scoreCandidate(culture, ctx));
		});

		it('gives story-rich oddities a smaller global curiosity boost', () => {
			const oddity = candidate({ title: 'Wow! signal', description: 'unexplained radio signal' });
			const ordinary = candidate({ title: 'Radio signal', description: 'electromagnetic wave' });

			expect(scoreCandidate(oddity, context())).toBeGreaterThan(
				scoreCandidate(ordinary, context())
			);
		});
	});

	describe('token deduplication', () => {
		// The profile builds tokenWeights/tokenDocFreq over UNIQUE tokens per article;
		// scoring must match, or a candidate whose title token repeats in its own
		// description gets double relevance (and double variety penalty) for free.
		it('counts a token shared by title and description once for relevance', () => {
			const ctx = context({ tokenWeights: { aqueduct: 2 } });
			const repeated = scoreCandidate(
				candidate({ title: 'Aqueduct', description: 'stone aqueduct' }),
				ctx
			);
			const single = scoreCandidate(candidate({ title: 'Aqueduct', description: 'stone' }), ctx);
			expect(repeated).toBeCloseTo(single, 5);
		});

	});

	describe('political dampening', () => {
		it('sinks political candidates far below neutral ones', () => {
			const neutral = scoreCandidate(candidate({ title: 'Volcano', description: 'mountain' }), context());
			const political = scoreCandidate(
				candidate({ title: '2020 United States presidential election', description: 'US election' }),
				context()
			);
			expect(political).toBeLessThan(neutral - 100);
		});

		it('detects politics from categories when title/description look neutral', () => {
			const c = candidate({
				title: 'John Q. Public',
				description: 'American lawyer',
				categories: ['Category:United States senators from Ohio']
			});
			expect(scoreCandidate(c, context())).toBeLessThan(0);
		});

		it('does not dampen apolitical articles', () => {
			expect(scoreCandidate(candidate({ title: 'Octopus', description: 'mollusc' }), context()))
				.toBeGreaterThan(0);
		});

		it('keeps political candidates eligible (soft penalty, not a block)', () => {
			// Even heavily penalized, a political candidate is still selectable if it's all there is.
			const pool = [candidate({ title: 'United States Congress', description: 'legislature' })];
			expect(selectNext(pool, context({ rng: seq([0.99, 0]) }))).not.toBeNull();
		});
	});
});

describe('selectNext', () => {
	describe('dead ends', () => {
		it('returns null when nothing is eligible', () => {
			expect(selectNext([], context())).toBeNull();
		});

		it('returns null when every candidate was already seen', () => {
			const ctx = context({ seenTitles: new Set(['Aqueduct']) });
			expect(selectNext([candidate()], ctx)).toBeNull();
		});
	});

	describe('relevance mode', () => {
		it('picks the top scorer when RNG points at the strongest weight', () => {
			// rng[0]=0.99 skips surprise; rng[1]=0 selects the first (highest) softmax bucket.
			const ctx = context({
				tokenWeights: { roman: 5 },
				rng: seq([0.99, 0])
			});
			const pool = [
				candidate({ title: 'Jazz', description: 'music' }),
				candidate({ title: 'Roman Empire', description: 'roman state' })
			];
			const result = selectNext(pool, ctx);
			expect(result?.candidate.title).toBe('Roman Empire');
			expect(result?.surprised).toBe(false);
		});

		it('never selects a disambiguation page', () => {
			const ctx = context({ rng: seq([0.99, 0]) });
			const pool = [candidate({ title: 'Mercury', isDisambiguation: true }), candidate()];
			expect(selectNext(pool, ctx)?.candidate.isDisambiguation).toBe(false);
		});

		it('uses tangent flavor as a soft steering signal', () => {
			const ctx = context({ taste: 'oddities', rng: seq([0.99, 0]) });
			const pool = [
				candidate({ title: 'Water channel', description: 'engineered conduit' }),
				candidate({ title: 'Urban legend', description: 'modern folklore story' })
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('Urban legend');
		});

		it('marks in-run picks as neither surprised nor run-resetting', () => {
			const result = selectNext([candidate()], context({ rng: seq([0.99, 0]) }));
			expect(result?.surprised).toBe(false);
			expect(result?.runReset).toBe(false);
		});
	});

	describe('in-run coherence', () => {
		it('pulls the pick toward candidates sharing tokens with the run', () => {
			const ctx = context({
				runTokens: new Set(['roman', 'empire', 'rome']),
				rng: seq([0.99, 0])
			});
			const pool = [
				candidate({ title: 'Trade route', description: 'transport network', position: 0 }),
				candidate({ title: 'Roman roads', description: 'roads of the Roman Empire', position: 0 })
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('Roman roads');
		});

		it('pulls the pick toward candidates sharing categories with the run (era/region)', () => {
			// Category tokens carry the same-time-same-place signal: the shared
			// "ancient"/"rome"/"punic" tokens must beat a positional advantage.
			const ctx = context({
				runCategories: new Set(['ancient', 'rome', 'punic', 'wars']),
				rng: seq([0.99, 0])
			});
			const pool = [
				candidate({
					title: 'Christianity',
					description: 'religion',
					categories: ['Category:Religions'],
					position: 0
				}),
				candidate({
					title: 'Carthage',
					description: 'city',
					categories: ['Category:Ancient Rome', 'Category:Punic Wars'],
					position: 5
				})
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('Carthage');
		});

		it('counts a shared token once even when repeated within a candidate', () => {
			const ctx = context({ runTokens: new Set(['aqueduct']) });
			const repeated = coherence(candidate({ title: 'Aqueduct', description: 'stone aqueduct' }), ctx);
			const single = coherence(candidate({ title: 'Aqueduct', description: 'stone' }), ctx);
			expect(repeated).toBeCloseTo(single, 5);
		});

		it('keeps digit-bearing era tokens in the category signal', () => {
			const ctx = context({ runCategories: new Set(['1st-century', 'bc']) });
			const dated = candidate({
				title: 'Mark Antony',
				description: 'Roman politician',
				categories: ['Category:1st-century BC Romans']
			});
			expect(categoryAffinity(dated, ctx)).toBeGreaterThan(0);
		});
	});

	describe('run breaks (tangents)', () => {
		function neutralPool(n: number): Candidate[] {
			return Array.from({ length: n }, (_, i) =>
				candidate({
					title: `Article${i}`,
					description: 'neutral topic',
					thumbnail: null,
					position: 0
				})
			);
		}

		function hookyTail(n: number): Candidate[] {
			return Array.from({ length: n }, (_, i) =>
				candidate({
					title: `Lost article ${i}`,
					description: 'unsolved mystery and abandoned experimental project',
					thumbnail: null,
					position: 100 + i
				})
			);
		}

		/** A run deep enough that the break is certain (ramp end = 1). */
		const BREAK_DEPTH = FEED.runMinLength + FEED.runBreakRamp.length - 1;

		it('never breaks before the run reaches runMinLength, even with rng at zero', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({ runDepth: FEED.runMinLength - 1, rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(false);
			expect(result?.runReset).toBe(false);
		});

		it('breaks probabilistically on the ramp once the run is old enough', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			// At runDepth = runMinLength the ramp starts at 0.45: a 0.3 roll breaks...
			const breaks = selectNext(pool, context({ runDepth: FEED.runMinLength, rng: seq([0.3, 0]) }));
			expect(breaks?.surprised).toBe(true);
			// ...and a 0.6 roll does not.
			const stays = selectNext(pool, context({ runDepth: FEED.runMinLength, rng: seq([0.6, 0]) }));
			expect(stays?.surprised).toBe(false);
		});

		it('breaks unconditionally at the end of the ramp (anti-orbit guarantee)', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({ runDepth: BREAK_DEPTH, rng: seq([0.999, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(true);
			expect(result?.runReset).toBe(true);
			expect(result?.candidate.title).toMatch(/^Lost article/);
		});

		it('breaks the session-first run at exactly runMinLength (guaranteed first tangent)', () => {
			// runDepth === stepIndex means no boundary has occurred since the seed: the
			// first run. It breaks with certainty so a first session reliably meets a
			// tangent — the moment that shows what the product is.
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({
				runDepth: FEED.runMinLength,
				stepIndex: FEED.runMinLength,
				rng: seq([0.999, 0])
			});
			expect(selectNext(pool, ctx)?.surprised).toBe(true);
		});

		it('never breaks when noSurprise is true (branch/dive steering)', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({ noSurprise: true, runDepth: BREAK_DEPTH, rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(false);
			expect(result?.runReset).toBe(false);
		});

		describe('drift fall-through', () => {
			it('still resets the run when the tangent pool is too shallow', () => {
				const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool - 1)];
				const ctx = context({ runDepth: BREAK_DEPTH, rng: seq([0, 0]) });
				const result = selectNext(pool, ctx);
				expect(result?.surprised).toBe(false);
				expect(result?.runReset).toBe(true);
			});

			it('still resets the run when the pool has no strong hooks', () => {
				const pool = neutralPool(FEED.topK + FEED.surpriseMinPool + 1);
				const ctx = context({ runDepth: BREAK_DEPTH, rng: seq([0, 0]) });
				const result = selectNext(pool, ctx);
				expect(result?.surprised).toBe(false);
				expect(result?.runReset).toBe(true);
			});

			it('drifts out of the neighborhood: the run-overlapping candidate loses', () => {
				// Hookless pool (no tangent can fire); variety must still steer the drift
				// pick away from the run's tokens.
				const ctx = context({
					runDepth: BREAK_DEPTH,
					runTokens: new Set(['neutral', 'topic']),
					rng: seq([0, 0])
				});
				const pool = [
					candidate({ title: 'Article A', description: 'neutral topic', thumbnail: null }),
					candidate({ title: 'Article B', description: 'fresh subject', thumbnail: null })
				];
				const result = selectNext(pool, ctx);
				expect(result?.candidate.title).toBe('Article B');
				expect(result?.runReset).toBe(true);
			});
		});

		it('pushes the tangent landing out of the neighborhood via the variety penalty', () => {
			// Two equally hooky tails; the one overlapping the run's tokens must lose.
			const nearHooks = Array.from({ length: 3 }, (_, i) =>
				candidate({
					title: `Roman mystery ${i}`,
					description: 'unsolved mystery of the roman empire',
					thumbnail: null,
					position: 100
				})
			);
			const farHooks = Array.from({ length: 3 }, (_, i) =>
				candidate({
					title: `Ocean mystery ${i}`,
					description: 'unsolved mystery of the deep sea',
					thumbnail: null,
					position: 100
				})
			);
			const ctx = context({
				runDepth: BREAK_DEPTH,
				runTokens: new Set(['roman', 'empire', 'rome', 'unsolved', 'mystery']),
				rng: seq([0, 0])
			});
			const result = selectNext([...neutralPool(FEED.topK), ...nearHooks, ...farHooks], ctx);
			expect(result?.surprised).toBe(true);
			expect(result?.candidate.title).toMatch(/^Ocean mystery/);
		});

		it('does not let hookless high scorers crowd hooky candidates out of the tangent pool', () => {
			// Top-K fillers, then relevance-strong but hookless "mediums" whose break
			// score outranks the hooky tail, then genuinely hooky candidates. The
			// mediums are ineligible (zero intrigue) — they must not consume the
			// tangent pool's capped slots and starve out the eligible hooky tail.
			const ctx = context({
				tokenWeights: { alpha: 3, beta: 3 },
				runDepth: BREAK_DEPTH,
				rng: seq([0, 0])
			});
			const fillers = Array.from({ length: FEED.topK }, (_, i) =>
				candidate({ title: `Filler ${'ABCDEFGHIJ'[i]}`, description: 'alpha beta subject', position: 0 })
			);
			const mediums = Array.from({ length: FEED.surpriseTopK }, (_, i) =>
				candidate({ title: `Medium ${'ABCDEFGHIJ'[i]}`, description: 'alpha beta subject', position: 30 })
			);
			const hooky = Array.from({ length: FEED.surpriseMinPool + 1 }, (_, i) =>
				candidate({ title: `Curio ${'ABCDEFGHIJ'[i]}`, description: 'oldest bridge', position: 100 })
			);

			const result = selectNext([...fillers, ...mediums, ...hooky], ctx);
			expect(result?.surprised).toBe(true);
			expect(result?.candidate.title).toMatch(/^Curio/);
		});

		it('excludes political candidates from the tangent pool', () => {
			const normalCandidates = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const political = candidate({
				title: 'United States presidential election',
				description: 'unsolved election politics scandal',
				categories: ['Category:Elections'],
				position: 100
			});
			const pool = [...normalCandidates, political];
			for (let i = 0; i < 20; i++) {
				const ctx = context({ runDepth: BREAK_DEPTH, rng: seq([0, 0]) });
				const result = selectNext(pool, ctx);
				if (result?.surprised) {
					expect(result.candidate.title).not.toBe(political.title);
				}
			}
		});
	});
});

describe('running foot', () => {
	it('offers the highest-intrigue eligible runner-up alongside the pick', () => {
		const pool = [
			candidate({ title: 'Canal', description: 'water channel', position: 0 }),
			candidate({ title: 'Mild curio', description: 'oldest bridge', position: 20 }),
			candidate({
				title: 'Lost expedition',
				description: 'unsolved mystery of an abandoned expedition',
				position: 30
			})
		];
		const result = selectNext(pool, context({ rng: seq([0.99, 0]) }));
		expect(result?.candidate.title).toBe('Canal');
		expect(result?.foot?.title).toBe('Lost expedition');
	});

	it('never offers the picked card as its own foot', () => {
		const pool = [
			candidate({
				title: 'Lost expedition',
				description: 'unsolved mystery of an abandoned expedition',
				position: 0
			})
		];
		const result = selectNext(pool, context({ rng: seq([0.99, 0]) }));
		expect(result?.candidate.title).toBe('Lost expedition');
		expect(result?.foot).toBeUndefined();
	});

	it('offers no foot when nothing clears the intrigue floor', () => {
		const pool = [
			candidate({ title: 'Canal', description: 'water channel', position: 0 }),
			candidate({ title: 'Trade route', description: 'transport network', position: 5 })
		];
		expect(selectNext(pool, context({ rng: seq([0.99, 0]) }))?.foot).toBeUndefined();
	});

	it('excludes political candidates from feet', () => {
		const pool = [
			candidate({ title: 'Canal', description: 'water channel', position: 0 }),
			candidate({
				title: 'Watergate scandal',
				description: 'unsolved political mystery of a failed burglary',
				categories: ['Category:Political scandals'],
				position: 30
			})
		];
		expect(selectNext(pool, context({ rng: seq([0.99, 0]) }))?.foot).toBeUndefined();
	});
});

describe('runVariety', () => {
	it('penalizes per unique shared token with the run', () => {
		const ctx = context({ runTokens: new Set(['water', 'channel']) });
		expect(runVariety(candidate(), ctx)).toBeCloseTo(2 * FEED.varietyPenalty, 5);
		expect(
			runVariety(candidate({ title: 'Volcano', description: 'erupting mountain' }), ctx)
		).toBeCloseTo(0, 5);
	});
});

describe('specificity', () => {
	describe('rewards concrete, named, dated articles', () => {
		it('boosts a description carrying a year (a life, a dated event)', () => {
			expect(specificity(candidate({ title: 'Foo', description: 'Ottoman conquest in 1453' })))
				.toBeGreaterThan(0);
		});

		it('boosts a multi-word proper-noun title', () => {
			expect(specificity(candidate({ title: 'New Orleans', description: 'city' })))
				.toBeGreaterThan(0);
		});
	});

	describe('penalizes generic abstractions and enumerations', () => {
		it('penalizes a bare definitional category (the abstraction sinks)', () => {
			expect(specificity(candidate({ title: 'Order', description: 'Taxonomic rank between class and family' })))
				.toBeLessThan(0);
		});

		it('penalizes the philosophical-bedrock sinks a position-only feed collapses into', () => {
			expect(specificity(candidate({ title: 'Entity', description: 'Something that exists' })))
				.toBeLessThan(0);
		});

		it('penalizes list / timeline titles', () => {
			expect(specificity(candidate({ title: 'List of coffee drinks', description: 'beverages' })))
				.toBeLessThan(0);
			expect(specificity(candidate({ title: 'Timeline of Italian history', description: '' })))
				.toBeLessThan(0);
		});
	});

	describe('stays neutral on good laterals (left to a future graph layer)', () => {
		it('does not penalize a real taxonomic relative described as "Class of …"', () => {
			expect(specificity(candidate({ title: 'Cephalopod', description: 'Class of mollusks' })))
				.toBe(0);
		});
	});

	// Real Wikidata descriptions (harvested from en.wikipedia). The geographic abstraction
	// ladder a position ranking climbs: United Kingdom → Northwestern Europe → Northern
	// Europe → Continent. NAMED_TITLE wrongly rewards "Northern Europe" as a proper noun;
	// without isContinentalRegion the climb wins on position + that bonus.
	describe('penalizes the continental abstraction ladder (country → region → continent)', () => {
		const sinks: [string, string][] = [
			['Northwestern Europe', 'Geographical region'],
			['Northern Europe', 'Northern region of the European continent'],
			['Western Europe', 'Subregion of the European continent'],
			['Southern Europe', 'Southern region of Europe'],
			['Eastern Europe', ''], // empty Wikidata desc — caught by the title rule
			['Central Asia', 'Subregion of the Asian continent'],
			['Sub-Saharan Africa', 'Regions south of the Sahara'],
			['Latin America', 'Region of the Americas'],
			['North Africa', 'Northernmost region of Africa'],
			['Europe', 'Continent'],
			['Continent', 'Large geographical region identified by convention']
		];
		for (const [title, description] of sinks) {
			it(`demotes "${title}" (${description || 'no description'})`, () => {
				expect(specificity(candidate({ title, description }))).toBeLessThan(0);
			});
		}
	});

	describe('does not demote concrete places that look like regions', () => {
		// Countries / states whose titles or descriptions brush the region patterns.
		const keep: [string, string][] = [
			['South Africa', 'Country in Southern Africa'], // title is <Direction> <Continent>
			['North Korea', 'Country in East Asia'],
			['Northern Ireland', 'Part of the United Kingdom'],
			['West Virginia', 'U.S. state'],
			['New South Wales', 'State of Australia'],
			['Central African Republic', 'Country in Central Africa'],
			['New England', 'Region in the Northeastern United States'], // region scoped to a country
			['Tuscany', 'Region of Italy'],
			['Siberia', 'Geographical region of Russia comprising North Asia']
		];
		for (const [title, description] of keep) {
			it(`keeps "${title}" (${description}) non-negative`, () => {
				expect(specificity(candidate({ title, description }))).toBeGreaterThanOrEqual(0);
			});
		}
	});
});

describe('scoreCandidate — specificity', () => {
	it('ranks a vivid dated article above an abstraction sink at the same position', () => {
		const ctx = context();
		const vivid = scoreCandidate(
			candidate({ title: 'Byzantine Empire', description: 'Continuation of the Roman Empire (330–1453)' }),
			ctx
		);
		const sink = scoreCandidate(candidate({ title: 'Entity', description: 'Something that exists' }), ctx);
		expect(vivid).toBeGreaterThan(sink);
	});

	describe('tapers under expressed interest', () => {
		// Two candidates with identical tokens (so identical relevance), differing only in
		// whether the description trips ABSTRACT_LEAD. Their score gap IS the specificity
		// penalty, isolated. "Study of meaning" matches; "Study meaning" does not; both
		// tokenize to {study, meaning} (the stopword "of" drops out).
		const abstract = candidate({ title: 'Foo', description: 'Study of meaning' });
		const plain = candidate({ title: 'Foo', description: 'Study meaning' });
		const penalty = (ctx: EngineContext) => scoreCandidate(plain, ctx) - scoreCandidate(abstract, ctx);

		it('applies the full penalty at cold start (no interest to defer to)', () => {
			expect(penalty(context())).toBeCloseTo(FEED.specificityWeight, 5);
		});

		it('softens the penalty once the user has engaged with the topic', () => {
			const warm = context({
				tokenWeights: { study: 2, meaning: 2 },
				tokenDocFreq: { study: 1, meaning: 1 }
			});
			const warmPenalty = penalty(warm);
			expect(warmPenalty).toBeLessThan(penalty(context())); // defers to expressed interest
			expect(warmPenalty).toBeGreaterThan(0); // but never fully inverts the signal
		});
	});
});

describe('scoreCandidate — DF discounting', () => {
	it('discounts tokens that appear in many seen documents', () => {
		// Token "octopus" has weight 1 and df 10:
		// effectiveWeight = 1 / (1 + Math.log(1 + 10)) = 1 / (1 + Math.log(11))
		const expectedContribution = 1 / (1 + Math.log(11));
		const ctx = context({
			tokenWeights: { octopus: 1 },
			tokenDocFreq: { octopus: 10 }
		});
		// Candidate with only the token "octopus" in title.
		const c = candidate({ title: 'Octopus', description: '' });
		const score = scoreCandidate(c, ctx);
		// Relevance is expectedContribution, squashed via tanh(x/2), then scaled by relevanceWeight.
		const expectedScore =
			FEED.base +
			FEED.relevanceWeight * Math.tanh(expectedContribution / 2) +
			FEED.imageBonus + // candidate has thumbnail
			FEED.positionWeight * Math.exp(-0 / FEED.positionHalfLife); // position=0
		expect(score).toBeCloseTo(expectedScore, 5);
	});

	it('applies no discount when df is 0 (token never seen before)', () => {
		// df=0 → effectiveWeight = weight / (1 + ln(1)) = weight / 1 = weight
		const ctx = context({ tokenWeights: { rare: 2 }, tokenDocFreq: {} });
		const c = candidate({ title: 'Rare', description: '' });
		const score = scoreCandidate(c, ctx);
		const expectedRelevance = 2 / (1 + Math.log(1 + 0));
		const expectedScore =
			FEED.base +
			FEED.relevanceWeight * Math.tanh(expectedRelevance / 2) +
			FEED.imageBonus +
			FEED.positionWeight * Math.exp(-0 / FEED.positionHalfLife);
		expect(score).toBeCloseTo(expectedScore, 5);
	});
});

describe('directional tangents', () => {
	/** A run deep enough that the break is certain (ramp end = 1). */
	const BREAK_DEPTH = FEED.runMinLength + FEED.runBreakRamp.length - 1;

	/** Filler with mid-range scores and no hooks — never tangent-eligible. */
	function neutralPool(n: number): Candidate[] {
		return Array.from({ length: n }, (_, i) =>
			candidate({ title: `Neutral ${i}`, description: 'neutral topic', thumbnail: null, position: i })
		);
	}

	/** Hooky candidates dated to the 1980s and placed outside the run (era pool fuel). */
	function eraHooks(n: number): Candidate[] {
		return Array.from({ length: n }, (_, i) =>
			candidate({
				title: `Distant event ${i}`,
				description: 'unsolved mystery of a 1985 earthquake in Mexico',
				thumbnail: null,
				position: 100 + i
			})
		);
	}

	/** The Falklands-run context the era/place fixtures jump from. */
	function runContext(rng: () => number) {
		return context({
			runDepth: BREAK_DEPTH,
			runEras: new Set(['1980s']),
			runPlaces: new Set(['argentina', 'united kingdom']),
			rng
		});
	}

	it('labels a same-era different-place jump as an era tangent', () => {
		// surpriseMinPool gates the break itself; directionMinPool is satisfied within it.
		const pool = [...neutralPool(FEED.topK), ...eraHooks(FEED.surpriseMinPool)];
		// Break roll (certain) → direction roll 0.5 (past wildShare, one pool → era) → pick top.
		const result = selectNext(pool, runContext(seq([0, 0.5, 0])));
		expect(result?.surprised).toBe(true);
		expect(result?.direction).toBe('era');
		expect(result?.candidate.title).toMatch(/^Distant event/);
	});

	it('labels a same-place different-era jump as a place tangent', () => {
		const placeHooks = Array.from({ length: FEED.surpriseMinPool }, (_, i) =>
			candidate({
				title: `Old event ${i}`,
				description: 'unsolved mystery of 17th-century Argentina',
				thumbnail: null,
				position: 100 + i
			})
		);
		const result = selectNext(
			[...neutralPool(FEED.topK), ...placeHooks],
			runContext(seq([0, 0.5, 0]))
		);
		expect(result?.surprised).toBe(true);
		expect(result?.direction).toBe('place');
	});

	it('keeps the wild-card share: a low direction roll ignores available directions', () => {
		const pool = [...neutralPool(FEED.topK), ...eraHooks(FEED.surpriseMinPool)];
		// Direction roll 0.1 < directionWildShare → undirected pool, no label.
		const result = selectNext(pool, runContext(seq([0, 0.1, 0])));
		expect(result?.surprised).toBe(true);
		expect(result?.direction).toBeUndefined();
	});

	it('degrades to wild tangents when the session carries no run era/place state', () => {
		// Old clients (or brand-new runs) send nothing: directions never fire.
		const pool = [...neutralPool(FEED.topK), ...eraHooks(FEED.surpriseMinPool)];
		const ctx = context({ runDepth: BREAK_DEPTH, rng: seq([0, 0.5, 0]) });
		const result = selectNext(pool, ctx);
		expect(result?.surprised).toBe(true);
		expect(result?.direction).toBeUndefined();
	});

	it('does not let a thin directional pool block the tangent (falls back to wild)', () => {
		// One era candidate < directionMinPool, but the gated pool is deep enough:
		// the break still jumps, unlabeled.
		const wildHooks = Array.from({ length: FEED.surpriseMinPool }, (_, i) =>
			candidate({
				title: `Lost article ${i}`,
				description: 'unsolved mystery and abandoned experimental project',
				thumbnail: null,
				position: 100 + i
			})
		);
		const pool = [...neutralPool(FEED.topK), ...wildHooks, ...eraHooks(1)];
		const result = selectNext(pool, runContext(seq([0, 0.9, 0])));
		expect(result?.surprised).toBe(true);
		expect(result?.direction).toBeUndefined();
	});
});
