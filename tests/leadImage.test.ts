import { describe, it, expect } from 'vitest';
import { extractLeadImage } from '../src/lib/wikipedia/leadImage';

/** Build a Parsoid-style img tag like those in REST /page/html output. */
function img(opts: {
	resource: string;
	src: string;
	width: number;
	height: number;
	fileWidth?: number;
	fileHeight?: number;
	fileType?: string;
}): string {
	return (
		`<img resource="./File:${opts.resource}" src="${opts.src}" decoding="async" ` +
		`data-file-width="${opts.fileWidth ?? opts.width}" ` +
		`data-file-height="${opts.fileHeight ?? opts.height}" ` +
		`data-file-type="${opts.fileType ?? 'bitmap'}" ` +
		`height="${opts.height}" width="${opts.width}" class="mw-file-element"/>`
	);
}

const ICON = img({
	resource: 'Ambox_current_red_Americas.svg',
	src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Ambox.svg/40px-Ambox.svg.png',
	width: 31,
	height: 25,
	fileWidth: 360,
	fileHeight: 290,
	fileType: 'drawing'
});

const PHOTO_THUMB = img({
	resource: 'Billie_Davies.jpg',
	src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Billie_Davies.jpg/250px-Billie_Davies.jpg',
	width: 250,
	height: 214,
	fileWidth: 1000,
	fileHeight: 856
});

describe('extractLeadImage', () => {
	describe('happy path', () => {
		it('picks the first substantial bitmap image', () => {
			const html = `<p>lead</p>${ICON}${PHOTO_THUMB}`;
			const result = extractLeadImage(html);
			expect(result?.source).toContain('Billie_Davies.jpg');
		});

		it('upscales a thumb URL to 640px and scales dimensions from the original file', () => {
			const result = extractLeadImage(PHOTO_THUMB);
			expect(result).toEqual({
				source:
					'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Billie_Davies.jpg/640px-Billie_Davies.jpg',
				width: 640,
				height: 548
			});
		});

		it('never requests a thumb wider than the original file', () => {
			const small = img({
				resource: 'Small.jpg',
				src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Small.jpg/250px-Small.jpg',
				width: 250,
				height: 200,
				fileWidth: 400,
				fileHeight: 320
			});
			const result = extractLeadImage(small);
			expect(result?.source).toContain('/400px-');
			expect(result?.width).toBe(400);
		});

		it('uses a non-thumb (original) src as-is with file dimensions', () => {
			const original = img({
				resource: 'EubieBlake.jpg',
				src: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/EubieBlake.jpg',
				width: 200,
				height: 244
			});
			const result = extractLeadImage(original);
			expect(result).toEqual({
				source: 'https://upload.wikimedia.org/wikipedia/commons/e/eb/EubieBlake.jpg',
				width: 200,
				height: 244
			});
		});

		it('normalizes protocol-relative srcs to https', () => {
			const relative = PHOTO_THUMB.replace('src="https://', 'src="//');
			const result = extractLeadImage(relative);
			expect(result?.source.startsWith('https://')).toBe(true);
		});
	});

	describe('filtering', () => {
		it('skips drawings (icons, logos, flags, maps)', () => {
			expect(extractLeadImage(ICON)).toBeNull();
		});

		it('skips images rendered too small to be substantial', () => {
			const tiny = img({
				resource: 'Thumbnail_sized.jpg',
				src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/T.jpg/60px-T.jpg',
				width: 60,
				height: 40,
				fileWidth: 60,
				fileHeight: 40
			});
			expect(extractLeadImage(tiny)).toBeNull();
		});

		it('skips signatures', () => {
			const sig = img({
				resource: 'Duke_Ellington_signature.jpg',
				src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Duke_Ellington_signature.jpg/250px-Duke_Ellington_signature.jpg',
				width: 250,
				height: 80,
				fileWidth: 500,
				fileHeight: 160
			});
			expect(extractLeadImage(sig)).toBeNull();
		});

		it('skips non-Wikimedia sources', () => {
			const external = img({
				resource: 'Elsewhere.jpg',
				src: 'https://example.com/big.jpg',
				width: 800,
				height: 600
			});
			expect(extractLeadImage(external)).toBeNull();
		});
	});

	describe('edge cases', () => {
		it('returns null when there are no images at all', () => {
			expect(extractLeadImage('<p>Text only article</p>')).toBeNull();
		});

		it('returns null for empty input', () => {
			expect(extractLeadImage('')).toBeNull();
		});
	});
});
