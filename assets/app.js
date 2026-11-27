const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

const DISCIPLINE_EN = {
  "文学": "Literature & Poetics",
  "哲学": "Philosophy & Metaphysics",
  "社会理论": "Social Theory & Intellectual History",
  "其他": "History, Art Theory & Science Studies",
};

const ERAS = [
  { id: "antiquity", title: "古典时代", span: "Antiquity · Before 500 CE", min: -2000, max: 500 },
  { id: "renaissance", title: "中世纪与文艺复兴", span: "Medieval & Renaissance · 500–1600", min: 501, max: 1600 },
  { id: "enlightenment", title: "十七至十八世纪", span: "Early Modern & Enlightenment · 1601–1799", min: 1601, max: 1799 },
  { id: "nineteenth", title: "十九世纪", span: "The Long Nineteenth Century · 1800–1899", min: 1800, max: 1899 },
  { id: "early-20th", title: "二十世纪前半叶", span: "Early Twentieth Century · 1900–1945", min: 1900, max: 1945 },
  { id: "contemporary", title: "战后与当代", span: "Postwar & Contemporary · 1946–Present", min: 1946, max: 2100 },
  { id: "undated", title: "编者及未标生年", span: "Editors & Undated", min: 2101, max: 99999 },
];

const state = {
  catalog: null,
  authorIndex: new Map(),
  reviewIndex: new Map(), // reviewId -> { authorKey, authorName, authorOriginal, authorLifeSpan, discipline, subcategory, work }
  query: "",
  starredOnly: false,
  reviewedOnly: false,
  crossOnly: false,
  disciplineFilter: "all",
  yearFilter: "all",
  view: "cards",
  activeSubId: "",
  collapsedSubs: new Set(),
};

