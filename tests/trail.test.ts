import { describe, it, expect, beforeEach } from 'vitest';
import type { TrailNode } from '../src/lib/feed/types';
import { saveTrail, loadTrail, clearTrail, chainTip } from '../src/lib/feed/trail';
import { FEED } from '../src/lib/feed/config';

// In-memory Storage mock — mirrors the sessionStorage interface used by trail.ts.
// Tests import functions that accept an injectable storage param so the browser
// guard and real sessionStorage never come into play.
class MockStorage implements Storage {
	#store: Record<string, string> = {};
	get length() { return Object.keys(this.#store).length; }
	key(index: number) { return Object.keys(this.#store)[index] ?? null; }
	getItem(key: string) { return this.#store[key] ?? null; }
	setItem(key: string, value: string) { this.#store[key] = value; }
	removeItem(key: string) { delete this.#store[key]; }
	clear() { this.#store = {}; }
}

function node(overrides: Partial<TrailNode> = {}): TrailNode {
	return {
		id: 'a#0',
		title: 'Aqueduct',
		relation: 'link',
		fromTitle: 'Rome',
		isDetour: false,
		seen: false,
		...overrides
	};
}

let storage: MockStorage;
beforeEach(() => {
	storage = new MockStorage();
});

describe('saveTrail / loadTrail round-trip', () => {
	it('persists and retrieves seed + nodes', () => {
		const nodes = [node({ title: 'Aqueduct' }), node({ title: 'Hydraulics', id: 'b#1' })];
		saveTrail('Rome', nodes, storage);
		const loaded = loadTrail(storage);
		expect(loaded?.seedTitle).toBe('Rome');
		expect(loaded?.trail).toHaveLength(2);
		expect(loaded?.trail[0].title).toBe('Aqueduct');
	});

	it('returns null when storage is empty', () => {
		expect(loadTrail(storage)).toBeNull();
	});

	it('returns null for corrupt JSON', () => {
		storage.setItem(FEED.trailStorageKey, 'not-json{');
		expect(loadTrail(storage)).toBeNull();
	});

	it('returns null when stored object is missing required fields', () => {
		storage.setItem(FEED.trailStorageKey, JSON.stringify({ foo: 'bar' }));
		expect(loadTrail(storage)).toBeNull();
	});
});

describe('saveTrail cap', () => {
	it(`keeps only the last ${FEED.trailCap} nodes`, () => {
		const nodes = Array.from({ length: FEED.trailCap + 10 }, (_, i) =>
			node({ id: `n#${i}`, title: `Article${i}` })
		);
		saveTrail('Seed', nodes, storage);
		const loaded = loadTrail(storage);
		expect(loaded?.trail).toHaveLength(FEED.trailCap);
		// Should be the last trailCap nodes (newest kept).
		expect(loaded?.trail[0].title).toBe(`Article10`);
		expect(loaded?.trail[FEED.trailCap - 1].title).toBe(`Article${FEED.trailCap + 9}`);
	});
});

describe('clearTrail', () => {
	it('removes the stored trail', () => {
		saveTrail('Rome', [node()], storage);
		clearTrail(storage);
		expect(loadTrail(storage)).toBeNull();
	});

	it('is a no-op when nothing is stored', () => {
		expect(() => clearTrail(storage)).not.toThrow();
	});
});

describe('chainTip', () => {
	it('returns null for an empty array', () => {
		expect(chainTip([])).toBeNull();
	});

	it('returns null when all nodes are detours', () => {
		const nodes = [node({ isDetour: true }), node({ isDetour: true, id: 'b#1' })];
		expect(chainTip(nodes)).toBeNull();
	});

	it('returns the last non-detour node', () => {
		const nodes = [
			node({ title: 'A', id: 'a#0', isDetour: false }),
			node({ title: 'B', id: 'b#1', isDetour: false }),
			node({ title: 'SurpriseJump', id: 'c#2', isDetour: true })
		];
		const tip = chainTip(nodes);
		expect(tip?.title).toBe('B');
	});

	it('skips consecutive trailing detours', () => {
		const nodes = [
			node({ title: 'Solid', id: 'a#0', isDetour: false }),
			node({ title: 'Detour1', id: 'b#1', isDetour: true }),
			node({ title: 'Detour2', id: 'c#2', isDetour: true })
		];
		expect(chainTip(nodes)?.title).toBe('Solid');
	});

	it('returns the only node when it is non-detour', () => {
		const single = node({ isDetour: false });
		expect(chainTip([single])?.title).toBe('Aqueduct');
	});
});
