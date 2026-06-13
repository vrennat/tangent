import Foundation

/// The Nightstand reader stylesheet, injected into the reader's WKWebView. Mirrors the
/// web's `.wiki-content` rules (src/app.css) so the in-app reader reads like the site:
/// serif long-form by lamplight, links resting at ink with a faint ember underline,
/// infoboxes collapsed to "Quick facts", figures centered, tables that scroll.
///
/// The `/api/article` HTML arrives sanitized and with headings already demoted
/// (h2→h3…) and infoboxes wrapped in `<details class="quick-facts">` — see
/// wikipedia/article.ts — so these are presentation-only rules.
enum ReaderCSS {
	static let value = """
	:root {
	  --void: #15110c; --surface: #1f1a13; --surface2: #2a2218;
	  --ink: #ece4d6; --muted: #a89c8a; --faint: #9b8f76; --accent: #e0a14e;
	  --read: #cdbfa6; /* brighter long-form body so an article doesn't read gray */
	  --hair: rgba(236,228,214,0.10); --hair-strong: rgba(236,228,214,0.18);
	  --serif: ui-serif, "New York", Georgia, serif;
	  --sans: -apple-system, system-ui, sans-serif;
	}
	* { -webkit-text-size-adjust: 100%; }
	html, body { margin: 0; background: var(--void); }
	body {
	  color: var(--read);
	  font-family: var(--serif);
	  font-size: 1.0625rem;
	  line-height: 1.75;
	  padding: 0.5rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
	  overflow-wrap: break-word;
	  word-break: break-word;
	  -webkit-font-smoothing: antialiased;
	}
	p { margin: 0 0 0.9em; }
	/* The lead reads as a standfirst — larger, set in ink — so the eye lands on the
	   article's opening rather than the hatnotes above it. Tagged in ReaderJS. */
	.wh-lead { color: var(--ink); font-size: 1.2rem; line-height: 1.65; margin-bottom: 1.1em; }
	/* Links rest at ink with a faint ember underline; the article-vs-external distinction
	   is enforced by the navigation delegate (tap = follow in-app or open externally). */
	a {
	  color: var(--ink);
	  text-decoration-color: color-mix(in oklab, var(--accent) 28%, transparent);
	  text-decoration-line: underline;
	  text-decoration-thickness: 1px;
	  text-underline-offset: 2px;
	  -webkit-tap-highlight-color: rgba(224,161,78,0.18);
	}
	h3, h4, h5 {
	  color: var(--ink); font-family: var(--serif); font-weight: 600;
	  line-height: 1.3; margin: 1.4em 0 0.5em;
	}
	h3 { font-size: 1.25rem; padding-bottom: 0.3em; border-bottom: 1px solid var(--hair); }
	h4 { font-size: 1.1rem; }
	h5 { font-size: 1rem; }
	ul, ol { margin: 0 0 0.9em; padding-left: 1.4em; }
	li { margin: 0.25em 0; }
	ul { list-style: disc; } ol { list-style: decimal; }
	img, video { max-width: 100%; height: auto; border-radius: 0.5rem; background: var(--surface); }
	video { display: block; margin-inline: auto; }
	figure { margin: 1.5em auto; max-width: min(100%, 30rem); text-align: center; }
	figure img, figure video { display: block; margin-inline: auto; }
	/* Framed plates: a hairline + soft shadow lift photos off the dark column. (Tapping a
	   figure opens the full-screen image viewer — see ReaderJS.) */
	figure img, .thumbinner img {
	  border: 1px solid var(--hair);
	  box-shadow: 0 10px 30px -18px rgba(0,0,0,0.85);
	}
	figure.mw-halign-left, figure.mw-halign-right,
	.mw-halign-left, .mw-halign-right { float: none; margin-inline: auto; }
	.thumb { float: none; margin: 1.5em auto; max-width: 100%; text-align: center; }
	/* fit-content + !important override the inline width/max-width Wikipedia hard-codes,
	   so wide thumbs cap to the column and center instead of overflowing left. */
	.thumbinner { width: fit-content !important; max-width: 100% !important; margin-inline: auto; }
	.gallerybox, .gallerybox .thumb { margin-inline: auto; text-align: center; }
	.infobox-image, .infobox-full-data { text-align: center; }
	.infobox-image .mw-default-size,
	.infobox-image .mw-file-description,
	.infobox-image .mw-file-element,
	.infobox-full-data .mw-file-element {
	  display: block; margin-inline: auto;
	}
	figcaption, .thumbcaption {
	  font-size: 0.8rem; color: var(--faint); margin-top: 0.5em;
	  text-align: center; line-height: 1.5;
	}
	b, strong { color: var(--ink); }
	blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid var(--hair-strong); color: var(--faint); }
	hr { border: 0; border-top: 1px solid var(--hair); margin: 1.4em 0; }
	sup { font-size: 0.7em; }
	table {
	  display: block; max-width: 100%; overflow-x: auto;
	  border-collapse: collapse; font-size: 0.85rem; margin: 1em 0;
	}
	th, td { border: 1px solid var(--hair); padding: 0.35em 0.6em; text-align: left; vertical-align: top; }
	th { color: var(--ink); background: var(--surface2); }
	/* Infobox "Quick facts" disclosure (wrapped server-side). */
	.quick-facts {
	  margin: 1.4em 0; border: 1px solid var(--hair);
	  border-radius: 14px; background: var(--surface); overflow: hidden;
	}
	.quick-facts > summary {
	  cursor: pointer; list-style: none; display: flex; align-items: center; gap: 0.5rem;
	  padding: 0.7rem 0.9rem; font-family: var(--sans); font-size: 0.75rem; font-weight: 600;
	  letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted);
	}
	.quick-facts > summary::-webkit-details-marker { display: none; }
	.quick-facts[open] > summary { border-bottom: 1px solid var(--hair); }
	.quick-facts table, .quick-facts td, .quick-facts th {
	  background: transparent !important; color: inherit; width: auto !important;
	}
	.quick-facts td, .quick-facts th { font-size: 0.85rem; }
	.hatnote { color: var(--faint); font-style: italic; font-size: 0.85rem; margin-bottom: 0.8em; }
	/* Hide Wikipedia chrome so the reader opens on the article, not a Wikipedia mirror:
	   editorial furniture plus the sidebar/navbox/citation noise that linearizes into a
	   wall of navigation in our single dark column. Mirrors the web reader's hide list.
	   .nomobile is WP's own "too wide for a phone" flag (graphical timelines etc.); the
	   ones we recognize are reflowed to .wh-tl server-side (wikipedia/timeline.ts), so
	   this just nets any we couldn't parse. .navbar is the view·talk·edit / v·t·e chrome. */
	.mw-editsection, .shortdescription, .noprint, .nomobile, .navbar, .navbox,
	.navbox-styles, .metadata, .ambox, .mbox-image, .mw-empty-elt, .mw-jump-link,
	.sidebar, .vertical-navbox, .IPA, .ext-phonos, .mw-tmh-player, sup.reference,
	.reflist, ol.references, style, link {
	  display: none !important;
	}
	/* Reflowed graphical timeline ({{Nature timeline}} & kin) — a continuous era-coloured
	   vertical spine with events as dots, life-grade onsets as rings, integer-Gya axis at
	   left. top/height are inline px (from source em); these own horizontal layout (keyed
	   off --tl-spine) + styling. Mirrors the web .wh-tl rules. */
	.wh-tl {
	  --tl-spine: 88px; margin: 1.6em 0; border: 1px solid var(--hair); border-radius: 14px;
	  background: linear-gradient(180deg, var(--surface), var(--void)); overflow: hidden;
	}
	.wh-tl-title {
	  font-family: var(--sans); font-size: 0.75rem; font-weight: 700; color: var(--accent);
	  letter-spacing: 0.09em; text-transform: uppercase; padding: 0.85rem 1rem 0.15rem;
	}
	.wh-tl-title a { color: var(--accent); text-decoration: none; }
	.wh-tl-axis {
	  display: flex; justify-content: space-between; font-family: var(--sans);
	  font-size: 0.65rem; color: var(--faint); padding: 0.4rem 1rem 0.75rem;
	  border-bottom: 1px solid var(--hair);
	}
	.wh-tl-track { position: relative; margin: 0.5rem 0; }
	.wh-tl-grid { position: absolute; left: 30px; right: 14px; height: 1px; background: var(--hair); opacity: 0.6; }
	.wh-tl-age {
	  position: absolute; left: 10px; width: 18px; text-align: right; font-family: var(--sans);
	  font-size: 0.5625rem; color: var(--faint); transform: translateY(-50%);
	}
	.wh-tl-age-unit { transform: none; color: var(--muted); }
	.wh-tl-seg { position: absolute; left: calc(var(--tl-spine) - 4px); width: 8px; border-radius: 4px; opacity: 0.92; }
	.wh-tl-segname {
	  position: absolute; left: calc(var(--tl-spine) - 32px); width: 24px; display: flex;
	  align-items: center; justify-content: center; writing-mode: vertical-rl; font-family: var(--sans);
	  font-size: 0.5625rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase;
	  text-align: center; color: var(--faint); opacity: 0.9; overflow: hidden;
	}
	.wh-tl-conn { position: absolute; left: var(--tl-spine); width: 1px; background: var(--hair-strong); }
	.wh-tl-mk { position: absolute; left: var(--tl-spine); transform: translate(-50%, -50%); }
	.wh-tl-dot { display: block; width: 9px; height: 9px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--void); }
	.wh-tl-ring {
	  display: block; width: 11px; height: 11px; border-radius: 50%;
	  border: 2.5px solid var(--accent); background: var(--void); box-shadow: 0 0 0 3px var(--void);
	}
	.wh-tl-lab { position: absolute; left: calc(var(--tl-spine) + 14px); right: 6px; transform: translateY(-50%); line-height: 1.15; }
	.wh-tl-lab a { font-size: 0.9rem; color: var(--ink); text-decoration: none; }
	.wh-tl-onset a {
	  font-family: var(--sans); font-size: 0.7rem; font-weight: 700;
	  letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted);
	}
	"""
}
