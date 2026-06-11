import type { Thumbnail } from './types';

/**
 * Pull the first substantial image out of Parsoid article HTML, for articles
 * where the REST summary has no thumbnail (PageImages picked no lead image —
 * common on broad concept pages like music genres).
 *
 * Parsoid annotates every image with the original file's type and dimensions,
 * which beats filename heuristics: icons, logos, flags, and maps are
 * `data-file-type="drawing"`, photos are `"bitmap"`.
 */

const IMG_TAG = /<img\b[^>]*>/g;

/** Rendered size below which an image is decoration, not a subject. */
const MIN_WIDTH = 100;
const MIN_HEIGHT = 80;

/** Width we request from the thumb scaler, capped at the original file width. */
const TARGET_WIDTH = 640;

/** Bitmap files that are still not representative of the article. */
const JUNK_NAME = /signature|autograph/i;

function attr(tag: string, name: string): string | null {
	return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

export function extractLeadImage(html: string): Thumbnail | null {
	for (const [tag] of html.matchAll(IMG_TAG)) {
		if (attr(tag, 'data-file-type') !== 'bitmap') continue;

		const rawSrc = attr(tag, 'src');
		if (!rawSrc) continue;
		const src = rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc;
		if (!src.startsWith('https://upload.wikimedia.org/')) continue;

		const width = Number(attr(tag, 'width'));
		const height = Number(attr(tag, 'height'));
		if (!width || !height || width < MIN_WIDTH || height < MIN_HEIGHT) continue;

		if (JUNK_NAME.test(attr(tag, 'resource') ?? src)) continue;

		const fileWidth = Number(attr(tag, 'data-file-width')) || width;
		const fileHeight = Number(attr(tag, 'data-file-height')) || height;

		// Thumb URLs end in /<N>px-<file>; re-request at a card-friendly width.
		if (/\/thumb\//.test(src) && /\/\d+px-[^/]*$/.test(src)) {
			const target = Math.min(TARGET_WIDTH, fileWidth);
			return {
				source: src.replace(/\/\d+px-([^/]*)$/, `/${target}px-$1`),
				width: target,
				height: Math.round((fileHeight * target) / fileWidth)
			};
		}

		return { source: src, width: fileWidth, height: fileHeight };
	}

	return null;
}