const els = {
  mastheadStats: document.getElementById("masthead-stats"),
  tocTree: document.getElementById("toc-tree"),
  catalogRoot: document.getElementById("catalog-root"),
  searchInput: document.getElementById("search-input"),
  searchClear: document.getElementById("search-clear"),
  kbdHint: document.getElementById("kbd-hint"),
  filterStarred: document.getElementById("filter-starred"),
  filterReviewed: document.getElementById("filter-reviewed"),
  filterCross: document.getElementById("filter-cross"),
  discStrip: document.getElementById("disc-strip"),
  yearStrip: document.getElementById("year-strip"),
  resultSummary: document.getElementById("result-summary"),
  colophonMeta: document.getElementById("colophon-meta"),
  metaNotesList: document.getElementById("meta-notes-list"),
  reviewPopover: document.getElementById("review-popover"),
  dossierOverlay: document.getElementById("dossier-overlay"),
  authorDossier: document.getElementById("author-dossier"),
  dossierKicker: document.getElementById("dossier-kicker"),
  dossierBody: document.getElementById("dossier-body"),
  dossierClose: document.getElementById("dossier-close"),
  colophonBtn: document.getElementById("colophon-btn"),
  colophonModal: document.getElementById("colophon-modal"),
  modalClose: document.getElementById("modal-close"),
  themeToggle: document.getElementById("theme-toggle"),
  backToTop: document.getElementById("back-to-top"),
  spineNav: document.getElementById("spine-nav"),
  mobileNavBtn: document.getElementById("mobile-nav-btn"),
  mobileNavClose: document.getElementById("mobile-nav-close"),
  mobileBackdrop: document.getElementById("mobile-backdrop"),
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightText(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const escapedQ = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escapedQ})`, "gi");
  return safe.replace(re, '<mark class="hl">$1</mark>');
}

function isCJKOnly(str) {
  if (!str) return false;
  return /[\u4e00-\u9fff\u3040-\u30ff]/.test(str) && !/[A-Za-z]{4,}/.test(str);
}

function renderStars(rating) {
  if (!rating) return "";
  const n = Math.max(0, Math.min(5, Number(rating)));
  return "★".repeat(n) + "☆".repeat(5 - n);
}

function getCanonicalKey(author) {
  return (author.originalName || author.displayName || author.name).toLowerCase().replace(/\s+/g, " ").trim();
}

function buildIndices(catalog) {
  const authorMap = new Map();
  const reviewMap = new Map();
  let rCounter = 0;

  for (const d of catalog.disciplines) {
    for (const s of d.subcategories) {
      for (const a of s.authors) {
        const key = getCanonicalKey(a);
        if (!authorMap.has(key)) {
          authorMap.set(key, {
            key,
            name: a.displayName || a.name,
            fullName: a.name,
            originalName: a.originalName,
            lifeSpan: a.lifeSpan,
            birthYear: a.birthYear,
            appearances: [],
          });
        }

        for (const w of a.works) {
          if (w.reviews && w.reviews.length > 0) {
            const rid = `rev-${++rCounter}`;
            w._reviewId = rid;
            reviewMap.set(rid, {
              id: rid,
              authorKey: key,
              authorName: a.name,
              authorOriginal: a.originalName,
              authorLifeSpan: a.lifeSpan,
              disciplineId: d.id,
              discipline: d.title,
              subcategoryId: s.id,
              subcategory: s.title,
              authorId: a.id,
              work: w,
            });
          }
        }

        authorMap.get(key).appearances.push({
          disciplineId: d.id,
          discipline: d.title,
          subcategoryId: s.id,
          subcategory: s.title,
          authorId: a.id,
          works: a.works,
          notes: a.notes,
        });
      }
    }
  }
  state.authorIndex = authorMap;
  state.reviewIndex = reviewMap;
}

function workMatches(work, author, query) {
  if (state.starredOnly && !work.starred) return false;
  if (state.reviewedOnly && !(work.reviews && work.reviews.length > 0)) return false;

  if (state.yearFilter === "unmarked") {
    if (work.year) return false;
  } else if (state.yearFilter !== "all") {
    if (work.year !== state.yearFilter) return false;
  }

  if (query) {
    const q = query.toLowerCase();
    const reviewText = (work.reviews || []).map((r) => `${r.comment} ${r.doubanTitle} ${r.translator}`).join(" ");
    const haystack = [
      author.name,
      author.originalName,
      author.lifeSpan,
      work.title,
      work.originalTitle,
      work.year,
      reviewText,
      ...(author.notes || []).map((n) => `${n.work} ${n.content}`),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }
  return true;
}

function getFilteredDisciplines(ignoreDisciplineFilter = false) {
  const q = state.query.trim();
  const result = [];

  for (const d of state.catalog.disciplines) {
    if (!ignoreDisciplineFilter && state.disciplineFilter !== "all" && d.id !== state.disciplineFilter) {
      continue;
    }

    const filteredSubs = [];
    let dWorks = 0;

    for (const s of d.subcategories) {
      const filteredAuthors = [];
      let sWorks = 0;

      for (const a of s.authors) {
        const key = getCanonicalKey(a);
        const agg = state.authorIndex.get(key);
        const isCross = agg && agg.appearances.length > 1;
        if (state.crossOnly && !isCross) continue;

        const matchedWorks = a.works.filter((w) => workMatches(w, a, q));
        if (matchedWorks.length > 0) {
          filteredAuthors.push({
            ...a,
            canonicalKey: key,
            crossCount: agg ? agg.appearances.length : 1,
            works: matchedWorks,
          });
          sWorks += matchedWorks.length;
        }
      }

      const showPlaceholder =
        s.placeholder &&
        !q &&
        !state.starredOnly &&
        !state.reviewedOnly &&
        !state.crossOnly &&
        state.yearFilter === "all";

      if (filteredAuthors.length > 0 || showPlaceholder) {
        filteredSubs.push({
          ...s,
          authors: filteredAuthors,
          matchedWorks: sWorks,
        });
        dWorks += sWorks;
      }
    }

    if (filteredSubs.length > 0) {
      result.push({
        ...d,
        subcategories: filteredSubs,
        matchedWorks: dWorks,
      });
    }
  }
  return result;
}

function renderMastheadStats() {
  const s = state.catalog.stats;
  els.mastheadStats.innerHTML = `
    <div class="stat-unit">
      <span class="stat-num">${s.works}</span>
      <span class="stat-label">著作</span>
    </div>
    <div class="stat-unit">
      <span class="stat-num">${s.uniqueAuthors}</span>
      <span class="stat-label">人物</span>
    </div>
    <div class="stat-unit is-accent">
      <span class="stat-num">${s.starred}</span>
      <span class="stat-label">重点</span>
    </div>
    <div class="stat-unit">
      <span class="stat-num">${s.reviewedWorks || 0}</span>
      <span class="stat-label">札记</span>
    </div>
    <div class="stat-unit desktop-only">
      <span class="stat-num">${s.crossDisciplinaryCount}</span>
      <span class="stat-label">跨学科</span>
    </div>
  `;
}

function renderDiscStrip() {
  const chips = [
    { id: "all", label: "全部学科" },
    ...state.catalog.disciplines.map((d, idx) => ({
      id: d.id,
      label: `${ROMAN[idx] || idx + 1}. ${d.title}`,
    })),
  ];

  els.discStrip.innerHTML = chips
    .map(
      (c) => `
      <button type="button" class="disc-chip ${state.disciplineFilter === c.id ? "is-active" : ""}" data-disc="${c.id}">
        ${escapeHtml(c.label)}
      </button>
    `
    )
    .join("");

  els.discStrip.querySelectorAll(".disc-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.disciplineFilter = btn.dataset.disc;
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderYearStrip() {
  const years = state.catalog.stats.years;
  const chips = [
    { id: "all", label: "全部年份" },
    ...years.map((y) => ({ id: y, label: y })),
    { id: "unmarked", label: "未标" },
  ];

  els.yearStrip.innerHTML = chips
    .map(
      (c) => `
      <button type="button" class="year-chip ${state.yearFilter === c.id ? "is-active" : ""}" data-year="${c.id}">
        ${c.label}
      </button>
    `
    )
    .join("");

  els.yearStrip.querySelectorAll(".year-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.yearFilter = btn.dataset.year;
      renderAll();
    });
  });
}

function renderTOC(allMatchedDisciplines) {
  const matchedMap = new Map();
  for (const d of allMatchedDisciplines) {
    matchedMap.set(d.id, d.matchedWorks);
    for (const s of d.subcategories) {
      matchedMap.set(s.id, s.matchedWorks);
    }
  }

  els.tocTree.innerHTML = state.catalog.disciplines
    .map((d, idx) => {
      const dCount = matchedMap.get(d.id) ?? 0;
      const roman = ROMAN[idx] || idx + 1;
      const isSelected = state.disciplineFilter === d.id;
      return `
        <div class="toc-group">
          <button type="button" class="toc-discipline ${isSelected ? "is-selected" : ""}" data-disc-pick="${d.id}">
            <span><span class="toc-roman">${roman}.</span>${escapeHtml(d.title)}</span>
            <span class="toc-count">${dCount}</span>
          </button>
          <ul class="toc-subs">
            ${d.subcategories
              .map((s) => {
                const sCount = matchedMap.get(s.id) ?? 0;
                const isActive = state.activeSubId === s.id;
                const dimmed = sCount === 0 && !s.placeholder;
                return `
                  <li>
                    <button
                      type="button"
                      class="toc-sub-btn ${isActive ? "is-active" : ""} ${dimmed ? "is-dimmed" : ""}"
                      data-scroll-target="sub-${s.id}"
                      data-parent-disc="${d.id}"
                      data-sub-id="${s.id}"
                    >
                      <span>${escapeHtml(s.title)}</span>
                      <span class="toc-count">${sCount}</span>
                    </button>
                  </li>
                `;
              })
              .join("")}
          </ul>
        </div>
      `;
    })
    .join("");

  els.tocTree.querySelectorAll("[data-disc-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.discPick;
      state.disciplineFilter = state.disciplineFilter === id ? "all" : id;
      if (state.view === "timeline") setView("cards");
      else renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
      closeMobileNav();
    });
  });

  els.tocTree.querySelectorAll("[data-scroll-target]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const parentDisc = btn.dataset.parentDisc;
      const subId = btn.dataset.subId;
      state.collapsedSubs.delete(subId);

      let needRender = false;
      if (state.disciplineFilter !== "all" && state.disciplineFilter !== parentDisc) {
        state.disciplineFilter = parentDisc;
        needRender = true;
      }
      if (state.view === "timeline") {
        setView("cards");
      } else if (needRender) {
        renderAll();
      } else {
        const subEl = document.getElementById(`sub-${subId}`);
        if (subEl) subEl.classList.remove("is-collapsed");
      }

      const target = document.getElementById(btn.dataset.scrollTarget);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      closeMobileNav();
    });
  });
}

function renderWorkRow(work, query) {
  const origClass = isCJKOnly(work.originalTitle) ? "work-orig is-cjk" : "work-orig";
  const showOrig = work.originalTitle && work.originalTitle.trim() !== work.title.replace(/^《|》$/g, "").trim();
  const hasOpenPunct = /^[《〈「『“（(]/.test((work.title || "").trim());
  const punctClass = hasOpenPunct ? "has-open-punct" : "";
  const hasReview = Boolean(work._reviewId && work.reviews && work.reviews.length > 0);
  const reviewAttr = hasReview ? `data-review-id="${work._reviewId}"` : "";

  return `
    <div class="work-row ${work.starred ? "is-starred" : ""} ${hasReview ? "has-review" : ""}">
      ${work.starred ? '<span class="star-mark" title="重点优先级">✦</span>' : ""}
      <div class="work-titles ${punctClass}">
        <span class="work-cn ${punctClass}" ${reviewAttr} ${hasReview ? 'title="点击展读个人书评"' : ""}>${highlightText(work.title, query)}</span>${showOrig ? `<span class="${origClass}">${highlightText(work.originalTitle, query)}</span>` : ""}
      </div>
      <div class="work-meta">
        ${
          hasReview
            ? `<button type="button" class="review-seal-btn" data-review-id="${work._reviewId}" data-hover-review="${work._reviewId}" aria-label="查看《${escapeHtml(work.title)}》阅读札记">评</button>`
            : ""
        }
        ${
          work.year
            ? `<button type="button" class="work-year-btn" data-pick-year="${work.year}" title="按 ${work.year} 年筛选">${work.year}</button>`
            : `<span class="work-year-empty">—</span>`
        }
      </div>
    </div>
  `;
}

function renderAuthorNotes(notes, query) {
  if (!notes || notes.length === 0) return "";
  return `
    <div class="author-notes">
      ${notes
        .map(
          (n) => `
        <details class="note-details">
          <summary>${escapeHtml(n.work)} · 备注</summary>
          <div class="note-body">${highlightText(n.content, query)}</div>
        </details>
      `
        )
        .join("")}
    </div>
  `;
}

function getMasonryColumnCount() {
  const width = els.catalogRoot.clientWidth || window.innerWidth;
  const isAiry = document.documentElement.getAttribute("data-density") === "airy";
  if (isAiry) {
    if (width >= 1060) return 3;
    if (width >= 660) return 2;
    return 1;
  }
  if (width >= 1080) return 4;
  if (width >= 740) return 3;
  if (width >= 480) return 2;
  return 1;
}

function estimateCardWeight(author) {
  let weight = 46;
  if (author.originalName) weight += 18;
  for (const w of author.works) {
    const cnLines = Math.max(1, Math.ceil((w.title || "").length / 15));
    const origLines = w.originalTitle ? Math.max(1, Math.ceil(w.originalTitle.length / 28)) : 0;
    weight += cnLines * 20 + origLines * 16 + 8;
  }
  if (author.notes && author.notes.length > 0) {
    weight += author.notes.length * 26;
  }
  return weight;
}

function renderAuthorCardHtml(a, q) {
  return `
    <article class="author-card" id="author-${a.id}">
      <div class="card-head">
        <div class="author-name-line">
          <button type="button" class="author-trigger" data-author-key="${escapeHtml(a.canonicalKey)}">
            ${highlightText(a.name, q)}
          </button>
          ${a.lifeSpan ? `<span class="author-lifespan">${highlightText(a.lifeSpan, q)}</span>` : ""}
          ${
            a.crossCount > 1
              ? `<button type="button" class="cross-badge" data-author-key="${escapeHtml(a.canonicalKey)}" title="跨 ${a.crossCount} 个学科出现">×${a.crossCount}</button>`
              : ""
          }
        </div>
        ${a.originalName ? `<div class="author-latin">${highlightText(a.originalName, q)}</div>` : ""}
      </div>
      <div class="card-works">
        ${a.works.map((w) => renderWorkRow(w, q)).join("")}
      </div>
      ${renderAuthorNotes(a.notes, q)}
    </article>
  `;
}

function renderMasonryHtml(authors, q) {
  const colCount = getMasonryColumnCount();
  const cols = Array.from({ length: colCount }, () => ({ weight: 0, items: [] }));

  for (const a of authors) {
    let minIdx = 0;
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].weight < cols[minIdx].weight) {
        minIdx = i;
      }
    }
    cols[minIdx].items.push(renderAuthorCardHtml(a, q));
    cols[minIdx].weight += estimateCardWeight(a);
  }

  return `
    <div class="cards-masonry" data-masonry-cols="${colCount}">
      ${cols.map((c) => `<div class="masonry-col">${c.items.join("")}</div>`).join("")}
    </div>
  `;
}

function renderFolioOrCards(filteredDisciplines) {
  const q = state.query.trim();

  if (filteredDisciplines.length === 0) {
    els.catalogRoot.innerHTML = renderEmptyState();
    bindResetBtn();
    return;
  }

  els.catalogRoot.innerHTML = filteredDisciplines
    .map((d) => {
      const roman = ROMAN[d.index - 1] || d.index;
      const enTitle = DISCIPLINE_EN[d.title] || "";
      return `
        <section class="discipline-section" id="disc-${d.id}">
          <div class="discipline-banner">
            <div class="discipline-heading-wrap">
              <span class="discipline-roman-num">${roman}</span>
              <h2 class="discipline-title">${escapeHtml(d.title)}</h2>
              ${enTitle ? `<span class="discipline-en">${enTitle}</span>` : ""}
            </div>
            <div class="discipline-meta">${d.matchedWorks} 部著作</div>
          </div>

          ${d.subcategories
            .map((s) => {
              const isCollapsed = state.collapsedSubs.has(s.id);
              let bodyHtml = "";
              if (s.authors.length === 0 && s.placeholder) {
                bodyHtml = `<div class="placeholder-note">本子类目前留白，待日后增补。</div>`;
              } else if (state.view === "cards") {
                bodyHtml = renderMasonryHtml(s.authors, q);
              } else {
                bodyHtml = s.authors
                  .map(
                    (a) => `
                  <article class="author-band" id="author-${a.id}">
                    <div class="author-col">
                      <div class="author-name-line">
                        <button type="button" class="author-trigger" data-author-key="${escapeHtml(a.canonicalKey)}">
                          ${highlightText(a.name, q)}
                        </button>
                        ${a.lifeSpan ? `<span class="author-lifespan">${highlightText(a.lifeSpan, q)}</span>` : ""}
                        ${
                          a.crossCount > 1
                            ? `<button type="button" class="cross-badge" data-author-key="${escapeHtml(a.canonicalKey)}" title="跨 ${a.crossCount} 个学科出现">×${a.crossCount}</button>`
                            : ""
                        }
                      </div>
                      ${a.originalName ? `<div class="author-latin">${highlightText(a.originalName, q)}</div>` : ""}
                    </div>
                    <div class="works-col">
                      ${a.works.map((w) => renderWorkRow(w, q)).join("")}
                      ${renderAuthorNotes(a.notes, q)}
                    </div>
                  </article>
                `
                  )
                  .join("");
              }

              return `
                <div class="subcategory-block ${isCollapsed ? "is-collapsed" : ""}" id="sub-${s.id}" data-sub-observer="${s.id}">
                  <button type="button" class="subcategory-header" data-toggle-sub="${s.id}" aria-expanded="${!isCollapsed}">
                    <h3 class="subcategory-title">${escapeHtml(s.title)}</h3>
                    <span class="subcategory-right">
                      <span class="subcategory-count">${s.authors.length} 位人物 · ${s.matchedWorks} 部</span>
                      <span class="collapse-chevron" aria-hidden="true">▾</span>
                    </span>
                  </button>
                  <div class="subcategory-body">${bodyHtml}</div>
                </div>
              `;
            })
            .join("")}
        </section>
      `;
    })
    .join("");

  bindDynamicInteractions();
  observeSubcategories();
}

function renderTimeline() {
  const q = state.query.trim();
  const entries = [];

  for (const agg of state.authorIndex.values()) {
    const isCross = agg.appearances.length > 1;
    if (state.crossOnly && !isCross) continue;

    const matchedWorks = [];
    const seen = new Set();
    const disciplineLabels = new Set();

    for (const app of agg.appearances) {
      if (state.disciplineFilter !== "all" && app.disciplineId !== state.disciplineFilter) {
        continue;
      }
      const tempAuthor = {
        name: agg.fullName,
        originalName: agg.originalName,
        lifeSpan: agg.lifeSpan,
        notes: app.notes,
      };
      for (const w of app.works) {
        if (workMatches(w, tempAuthor, q)) {
          disciplineLabels.add(`${app.discipline} · ${app.subcategory}`);
          const wKey = `${w.title}|${w.year}`;
          if (!seen.has(wKey)) {
            seen.add(wKey);
            matchedWorks.push(w);
          }
        }
      }
    }

    if (matchedWorks.length > 0) {
      entries.push({
        ...agg,
        matchedWorks,
        disciplineLabels: [...disciplineLabels],
      });
    }
  }

  entries.sort((a, b) => a.birthYear - b.birthYear);

  if (entries.length === 0) {
    els.catalogRoot.innerHTML = renderEmptyState();
    bindResetBtn();
    return;
  }

  const html = ERAS.map((era) => {
    const inEra = entries.filter((e) => e.birthYear >= era.min && e.birthYear <= era.max);
    if (inEra.length === 0) return "";
    return `
      <section class="era-section">
        <div class="era-banner">
          <div class="era-title-wrap">
            <h2 class="era-title">${era.title}</h2>
            <span class="era-span">${era.span}</span>
          </div>
          <span class="discipline-meta">${inEra.length} 位人物</span>
        </div>
        <div class="timeline-list">
          ${inEra
            .map(
              (a) => `
            <article class="timeline-item">
              <div class="author-col">
                <div class="author-name-line">
                  <button type="button" class="author-trigger" data-author-key="${escapeHtml(a.key)}">
                    ${highlightText(a.fullName, q)}
                  </button>
                  ${a.lifeSpan ? `<span class="author-lifespan">${highlightText(a.lifeSpan, q)}</span>` : ""}
                </div>
                ${a.originalName ? `<div class="author-latin">${highlightText(a.originalName, q)}</div>` : ""}
                <div class="timeline-disciplines">
                  ${a.disciplineLabels.map((lbl) => `<span class="disc-tag">${escapeHtml(lbl)}</span>`).join("")}
                </div>
              </div>
              <div class="works-col">
                ${a.matchedWorks.map((w) => renderWorkRow(w, q)).join("")}
              </div>
            </article>
          `
            )
            .join("")}
        </div>
      </section>
    `;
  }).join("");

  els.catalogRoot.innerHTML = html;
  bindDynamicInteractions();
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-title">当前筛选条件下未找到匹配书目</div>
      <div>可以尝试放宽学科、年份或「仅看有评」筛选，或更换检索关键词。</div>
      <button type="button" id="empty-reset-btn" class="empty-reset-btn">重置全部筛选</button>
    </div>
  `;
}

