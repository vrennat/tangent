import { describe, it, expect } from 'vitest';
import type { Candidate } from '../src/lib/wikipedia/types';
import type { EngineContext } from '../src/lib/feed/types';
import { scoreCandidate, specificity } from '../src/lib/feed/score';
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
		recentTokens: new Set(),
		seenTitles: new Set(),
		noSurprise: false,
		stepIndex: 0,
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

		it('penalizes overlap with recently shown articles (variety)', () => {
			const ctx = context({ recentTokens: new Set(['water', 'channel']) });
			const monotonous = scoreCandidate(candidate(), ctx);
			const fresh = scoreCandidate(candidate({ title: 'Volcano', description: 'erupting mountain' }), ctx);
			expect(fresh).toBeGreaterThan(monotonous);
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

		it('applies the variety penalty once for a token repeated within a candidate', () => {
			const ctx = context({ recentTokens: new Set(['aqueduct']) });
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

		it('uses the taste pacing slot to lean harder into explicit flavor', () => {
			const ctx = context({ taste: 'technology', stepIndex: 2, rng: seq([0.99, 0]) });
			const pool = [
				candidate({ title: 'Canal', description: 'water channel', position: 0 }),
				candidate({
					title: 'Packet switching',
					description: 'computer networking technology',
					categories: ['Category:Internet technology'],
					position: 12
				})
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('Packet switching');
		});

		it('uses the intrigue pacing slot to pick a hooky lateral', () => {
			const ctx = context({ stepIndex: 3, rng: seq([0.99, 0]) });
			const pool = [
				candidate({ title: 'Canal', description: 'water channel', position: 0 }),
				candidate({ title: 'Lost city', description: 'abandoned ancient settlement', position: 12 })
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('Lost city');
		});

		it('uses the specificity pacing slot to prefer vivid concrete articles', () => {
			const ctx = context({ stepIndex: 4, rng: seq([0.99, 0]) });
			const pool = [
				candidate({ title: 'Entity', description: 'Something that exists', position: 0 }),
				candidate({ title: 'New Orleans', description: 'city founded in 1718', position: 10 })
			];

			expect(selectNext(pool, ctx)?.candidate.title).toBe('New Orleans');
		});
	});

	describe('surprise mode', () => {
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

		it('fires when RNG falls under the epsilon and the hooky surprise pool is large enough', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({ rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(true);
			expect(result?.candidate.title).toMatch(/^Lost article/);
		});

		it('falls back to normal pick when the hooky surprise pool is too shallow', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool - 1)];
			const ctx = context({ rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(false);
		});

		it('falls back to normal pick when the middle has no strong hooks', () => {
			const pool = neutralPool(FEED.topK + FEED.surpriseMinPool + 1);
			const ctx = context({ rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(false);
		});

		it('never surprises when noSurprise is true, even with rng forcing epsilon', () => {
			const pool = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const ctx = context({ noSurprise: true, rng: seq([0, 0]) });
			const result = selectNext(pool, ctx);
			expect(result?.surprised).toBe(false);
		});

		it('does not let hookless high scorers crowd hooky candidates out of the surprise pool', () => {
			// 8 top-K fillers, then 10 relevance-strong but hookless "mediums" whose
			// surprise score outranks the hooky tail, then 4 genuinely hooky candidates.
			// The mediums are ineligible (zero intrigue) — they must not consume the
			// surprise pool's top-K slots and starve out the eligible hooky tail.
			const ctx = context({ tokenWeights: { alpha: 3, beta: 3 }, rng: seq([0, 0]) });
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

		it('excludes political candidates from the surprise pool', () => {
			// Build a large pool; mix in a political candidate near the bottom of scores.
			// With rng always triggering surprise, it should never be the pick.
			const normalCandidates = [...neutralPool(FEED.topK), ...hookyTail(FEED.surpriseMinPool + 1)];
			const political = candidate({
				title: 'United States presidential election',
				description: 'unsolved election politics scandal',
				categories: ['Category:Elections'],
				position: 100
			});
			const pool = [...normalCandidates, political];
			// Run many selections with rng always firing surprise and picking the first entry.
			// The political one ends up ranked last (heavily penalized); verify it never wins.
			for (let i = 0; i < 20; i++) {
				const ctx = context({ rng: seq([0, 0]) });
				const result = selectNext(pool, ctx);
				if (result?.surprised) {
					expect(result.candidate.title).not.toBe(political.title);
				}
			}
		});
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
