/* ===========================================================
   Dear Her — article renderer
   ------------------------------------------------------------
   Reads window.ARTICLE_DATA and renders:
     - the hero metadata line (category · published date · read time)
     - bodyBlocks (an array of typed content blocks)
     - the signoff component
     - the post-article nav (prev/next/related, or a fallback link)

   Published date and reading time are both DERIVED, never typed
   by hand:
     - publishedAt is an ISO timestamp; the date shown is computed
       from it, not stored separately, so it can never drift from
       the real publish moment.
     - readTime is computed from the actual word count of the
       readable bodyBlocks (paragraph / emphasized / pullQuote /
       largeStatement) — nav, footer, captions, alt text and
       decorative labels are never counted.

   A new article = a new ARTICLE_DATA object. Nothing here should
   need to change per article.
=========================================================== */
(function () {
  "use strict";

  var data = window.ARTICLE_DATA;
  if (!data) return;

  var MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  var WORDS_PER_MINUTE = 200;
  var READABLE_BLOCK_TYPES = {
    paragraph: true,
    emphasizedParagraph: true,
    pullQuote: true,
    largeStatement: true
  };

  function formatPublishedDate(isoString) {
    // Parsed from the date parts directly (not `new Date(iso)`) so the
    // displayed date can't shift a day from local/UTC timezone offsets.
    var datePart = String(isoString).split("T")[0];
    var parts = datePart.split("-");
    var year = parts[0];
    var month = MONTHS[parseInt(parts[1], 10) - 1];
    var day = parseInt(parts[2], 10);
    return day + " " + month + " " + year;
  }

  function countWords(text) {
    var trimmed = String(text).replace(/\*\*/g, "").trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  function calculateReadTime(blocks) {
    var words = (blocks || []).reduce(function (total, block) {
      if (!READABLE_BLOCK_TYPES[block.type] || !block.text) return total;
      return total + countWords(block.text);
    }, 0);
    var minutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
    return minutes + " min read";
  }

  function formatInline(text) {
    var span = document.createElement("span");
    var parts = String(text).split(/\*\*(.+?)\*\*/g);
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var strong = document.createElement("strong");
        strong.textContent = part;
        span.appendChild(strong);
      } else if (part) {
        var lines = part.split("\n");
        lines.forEach(function (line, j) {
          if (j > 0) span.appendChild(document.createElement("br"));
          if (line) span.appendChild(document.createTextNode(line));
        });
      }
    });
    return span;
  }

  function positionClass(block) {
    return block.position === "left" ? " is-left" : block.position === "right" ? " is-right" : "";
  }

  function sizeClass(block) {
    return block.size === "small" ? " is-small" : "";
  }

  var renderers = {
    paragraph: function (block) {
      var p = document.createElement("p");
      p.className = "article-block article-block--paragraph";
      p.appendChild(formatInline(block.text));
      return p;
    },
    emphasizedParagraph: function (block) {
      var p = document.createElement("p");
      p.className = "article-block article-block--emphasized";
      p.appendChild(formatInline(block.text));
      return p;
    },
    pullQuote: function (block) {
      var p = document.createElement("p");
      p.className = "article-block article-block--pull-quote";
      p.textContent = block.text;
      return p;
    },
    largeStatement: function (block) {
      var p = document.createElement("p");
      p.className = "article-block article-block--statement js-reveal";
      p.appendChild(document.createTextNode(block.text));
      var underline = document.createElement("span");
      underline.className = "article-block__underline";
      p.appendChild(underline);
      return p;
    },
    handwrittenAnnotation: function (block) {
      var p = document.createElement("p");
      p.className = "article-block article-block--handwritten";
      p.textContent = block.text;
      return p;
    },
    editorialSpacer: function () {
      var div = document.createElement("div");
      div.className = "article-block article-block--spacer";
      return div;
    },
    image: function (block) {
      return renderers.imageWithCaption(block);
    },
    imageWithCaption: function (block) {
      var wrap = document.createElement("div");
      wrap.className = "article-block article-block--image js-reveal js-reveal--scale" + positionClass(block) + sizeClass(block);
      var figure = document.createElement("figure");
      var img = document.createElement("img");
      img.src = block.src;
      img.alt = block.alt || "";
      figure.appendChild(img);
      if (block.caption) {
        var cap = document.createElement("figcaption");
        cap.textContent = block.caption;
        figure.appendChild(cap);
      }
      wrap.appendChild(figure);
      return wrap;
    },
    scrapNote: function (block) {
      var wrap = document.createElement("div");
      wrap.className = "article-block article-block--scrap js-reveal js-reveal--scale" + positionClass(block);
      var img = document.createElement("img");
      img.src = block.src;
      img.alt = block.alt || "";
      wrap.appendChild(img);
      return wrap;
    }
  };

  // ---- Hero metadata (category · published date · read time) ----
  var metaMount = document.getElementById("article-meta");
  if (metaMount) {
    var readTime = calculateReadTime(data.bodyBlocks);
    [data.category, formatPublishedDate(data.publishedAt), readTime].forEach(function (text) {
      var span = document.createElement("span");
      span.textContent = text;
      metaMount.appendChild(span);
    });
  }

  // ---- Body blocks ----
  var mount = document.getElementById("article-body");
  if (mount && Array.isArray(data.bodyBlocks)) {
    data.bodyBlocks.forEach(function (block) {
      var render = renderers[block.type];
      if (!render) return;
      mount.appendChild(render(block));
    });
  }

  // ---- Signoff: "From," + "the girl who {ending}" ----
  var signoffMount = document.getElementById("article-signoff");
  if (signoffMount && data.signoff) {
    var from = document.createElement("p");
    from.className = "article-signoff__from";
    from.textContent = "From,";

    var ending = document.createElement("p");
    ending.className = "article-signoff__ending";
    ending.textContent = "the girl who " + data.signoff;

    signoffMount.appendChild(from);
    signoffMount.appendChild(ending);
  }

  // ---- Post-article nav: prev/next/related, or a quiet fallback ----
  var navMount = document.getElementById("article-nav");
  if (navMount) {
    var hasPrev = !!data.previousArticle;
    var hasNext = !!data.nextArticle;

    if (data.category) {
      var cat = document.createElement("p");
      cat.className = "article-nav__category";
      cat.textContent = data.category;
      navMount.appendChild(cat);
    }

    if (hasPrev || hasNext) {
      var links = document.createElement("div");
      links.className = "article-nav__links";

      if (hasPrev) {
        var prev = document.createElement("a");
        prev.className = "article-nav__link article-nav__link--prev";
        prev.href = data.previousArticle.url;
        prev.innerHTML = '<span class="article-nav__link-label">Previous letter</span>' + data.previousArticle.title;
        links.appendChild(prev);
      }

      if (hasNext) {
        var next = document.createElement("a");
        next.className = "article-nav__link article-nav__link--next";
        next.href = data.nextArticle.url;
        next.innerHTML = '<span class="article-nav__link-label">Next letter</span>' + data.nextArticle.title;
        links.appendChild(next);
      }

      navMount.appendChild(links);
    } else {
      var fallback = document.createElement("a");
      fallback.className = "article-nav__fallback";
      fallback.href = "dear-her.html";
      fallback.textContent = "More from Dear Her";
      navMount.appendChild(fallback);
    }
  }
})();