function bindResetBtn() {
  const btn = document.getElementById("empty-reset-btn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    state.query = "";
    state.starredOnly = false;
    state.reviewedOnly = false;
    state.crossOnly = false;
    state.disciplineFilter = "all";
    state.yearFilter = "all";
    els.searchInput.value = "";
    syncFilterButtons();
    renderAll();
  });
}

/* ==========================================================================
   悬停微笺预览浮窗逻辑
   ========================================================================== */
function showReviewPopover(triggerEl, reviewId) {
  const item = state.reviewIndex.get(reviewId);
  if (!item || !item.work.reviews || item.work.reviews.length === 0) return;

  const first = item.work.reviews[0];
  const count = item.work.reviews.length;
  const starsHtml = first.rating ? `<span class="popover-stars">${renderStars(first.rating)}</span>` : "";

  els.reviewPopover.innerHTML = `
    <div class="popover-head">
      <span>阅读札记 · ${escapeHtml(first.readYear || "")}</span>
      ${starsHtml}
    </div>
    <div class="popover-excerpt">${escapeHtml(first.comment)}</div>
    <div class="popover-foot">
      <span>${count > 1 ? `共 ${count} 篇豆瓣札记` : escapeHtml(first.publisher || "豆瓣读过")}</span>
      <span>点击展读 ↗</span>
    </div>
  `;

  els.reviewPopover.hidden = false;
  const rect = triggerEl.getBoundingClientRect();
  const popRect = els.reviewPopover.getBoundingClientRect();

  let left = rect.right - popRect.width;
  if (left < 12) left = 12;
  if (left + popRect.width > window.innerWidth - 12) {
    left = window.innerWidth - popRect.width - 12;
  }

  let top = rect.top - popRect.height - 8;
  if (top < 12) {
    top = rect.bottom + 8;
  }

  els.reviewPopover.style.left = `${Math.round(left)}px`;
  els.reviewPopover.style.top = `${Math.round(top)}px`;
  requestAnimationFrame(() => els.reviewPopover.classList.add("is-visible"));
}

