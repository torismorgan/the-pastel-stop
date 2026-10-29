/* Dear Her: write an article's content into its HTML so search engines (and anything that
 * doesn't run JavaScript) can read it.
 *
 *   node tools/prerender-article.mjs we-are-all-gonna-be-okay.html
 *
 * The page's window.ARTICLE_DATA stays the single source of truth. This fills in the four
 * <!--prerender:...--> slots (meta line, body, signoff, nav) and the Article JSON-LD, using
 * the same markup article.js would have built. article.js now skips its own rendering when
 * the body is already filled in, so run this again after editing an article.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import vm from "node:vm";

const file = process.argv[2];
if (!file) { console.error("usage: node tools/prerender-article.mjs <article>.html"); process.exit(1); }
let html = readFileSync(file, "utf8");

const script = html.match(/<script>\s*(window\.ARTICLE_DATA[\s\S]*?)<\/script>/);
if (!script) { console.error("no window.ARTICLE_DATA found"); process.exit(1); }
const ctx = { window: {} };
vm.runInNewContext(script[1], ctx);
const data = ctx.window.ARTICLE_DATA;

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const READABLE = { paragraph: 1, emphasizedParagraph: 1, pullQuote: 1, largeStatement: 1 };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
const words = (t) => { const x = String(t).replace(/\*\*/g, "").trim(); return x ? x.split(/\s+/).length : 0; };
const posClass = (b) => (b.position === "left" ? " is-left" : b.position === "right" ? " is-right" : "");

function inline(text) {
  return String(text).split(/\*\*(.+?)\*\*/g).map((part, i) => {
    if (i % 2 === 1) return `<strong>${esc(part)}</strong>`;
    return part.split("\n").map((line, j) => (j > 0 ? "<br>" : "") + (line ? esc(line) : "")).join("");
  }).join("");
}

const render = {
  // article.js wraps inline text in a <span>; kept so the markup is identical
  paragraph: (b) => `<p class="article-block article-block--paragraph"><span>${inline(b.text)}</span></p>`,
  emphasizedParagraph: (b) => `<p class="article-block article-block--emphasized"><span>${inline(b.text)}</span></p>`,
  pullQuote: (b) => `<p class="article-block article-block--pull-quote">${esc(b.text)}</p>`,
  largeStatement: (b) => `<p class="article-block article-block--statement js-reveal">${esc(b.text)}<span class="article-block__underline"></span></p>`,
  handwrittenAnnotation: (b) => `<p class="article-block article-block--handwritten">${esc(b.text)}</p>`,
  editorialSpacer: () => `<div class="article-block article-block--spacer"></div>`,
  imageWithCaption: (b) =>
    `<div class="article-block article-block--image js-reveal js-reveal--scale${posClass(b)}${b.size === "small" ? " is-small" : ""}"><figure>` +
    `<img src="${escAttr(b.src)}" alt="${escAttr(b.alt || "")}" loading="lazy" decoding="async">` +
    (b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : "") + `</figure></div>`,
  scrapNote: (b) =>
    `<div class="article-block article-block--scrap js-reveal js-reveal--scale${posClass(b)}"><img src="${escAttr(b.src)}" alt="${escAttr(b.alt || "")}" loading="lazy" decoding="async"></div>`
};
render.image = render.imageWithCaption;

const blocks = data.bodyBlocks || [];
const totalWords = blocks.reduce((n, b) => n + (READABLE[b.type] && b.text ? words(b.text) : 0), 0);
const readTime = Math.max(1, Math.ceil(totalWords / 200)) + " min read";
const [y, m, d] = String(data.publishedAt).split("T")[0].split("-");
const dateText = `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;

const meta = [data.category, dateText, readTime].map((t, i) => `<span>${i === 1 ? `<time datetime="${y}-${m}-${d}">${esc(t)}</time>` : esc(t)}</span>`).join("");
const body = blocks.map((b) => (render[b.type] ? render[b.type](b) : "")).join("");
const signoff = data.signoff ? `<p class="article-signoff__from">From,</p><p class="article-signoff__ending">the girl who ${esc(data.signoff)}</p>` : "";

let nav = data.category ? `<p class="article-nav__category">${esc(data.category)}</p>` : "";
const link = (a, cls, label) => `<a class="article-nav__link article-nav__link--${cls}" href="${escAttr(a.url)}"><span class="article-nav__link-label">${label}</span>${esc(a.title)}</a>`;
if (data.previousArticle || data.nextArticle) {
  nav += `<div class="article-nav__links">${data.previousArticle ? link(data.previousArticle, "prev", "Previous letter") : ""}${data.nextArticle ? link(data.nextArticle, "next", "Next letter") : ""}</div>`;
} else {
  nav += `<a class="article-nav__fallback" href="/dear-her">More from Dear Her</a>`;
}

const slug = basename(file, ".html");
const url = `https://thepastelstop.com/${slug}`;
const jsonld = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: data.seoHeadline || data.title,
  description: data.subtitle,
  datePublished: String(data.publishedAt).split("T")[0],
  dateModified: new Date().toISOString().split("T")[0],
  articleSection: data.category,
  wordCount: totalWords,
  inLanguage: "en",
  image: [`https://thepastelstop.com/${data.heroImage}`],
  author: { "@type": "Organization", name: "The Pastel Stop" },
  publisher: { "@type": "Organization", name: "The Pastel Stop", logo: { "@type": "ImageObject", url: "https://thepastelstop.com/apple-touch-icon.png" } },
  mainEntityOfPage: url,
  isPartOf: { "@type": "Blog", name: "Dear Her", url: "https://thepastelstop.com/dear-her" }
};

function fill(name, content) {
  const re = new RegExp(`(<!--prerender:${name}-->)[\\s\\S]*?(<!--/prerender:${name}-->)`);
  if (!re.test(html)) { console.error(`missing <!--prerender:${name}--> slot`); process.exit(1); }
  html = html.replace(re, (_, a, b) => a + content + b);
}
fill("meta", meta);
fill("body", body);
fill("signoff", signoff);
fill("nav", nav);
fill("jsonld", `\n<script type="application/ld+json">\n${JSON.stringify(jsonld)}\n</script>\n`);

writeFileSync(file, html);
console.log(`${file}: ${blocks.length} blocks, ${totalWords} words, ${readTime}`);
