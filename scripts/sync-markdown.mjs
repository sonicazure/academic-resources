import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = "d:\\Obsidian_Data\\猫德黑\\! 学术谱系\\学术资源与谱系.md";
const REVIEWS_PATH = path.join(PROJECT_ROOT, "data", "reviews.json");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "data", "catalog.json");

const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;

if (!fs.existsSync(sourcePath)) {
  console.error(`[ERROR] 找不到源文件: ${sourcePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(sourcePath, "utf-8");
const lines = raw.split(/\r?\n/);

function parseBirthYear(lifeSpan) {
  if (!lifeSpan) return 9999;
  const firstPart = lifeSpan.split(/[–—\-\/]/)[0].trim();
  const bceMatch = firstPart.match(/前\s*(\d+)\s*世纪/);
  if (bceMatch) return -parseInt(bceMatch[1], 10) * 100;
  const bceYear = firstPart.match(/前\s*(\d+)/);
  if (bceYear) return -parseInt(bceYear[1], 10);
  const ceCentury = firstPart.match(/(\d+)\s*世纪/);
  if (ceCentury) return (parseInt(ceCentury[1], 10) - 1) * 100;
  const ceYear = firstPart.match(/(\d{3,4})/);
  if (ceYear) return parseInt(ceYear[1], 10);
  return 9999;
}

function parseAuthorHeading(text) {
  const clean = text.trim();
  // 匹配 “作者名（生卒年）” 或 “白轻（编）”
  const m = clean.match(/^(.+?)[（(]([^）)]+)[）)]$/);
  if (m) {
    const name = m[1].trim();
    const paren = m[2].trim();
    if (paren === "编" || paren === "主编" || paren === "编著") {
      return { name: `${name}（${paren}）`, displayName: name, role: paren, lifeSpan: "", birthYear: 9999 };
    }
    return { name, displayName: name, role: "", lifeSpan: paren, birthYear: parseBirthYear(paren) };
  }
  return { name: clean, displayName: clean, role: "", lifeSpan: "", birthYear: 9999 };
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const metaNotes = [];
const disciplines = [];
let currentDiscipline = null;
let currentSubcategory = null;
let currentAuthor = null;
let inCatalog = false;
let inSources = false;
let currentNote = null;
const warnings = [];

function flushNote() {
  if (currentNote && currentAuthor) {
    currentAuthor.notes.push({
      work: currentNote.work,
      content: currentNote.lines.join("\n").trim(),
    });
  }
  currentNote = null;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (trimmed.startsWith("## 资料来源与使用口径")) {
    inSources = true;
    inCatalog = false;
    continue;
  }
  if (trimmed.startsWith("## 二、完整资源清单")) {
    inCatalog = true;
    inSources = false;
    continue;
  }
  if (trimmed.startsWith("## ") && !trimmed.startsWith("## 二、")) {
    inSources = false;
    continue;
  }

  if (inSources && trimmed.startsWith("- ")) {
    metaNotes.push(trimmed.slice(2).trim());
    continue;
  }

  if (!inCatalog) continue;

  // 备注续行
  if (currentNote) {
    if (trimmed.startsWith(">")) {
      currentNote.lines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    } else {
      flushNote();
    }
  }

  if (trimmed.startsWith("### ")) {
    flushNote();
    const title = trimmed.slice(4).trim();
    currentDiscipline = {
      id: slugify(title) || `disc-${disciplines.length + 1}`,
      index: disciplines.length + 1,
      title,
      subcategories: [],
    };
    disciplines.push(currentDiscipline);
    currentSubcategory = null;
    currentAuthor = null;
    continue;
  }

  if (trimmed.startsWith("#### ")) {
    flushNote();
    const title = trimmed.slice(5).trim();
    if (!currentDiscipline) continue;
    currentSubcategory = {
      id: `${currentDiscipline.id}-${slugify(title) || currentDiscipline.subcategories.length + 1}`,
      title,
      authors: [],
      placeholder: false,
    };
    currentDiscipline.subcategories.push(currentSubcategory);
    currentAuthor = null;
    continue;
  }

  if (trimmed.startsWith("##### ")) {
    flushNote();
    const heading = trimmed.slice(6).trim();
    if (!currentSubcategory) continue;
    const parsed = parseAuthorHeading(heading);
    currentAuthor = {
      id: `${currentSubcategory.id}-${slugify(parsed.displayName)}-${currentSubcategory.authors.length + 1}`,
      name: parsed.name,
      displayName: parsed.displayName,
      role: parsed.role,
      lifeSpan: parsed.lifeSpan,
      birthYear: parsed.birthYear,
      originalName: "",
      works: [],
      notes: [],
    };
    currentSubcategory.authors.push(currentAuthor);
    continue;
  }

  if (trimmed === "（待补充）" && currentSubcategory) {
    currentSubcategory.placeholder = true;
    continue;
  }

  // Callout 备注: > [!note]- 作品名 · 备注
  const noteMatch = trimmed.match(/^>\s*\[!note\][-+]?\s*(.+)$/i);
  if (noteMatch && currentAuthor) {
    const label = noteMatch[1].trim();
    const workTitle = label.split("·")[0].trim();
    currentNote = { work: workTitle, lines: [] };
    continue;
  }

  // Markdown 表格行
  if (trimmed.startsWith("|") && currentAuthor) {
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 2) {
      // 跳过表头与分隔线
      if (cells[0] === "作品" || /^:?-{2,}:?$/.test(cells[0])) {
        continue;
      }
      const rawWork = cells[0] || "";
      const starred = rawWork.startsWith("\\*") || rawWork.startsWith("*");
      const title = rawWork.replace(/^\\?\*\s*/, "").trim();
      const originalTitle = (cells[1] || "").trim();
      const year = (cells[2] || "").trim();

      if (title) {
        currentAuthor.works.push({
          title,
          originalTitle,
          year,
          starred,
        });
      }
    }
    continue;
  }

  // 作者外文/拼音原名（紧跟 ##### 之后且表格之前的第一行非空文本）
  if (currentAuthor && !currentAuthor.originalName && currentAuthor.works.length === 0 && trimmed) {
    currentAuthor.originalName = trimmed;
    continue;
  }

  // 检测是否还有未归类的散落正文行
  if (trimmed && !trimmed.startsWith(">")) {
    warnings.push(`第 ${i + 1} 行未识别内容: ${trimmed}`);
  }
}

flushNote();

// 读取豆瓣阅读评论库并按「作者 + 书名」精准合并
const reviewLookup = new Map();
let reviewsLoaded = 0;
if (fs.existsSync(REVIEWS_PATH)) {
  const reviewList = JSON.parse(fs.readFileSync(REVIEWS_PATH, "utf-8"));
  for (const item of reviewList) {
    const k = `${item.author.trim()}||${item.work.trim()}`;
    reviewLookup.set(k, item.entries || []);
    reviewsLoaded++;
  }
}

// 统计与跨学科作者聚合
let totalWorks = 0;
let totalStarred = 0;
let totalReviewedWorks = 0;
let totalAuthorEntries = 0;
const yearsSet = new Set();
const authorMap = new Map();
const matchedReviewKeys = new Set();

for (const d of disciplines) {
  d.workCount = 0;
  d.starredCount = 0;
  d.reviewedCount = 0;
  d.authorCount = 0;

  for (const s of d.subcategories) {
    s.workCount = 0;
    s.starredCount = 0;
    s.reviewedCount = 0;
    s.authorCount = s.authors.length;
    d.authorCount += s.authorCount;
    totalAuthorEntries += s.authorCount;

    for (const a of s.authors) {
      s.workCount += a.works.length;
      const aStarred = a.works.filter((w) => w.starred).length;
      s.starredCount += aStarred;
      d.workCount += a.works.length;
      d.starredCount += aStarred;
      totalWorks += a.works.length;
      totalStarred += aStarred;

      for (const w of a.works) {
        if (w.year) yearsSet.add(w.year);
        const rKey = `${a.displayName.trim()}||${w.title.trim()}`;
        const entries = reviewLookup.get(rKey) || [];
        if (entries.length > 0) {
          w.reviews = entries;
          matchedReviewKeys.add(rKey);
          s.reviewedCount += 1;
          d.reviewedCount += 1;
          totalReviewedWorks += 1;
        }
      }

      // 规范化跨学科作者合并键（优先外文原名，其次中文名）
      const canonicalKey = (a.originalName || a.displayName).toLowerCase().replace(/\s+/g, " ").trim();
      if (!authorMap.has(canonicalKey)) {
        authorMap.set(canonicalKey, {
          key: canonicalKey,
          name: a.displayName,
          originalName: a.originalName,
          lifeSpan: a.lifeSpan,
          birthYear: a.birthYear,
          appearances: [],
        });
      }
      authorMap.get(canonicalKey).appearances.push({
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

const crossDisciplinaryAuthors = [...authorMap.values()]
  .filter((a) => a.appearances.length > 1)
  .sort((a, b) => a.birthYear - b.birthYear);

const catalog = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.basename(sourcePath),
  title: "学术资源与谱系 (理论篇)",
  subtitle: "Academic Resources & Intellectual Genealogy (Theory)",
  metaNotes,
  stats: {
    disciplines: disciplines.length,
    subcategories: disciplines.reduce((acc, d) => acc + d.subcategories.length, 0),
    uniqueAuthors: authorMap.size,
    authorEntries: totalAuthorEntries,
    works: totalWorks,
    starred: totalStarred,
    reviewedWorks: totalReviewedWorks,
    crossDisciplinaryCount: crossDisciplinaryAuthors.length,
    years: [...yearsSet].sort(),
  },
  disciplines,
  crossDisciplinaryKeys: crossDisciplinaryAuthors.map((a) => a.key),
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(catalog, null, 2), "utf-8");

console.log(`✓ 同步完成 -> ${OUTPUT_PATH}`);
console.log(`  学科: ${catalog.stats.disciplines} | 子类: ${catalog.stats.subcategories} | 独立人物: ${catalog.stats.uniqueAuthors} (条目 ${catalog.stats.authorEntries})`);
console.log(`  作品总数: ${catalog.stats.works} | 星标重点: ${catalog.stats.starred} | 附有书评: ${catalog.stats.reviewedWorks} | 跨学科人物: ${catalog.stats.crossDisciplinaryCount}`);
console.log(`  年份跨度: ${catalog.stats.years.join(", ")}`);
const unmatchedReviews = [...reviewLookup.keys()].filter((k) => !matchedReviewKeys.has(k));
if (unmatchedReviews.length > 0) {
  console.warn(`⚠ 有 ${unmatchedReviews.length} 条评论未命中书目:`, unmatchedReviews);
} else if (reviewsLoaded > 0) {
  console.log(`✓ 全部 ${reviewsLoaded} 条豆瓣书评已 100% 精准挂载！`);
}
if (warnings.length > 0) {
  console.warn(`⚠ 发现 ${warnings.length} 条未解析行:`);
  warnings.forEach((w) => console.warn("  " + w));
} else {
  console.log("✓ 全文格式校验通过，无未识别散落行！");
}