function hideReviewPopover() {
  els.reviewPopover.classList.remove("is-visible");
  els.reviewPopover.hidden = true;
}

function bindDynamicInteractions() {
  els.catalogRoot.querySelectorAll("[data-author-key]").forEach((btn) => {
    btn.addEventListener("click", () => openAuthorDossier(btn.dataset.authorKey));
  });

  els.catalogRoot.querySelectorAll("[data-review-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      hideReviewPopover();
      openReviewDrawer(el.dataset.reviewId);
    });
  });

  els.catalogRoot.querySelectorAll("[data-hover-review]").forEach((btn) => {
    btn.addEventListener("mouseenter", () => showReviewPopover(btn, btn.dataset.hoverReview));
    btn.addEventListener("mouseleave", hideReviewPopover);
    btn.addEventListener("blur", hideReviewPopover);
  });

  els.catalogRoot.querySelectorAll("[data-pick-year]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const y = btn.dataset.pickYear;
      state.yearFilter = state.yearFilter === y ? "all" : y;
      renderAll();
    });
  });

  els.catalogRoot.querySelectorAll("[data-toggle-sub]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const subId = btn.dataset.toggleSub;
      const block = document.getElementById(`sub-${subId}`);
      if (!block) return;
      if (state.collapsedSubs.has(subId)) {
        state.collapsedSubs.delete(subId);
        block.classList.remove("is-collapsed");
        btn.setAttribute("aria-expanded", "true");
      } else {
        state.collapsedSubs.add(subId);
        block.classList.add("is-collapsed");
        btn.setAttribute("aria-expanded", "false");
      }
    });
  });
}

