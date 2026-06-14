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
	  /* Backstop against the article panning sideways: any child wider than the column
	     (an untagged wide table, a fixed-px panorama, a stray graphic) would otherwise let
	     the whole webview scroll horizontally. Known-wide constructs get their own internal
	     scroll/wrap below; anything we miss is clipped at the column edge. `clip` (not
	     `hidden`) keeps overflow-y `visible` so the article still scrolls vertically. */
	  overflow-x: clip;
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
	/* Inline data-viz SVGs (graphs, small charts) carry an intrinsic px width that can
	   exceed the column; cap to the column and scale height to match. */
	svg { max-width: 100%; height: auto; }
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
	/* {{multiple image}} montages (div.thumb.tmulti) tile photos into rows of fixed-size
	   crop cells via MediaWiki TemplateStyles we strip — without them the rows linearize
	   into a ragged vertical stack and the cell crop boxes spill full-size images. Restore
	   the row/cell flex layout honoring the inline per-cell widths + crop heights; the
	   .thumbinner rule above centers + caps the whole montage. */
	.tmulti .trow { display: flex; flex-wrap: wrap; justify-content: center; gap: 3px; }
	.tmulti .thumbimage { max-width: 100%; }
	.tmulti .thumbimage img {
	  width: 100%; height: 100%; object-fit: cover;
	  margin: 0; border: 0; border-radius: 2px; box-shadow: none;
	}
	b, strong { color: var(--ink); }
	blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid var(--hair-strong); color: var(--faint); }
	hr { border: 0; border-top: 1px solid var(--hair); margin: 1.4em 0; }
	sup { font-size: 0.7em; }
	table {
	  /* min-width:0 neutralizes Wikipedia's inline `min-width:60em` on collapsible/wide
	     tables — it beats max-width:100% otherwise, forcing the box ~960px wide so
	     overflow-x:auto has nothing to scroll and the column just pans sideways. */
	  display: block; max-width: 100%; min-width: 0 !important; overflow-x: auto;
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
	/* EasyTimeline raster graphics (<timeline>) — a fixed-size PNG (e.g. 1100×120) with a
	   pixel-coordinate <map>/<area> overlay, wrapped in div.timeline-wrapper. The global
	   img{max-width:100%} would shrink it to an illegible strip and misalign the hotspots;
	   keep it at native resolution and scroll the wrapper so the <area> targets stay aligned.
	   Mirrors the web .timeline-wrapper rules (src/app.css). */
	.timeline-wrapper { max-width: 100%; overflow-x: auto; }
	.timeline-wrapper img { max-width: none; border-radius: 0; }
	/* Pushpin location maps ({{Location map}}) — re-inject position:absolute (it lived only
	   in the stripped TemplateStyles) so % markers land on the map; cap wrappers + image to
	   the column so they shrink in lockstep and stay aligned; neutralize the dark image
	   backdrop; give labels a haloed near-black fill so they read on the light map. Mirrors
	   the web .locmap rules (src/app.css). */
	.locmap, .locmap div:not(.od):not(.id):not(.pl):not(.pr):not(.pv):not(.l0) { max-width: 100%; }
	.locmap .od, .locmap .id, .locmap .l0, .locmap .pl, .locmap .pr, .locmap .pv { position: absolute; }
	.locmap img { background: none; border-radius: 0; }
	.locmap .pl, .locmap .pr, .locmap .pv, .locmap .l0 {
	  color: #1b1b1b; font-family: var(--sans); font-size: 0.7rem; line-height: 1.15;
	  text-shadow: 0 0 2px #fff, 0 0 3px #fff;
	}
	/* Multi-map zoom switchers ({{Location map+}}) stack every zoom level once their JS is
	   stripped — show only the first .center (the authored default). */
	.switcher-container > .center ~ .center { display: none; }
	/* Cladograms ({{Clade}}) — nested table.clade (in div.clade) whose L-connectors are
	   border-left/border-bottom on the label cells in currentColor; that + the cell layout
	   lived only in stripped TemplateStyles, and our generic table rules would flatten the
	   tree. Scroll the wrapper, restore table layout, clear generic cell chrome, re-inject
	   the cell rules (adapted from Clade/styles.css). Mirrors src/app.css. */
	div.clade { max-width: 100%; overflow-x: auto; overflow-y: hidden; }
	table.clade {
	  display: table; width: auto; border-collapse: separate; border-spacing: 0;
	  margin: 0; font-size: 0.8rem; line-height: 1; white-space: nowrap;
	}
	table.clade table.clade { width: 100%; line-height: inherit; }
	table.clade td { border: 0; padding: 0; background: none; }
	table.clade td.clade-label {
	  min-width: 0.7em; width: 0.7em; padding: 0.1em 0.25em; vertical-align: bottom;
	  text-align: center; white-space: nowrap; border-left: 1px solid; border-bottom: 1px solid;
	}
	table.clade td.clade-label.first { border-left: none; border-right: none; }
	table.clade td.clade-label.reverse { border-left: none; border-right: 1px solid; }
	table.clade td.clade-slabel {
	  padding: 0.1em 0.25em; vertical-align: top; text-align: center; white-space: nowrap;
	  border-left: 1px solid;
	}
	table.clade td.clade-slabel.last { border-left: none; border-right: none; }
	table.clade td.clade-slabel.reverse { border-left: none; border-right: 1px solid; }
	table.clade td.clade-bar { vertical-align: middle; text-align: left; padding: 0 0.5em; }
	table.clade td.clade-leaf, table.clade td.clade-leafR { border: 0; padding: 0; }
	table.clade td.clade-leaf { text-align: left; }
	table.clade td.clade-leafR { text-align: right; }
	table.clade td.clade-leaf p { padding: 0 5px 0 2px; }
	/* Proportion / vote bars ({{Percentage bar}}) — the -fill div's inline width:% survives
	   but its layout was stripped; restore the fixed-width track + absolute fill. Inline
	   background-color (party colours) overrides the accent default. Mirrors src/app.css. */
	.percentage-bar {
	  position: relative; display: inline-block; width: 100px; max-width: 100%; height: 1.1em;
	  vertical-align: middle; background: var(--surface2); border: 1px solid var(--hair);
	  border-radius: 2px; overflow: hidden;
	}
	.percentage-bar-fill { position: absolute; top: 0; left: 0; height: 100%; background: var(--accent); }
	.percentage-bar-text {
	  position: absolute; inset: 0; text-align: center; font-family: var(--sans);
	  font-size: 0.62rem; line-height: 1.1em; color: var(--ink);
	}
	/* CSS pie charts ({{Pie chart}}, smooth) — the circle's wedge clip-paths were stripped, so
	   drop it and present the surviving legend (swatch + "Label (NN%)") as the chart. Mirrors
	   src/app.css. */
	.smooth-pie, .smooth-pie-border { display: none; }
	.smooth-pie-caption { font-family: var(--sans); font-size: 0.8rem; font-weight: 600; color: var(--muted); margin-bottom: 0.4em; }
	.smooth-pie-legend .l-color {
	  display: inline-block; width: 0.75em; height: 0.75em; border-radius: 2px;
	  vertical-align: -0.05em; margin: 0 0.35em 0 0;
	}
	.smooth-pie-legend .l-label { margin-right: 0.9em; font-size: 0.85rem; line-height: 1.7; }
	/* Ancestor tables ({{Ahnentafel}}) — recolour the .ahnentafel-t/-b connectors (their
	   var(--color-base,#000) → black → invisible on dark) and darken the light-pastel person
	   boxes' text. Mirrors src/app.css. */
	table.ahnentafel { display: table; border-collapse: separate; border-spacing: 0; font-size: 0.78rem; }
	table.ahnentafel td, table.ahnentafel th { border: 0; padding: 0; background: none; color: #1b1b1b; }
	table.ahnentafel a, table.ahnentafel b, table.ahnentafel strong { color: #1b1b1b; }
	table.ahnentafel td.ahnentafel-t { border-top: 1px solid var(--faint); border-left: 1px solid var(--faint); }
	table.ahnentafel td.ahnentafel-b { border-bottom: 1px solid var(--faint); border-left: 1px solid var(--faint); }
	/* Native charts ({{Chart}} / <wiki-chart>) — the pre-rendered SVG is authored for a light
	   page (canvas var(--background-color-base,#fff), dark text/axes), so give its canvas our
	   warm paper plate — like light line-drawings — and cap the wrapper + svg to the column.
	   Mirrors src/app.css. */
	.enwiki-chart {
	  width: auto !important; max-width: 100%;
	  --background-color-base: #faf6ec; background: #faf6ec;
	  border-radius: 14px; padding: 0.4rem; overflow: hidden;
	}
	.enwiki-chart svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
	/* Weather/climate boxes ({{Weather box}}, tagged table.wh-climate server-side) — keep the
	   inline temperature heatmap and scroll the months horizontally, but pin the metric-label
	   column so it stays readable. nowrap forces natural column width so it scrolls instead of
	   squeezing. NOTE: position:sticky inside an overflow-x:auto block is WebKit-finicky — confirm
	   it pins on-device. Mirrors src/app.css. */
	table.wh-climate { border-collapse: separate; border-spacing: 0; white-space: nowrap; }
	table.wh-climate th, table.wh-climate td { border: 1px solid var(--hair); padding: 0.25em 0.5em; }
	table.wh-climate tr > :first-child {
	  position: sticky; left: 0; z-index: 1; background: var(--surface2); color: var(--ink); text-align: left;
	}
	/* Family/pedigree tree charts ({{Chart}}/{{Tree chart}}, wrapped div.wh-chart-scroll + tagged
	   table.wh-chart) — preserve the authored grid (the connectors ARE the data); strip the generic
	   cell mesh so only the inline borders draw, and scroll the wrapper. Light-bg boxes get dark
	   text (as with ahnentafel). Mirrors src/app.css. */
	.wh-chart-scroll { max-width: 100%; overflow-x: auto; }
	table.wh-chart {
	  display: table; width: auto; border-collapse: separate; border-spacing: 0; margin: 0 auto;
	  white-space: nowrap; font-size: 0.72rem; color: var(--read);
	}
	table.wh-chart td, table.wh-chart th { border: 0; padding: 0; background: none; }
	table.wh-chart td[style*='border:1px solid'] { padding: 0.15em 0.3em; }
	table.wh-chart td[style*='background'],
	table.wh-chart td[style*='background'] a,
	table.wh-chart td[style*='background'] b,
	table.wh-chart td[style*='background'] strong { color: #1b1b1b; }

	/* Wide all-text data tables (election results, demographics, rankings, … tagged table.wh-wide
	   server-side) — nowrap restores each column's natural width so the generic overflow-x scroll
	   engages instead of squeezing to one word per line. A lone full-width footnote/caption banner
	   is the one cell allowed to wrap. No engine divergence (unlike wh-climate's sticky). */
	table.wh-wide th, table.wh-wide td { white-space: nowrap; }
	table.wh-wide th[colspan], table.wh-wide td[colspan] { white-space: normal; }

	/* Untagged wide constructs (mirror of src/app.css): Wikipedia widgets that ship a
	   fixed/intrinsic width with no column-cap of their own, so each blows past the column.
	   Scroll the wide ones, wrap the tiled ones, cap the rest — so the body clip backstop
	   rarely has to swallow real content. */
	/* Code / pseudocode (<pre>): white-space:pre can't wrap, so a long line runs off the
	   column. Scroll it, and dress it as a code card with a mono stack (the serif is wrong). */
	pre {
	  max-width: 100%; overflow-x: auto;
	  font-family: ui-monospace, Menlo, Courier, monospace; font-size: 0.8rem; line-height: 1.5;
	  background: var(--surface2); border: 1px solid var(--hair);
	  border-radius: 0.5rem; padding: 0.75rem 0.9rem;
	}
	/* Image galleries (<ul class="gallery">): reflow the fixed-width tiles into a centered
	   wrapping row so they fit the column instead of stacking at content width. */
	ul.gallery { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; padding-left: 0; list-style: none; }
	li.gallerybox { max-width: 100%; }
	/* Legacy float boxes ({{float}}, .floatleft/.floatright) carry a fixed width and a float
	   our mw-halign reset doesn't cover — drop the float and center within the column. */
	.floatleft, .floatright { float: none; max-width: 100%; margin: 1em auto; }
	/* Bar charts ({{Bar box}}, div.barbox) and fixed-px wide-image / panorama wrappers
	   (div.noresize, e.g. {{Wide image}}) ship an inline pixel width built for desktop — cap
	   to the column and scroll horizontally so they stay viewable by panning. */
	.barbox, div.noresize { max-width: 100%; overflow-x: auto; }
	"""
}
