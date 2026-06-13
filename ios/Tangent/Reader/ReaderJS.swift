import Foundation

/// Script injected at the end of the reader's WKWebView document. Two jobs, mirroring the
/// web reader (src/lib/components/ArticleReader.svelte):
///   1. Tag the lead paragraph `.wh-lead` so ReaderCSS can lift it to a standfirst.
///   2. Intercept taps on content images (figures, thumbnails, the infobox) and post the
///      best source + caption to the native side, which opens a full-screen image viewer.
///      `preventDefault`/`stopImmediatePropagation` stop the wrapping File: file-page link
///      from navigating; the navigation delegate suppresses it as a backstop.
enum ReaderJS {
	static let value = """
	(function () {
	  // Standfirst lead: the first substantial paragraph (Parsoid buries it after the
	  // shortdescription + hatnotes), skipping infobox/hatnote/figure paragraphs.
	  try {
	    var ps = document.querySelectorAll('p');
	    for (var i = 0; i < ps.length; i++) {
	      var p = ps[i];
	      if (p.closest('.quick-facts, .hatnote, table, figure')) continue;
	      if ((p.textContent || '').trim().length > 140) { p.classList.add('wh-lead'); break; }
	    }
	  } catch (e) {}

	  // Largest srcset candidate (typically 2x) over the original — Commons originals can
	  // be tens of MB, and the 2x thumb is plenty for a full-screen view.
	  function bestSrc(img) {
	    var ss = img.getAttribute('srcset');
	    if (ss) {
	      var best = '', bestScale = 0;
	      var parts = ss.split(',');
	      for (var i = 0; i < parts.length; i++) {
	        var seg = parts[i].trim().split(/\\s+/);
	        var url = seg[0], d = seg[1];
	        var scale = d ? parseFloat(d) : 1;
	        if (url && scale >= bestScale) { bestScale = scale; best = url; }
	      }
	      if (best) return best;
	    }
	    return img.currentSrc || img.src;
	  }

	  // Real content imagery — figures, thumbnails, the infobox lead — not inline icons,
	  // flags, or math glyphs (small, unframed).
	  function lightboxable(img) {
	    if (img.closest('figure, .thumb, .thumbinner, .quick-facts')) return true;
	    return img.clientWidth >= 100 && img.clientHeight >= 100;
	  }

	  document.addEventListener('click', function (e) {
	    var t = e.target;
	    var img = t && t.closest ? t.closest('img') : null;
	    if (!img || !lightboxable(img)) return;
	    e.preventDefault();
	    e.stopImmediatePropagation();
	    var fig = img.closest('figure, .thumb');
	    var cap = fig ? fig.querySelector('figcaption, .thumbcaption') : null;
	    try {
	      window.webkit.messageHandlers.image.postMessage({
	        src: bestSrc(img),
	        caption: cap ? (cap.textContent || '').trim() : ''
	      });
	    } catch (err) {}
	  }, true);
	})();
	"""
}