/* ==========================================================================
   右侧抽屉：模式一（单书阅读札记） & 模式二（人物全谱系档案）
   ========================================================================== */
function openReviewDrawer(reviewId) {
  const item = state.reviewIndex.get(reviewId);
  if (!item) return;

  const w = item.work;
  const hasOpenPunct = /^[《〈「『“（(]/.test((w.title || "").trim());
  const agg = state.authorIndex.get(item.authorKey);
  const otherReviewed = [];
  if (agg) {
    for (const app of agg.appearances) {
      for (const aw of app.works) {
        if (aw._reviewId && aw._reviewId !== reviewId) {
          otherReviewed.push({ id: aw._reviewId, title: aw.title });
        }
      }
    }
  }

  els.dossierKicker.textContent = "READING MARGINALIA · 阅读札记";
  els.dossierBody.innerHTML = `
    <h2 class="dossier-name ${hasOpenPunct ? "has-open-punct" : ""}">${escapeHtml(w.title)}</h2>
    ${w.originalTitle ? `<p class="dossier-latin">${escapeHtml(w.originalTitle)}</p>` : ""}
    <div class="dossier-lifespan">
      <button type="button" class="dossier-author-link" data-open-author="${escapeHtml(item.authorKey)}">
        ${escapeHtml(item.authorName)}${item.authorLifeSpan ? `（${escapeHtml(item.authorLifeSpan)}）` : ""}
      </button>
      <span>${escapeHtml(item.discipline)} · ${escapeHtml(item.subcategory)}</span>
      ${w.year ? `<span>谱系年份 ${escapeHtml(w.year)}</span>` : ""}
    </div>

    ${(w.reviews || [])
      .map((r) => {
        const editionParts = [r.doubanTitle, r.translator ? `${r.translator} 译` : "", r.publisher, r.publishDate]
          .filter(Boolean)
          .join(" · ");
        return `
        <article class="review-entry-card">
          <div class="review-entry-meta">
            <span>豆瓣读过 · ${escapeHtml(r.readYear || "—")}</span>
            ${r.rating ? `<span class="review-entry-stars" title="豆瓣评分 ${r.rating} 星">${renderStars(r.rating)}</span>` : ""}
          </div>
          <div class="review-entry-body">${escapeHtml(r.comment)}</div>
          <div class="review-entry-edition">
            <span>${escapeHtml(editionParts)}</span>
            ${
              r.doubanUrl
                ? `<a class="douban-ext-link" href="${escapeHtml(r.doubanUrl)}" target="_blank" rel="noopener noreferrer">豆瓣词条 ↗</a>`
                : ""
            }
          </div>
        </article>
      `;
      })
      .join("")}

    ${
      otherReviewed.length > 0
        ? `
      <div class="dossier-section">
        <div class="dossier-section-head">
          <span class="dossier-path">同作者其他阅读札记</span>
        </div>
        <div class="filter-pills">
          ${otherReviewed
            .map(
              (o) => `<button type="button" class="pill-btn" data-switch-review="${o.id}">${escapeHtml(o.title)}</button>`
            )
            .join("")}
        </div>
      </div>
    `
        : ""
    }
  `;

  els.dossierBody.querySelectorAll("[data-open-author]").forEach((btn) => {
    btn.addEventListener("click", () => openAuthorDossier(btn.dataset.openAuthor));
  });
  els.dossierBody.querySelectorAll("[data-switch-review]").forEach((btn) => {
    btn.addEventListener("click", () => openReviewDrawer(btn.dataset.switchReview));
  });

  showDrawer();
}

function openAuthorDossier(canonicalKey) {
  const agg = state.authorIndex.get(canonicalKey);
  if (!agg) return;

  els.dossierKicker.textContent = "AUTHOR DOSSIER · 人物谱系笺";
  els.dossierBody.innerHTML = `
    <h2 class="dossier-name">${escapeHtml(agg.fullName)}</h2>
    ${agg.originalName ? `<p class="dossier-latin">${escapeHtml(agg.originalName)}</p>` : ""}
    ${agg.lifeSpan ? `<div class="dossier-lifespan">${escapeHtml(agg.lifeSpan)}</div>` : ""}

    ${agg.appearances
      .map(
        (app) => `
      <div class="dossier-section">
        <div class="dossier-section-head">
          <span class="dossier-path">${escapeHtml(app.discipline)} · ${escapeHtml(app.subcategory)}</span>
          <button type="button" class="dossier-jump" data-jump-author="author-${app.authorId}" data-jump-disc="${app.disciplineId}" data-jump-sub="${app.subcategoryId}">在目录中定位</button>
        </div>
        <div class="works-col">
          ${app.works.map((w) => renderWorkRow(w, "")).join("")}
          ${renderAuthorNotes(app.notes, "")}
        </div>
      </div>
    `
      )
      .join("")}
  `;

  els.dossierBody.querySelectorAll("[data-jump-author]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeDossier();
      const discId = btn.dataset.jumpDisc;
      const subId = btn.dataset.jumpSub;
      state.collapsedSubs.delete(subId);
      if (state.disciplineFilter !== "all" && state.disciplineFilter !== discId) {
        state.disciplineFilter = discId;
      }
      if (state.view === "timeline") setView("cards");
      else renderAll();
      const target = document.getElementById(btn.dataset.jumpAuthor);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  });

  els.dossierBody.querySelectorAll("[data-review-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openReviewDrawer(el.dataset.reviewId);
    });
  });

  els.dossierBody.querySelectorAll("[data-pick-year]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.yearFilter = btn.dataset.pickYear;
      closeDossier();
      renderAll();
    });
  });

  showDrawer();
}

function showDrawer() {
  els.dossierOverlay.hidden = false;
  els.authorDossier.classList.add("is-open");
  els.authorDossier.setAttribute("aria-hidden", "false");
}

function closeDossier() {
  els.dossierOverlay.hidden = true;
  els.authorDossier.classList.remove("is-open");
  els.authorDossier.setAttribute("aria-hidden", "true");
}

let subObserver = null;
function observeSubcategories() {
  if (subObserver) subObserver.disconnect();
  const nodes = document.querySelectorAll("[data-sub-observer]");
  if (!nodes.length) return;

  subObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      if (visible.length > 0) {
        const subId = visible[0].target.dataset.subObserver;
        if (subId !== state.activeSubId) {
          state.activeSubId = subId;
          els.tocTree.querySelectorAll(".toc-sub-btn").forEach((b) => {
            b.classList.toggle("is-active", b.dataset.subId === subId);
          });
        }
      }
    },
    { rootMargin: "-95px 0px -70% 0px", threshold: 0.01 }
  );

  nodes.forEach((n) => subObserver.observe(n));
}

function syncFilterButtons() {
  els.filterStarred.classList.toggle("is-active", state.starredOnly);
  els.filterStarred.setAttribute("aria-pressed", String(state.starredOnly));
  els.filterReviewed.classList.toggle("is-active", state.reviewedOnly);
  els.filterReviewed.setAttribute("aria-pressed", String(state.reviewedOnly));
  els.filterCross.classList.toggle("is-active", state.crossOnly);
  els.filterCross.setAttribute("aria-pressed", String(state.crossOnly));
  els.searchClear.hidden = !state.query;
  els.kbdHint.hidden = Boolean(state.query);
}

function setView(viewName) {
  state.view = viewName;
  document.querySelectorAll(".view-btn").forEach((b) => {
    const active = b.dataset.view === viewName;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  renderAll();
}

function renderAll() {
  hideReviewPopover();
  const allMatched = getFilteredDisciplines(true);
  const visibleDisciplines = getFilteredDisciplines(false);
  const totalShownWorks = visibleDisciplines.reduce((acc, d) => acc + d.matchedWorks, 0);

  renderDiscStrip();
  renderYearStrip();
  renderTOC(allMatched);
  syncFilterButtons();

  els.resultSummary.textContent =
    totalShownWorks === state.catalog.stats.works
      ? `共 ${totalShownWorks} 部著作`
      : `显示 ${totalShownWorks} / ${state.catalog.stats.works} 部`;

  if (state.view === "timeline") {
    renderTimeline();
  } else {
    renderFolioOrCards(visibleDisciplines);
  }
}

function openMobileNav() {
  els.spineNav.classList.add("is-open");
  els.mobileBackdrop.hidden = false;
}

function closeMobileNav() {
  els.spineNav.classList.remove("is-open");
  els.mobileBackdrop.hidden = true;
}

function initPreferences() {
  const savedTheme = localStorage.getItem("folio-theme") || "light";
  const savedTypo = localStorage.getItem("folio-typo-v2") || "revue";
  const savedDensity = localStorage.getItem("folio-density") || "compact";
  document.documentElement.setAttribute("data-theme", savedTheme);
  document.documentElement.setAttribute("data-typo", savedTypo);
  document.documentElement.setAttribute("data-density", savedDensity);

  document.querySelectorAll("[data-typo-set]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.typoSet === savedTypo);
    btn.addEventListener("click", () => {
      const next = btn.dataset.typoSet;
      document.documentElement.setAttribute("data-typo", next);
      localStorage.setItem("folio-typo-v2", next);
      document.querySelectorAll("[data-typo-set]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.typoSet === next);
      });
    });
  });

  document.querySelectorAll("[data-density-set]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.densitySet === savedDensity);
    btn.addEventListener("click", () => {
      const next = btn.dataset.densitySet;
      document.documentElement.setAttribute("data-density", next);
      localStorage.setItem("folio-density", next);
      document.querySelectorAll("[data-density-set]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.densitySet === next);
      });
      if (state.view === "cards" && state.catalog) renderAll();
    });
  });

  let lastCols = 0;
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    hideReviewPopover();
    if (state.view !== "cards" || !state.catalog) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const nextCols = getMasonryColumnCount();
      if (nextCols !== lastCols) {
        lastCols = nextCols;
        renderAll();
      }
    }, 120);
  });

  els.themeToggle.addEventListener("click", () => {
    const curr = document.documentElement.getAttribute("data-theme");
    const next = curr === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("folio-theme", next);
  });
}

function initGlobalListeners() {
  els.searchInput.addEventListener("input", (e) => {
    state.query = e.target.value;
    renderAll();
  });

  els.searchClear.addEventListener("click", () => {
    state.query = "";
    els.searchInput.value = "";
    els.searchInput.focus();
    renderAll();
  });

  els.filterStarred.addEventListener("click", () => {
    state.starredOnly = !state.starredOnly;
    renderAll();
  });

  els.filterReviewed.addEventListener("click", () => {
    state.reviewedOnly = !state.reviewedOnly;
    renderAll();
  });

  els.filterCross.addEventListener("click", () => {
    state.crossOnly = !state.crossOnly;
    renderAll();
  });

  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  els.dossierClose.addEventListener("click", closeDossier);
  els.dossierOverlay.addEventListener("click", closeDossier);

  els.colophonBtn.addEventListener("click", () => {
    els.colophonModal.hidden = false;
  });
  els.modalClose.addEventListener("click", () => {
    els.colophonModal.hidden = true;
  });
  els.colophonModal.addEventListener("click", (e) => {
    if (e.target === els.colophonModal) els.colophonModal.hidden = true;
  });

  els.mobileNavBtn.addEventListener("click", openMobileNav);
  els.mobileNavClose.addEventListener("click", closeMobileNav);
  els.mobileBackdrop.addEventListener("click", closeMobileNav);

  window.addEventListener("scroll", () => {
    hideReviewPopover();
    els.backToTop.hidden = window.scrollY < 480;
  });
  els.backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== els.searchInput && els.colophonModal.hidden) {
      e.preventDefault();
      els.searchInput.focus();
    } else if (e.key === "Escape") {
      if (!els.colophonModal.hidden) {
        els.colophonModal.hidden = true;
      } else if (els.authorDossier.classList.contains("is-open")) {
        closeDossier();
      } else if (state.query) {
        state.query = "";
        els.searchInput.value = "";
        renderAll();
      }
    }
  });
}

async function bootstrap() {
  initPreferences();
  initGlobalListeners();

  try {
    const res = await fetch("./data/catalog.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = await res.json();
    state.catalog = catalog;
    buildIndices(catalog);
    renderMastheadStats();

    els.metaNotesList.innerHTML = catalog.metaNotes.map((n) => `<li>${escapeHtml(n)}</li>`).join("");
    const dt = new Date(catalog.generatedAt);
    const fmtDate = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    els.colophonMeta.textContent = `SYNCED ${fmtDate} · ${catalog.sourceFile} + 豆瓣札记 ${catalog.stats.reviewedWorks || 0} 篇`;

    renderAll();
  } catch (err) {
    els.catalogRoot.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">书目数据加载失败</div>
        <div>请通过本地 HTTP 服务打开本页面（如 <code>npm run dev</code>），错误信息：${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

bootstrap();
