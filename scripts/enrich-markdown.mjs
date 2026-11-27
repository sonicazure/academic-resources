import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DEFAULT_SOURCE = "d:\\Obsidian_Data\\猫德黑\\! 学术谱系\\学术资源与谱系.md";
const BACKUP_DIR = path.join(PROJECT_ROOT, ".cache", "md-backups");

const sourcePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SOURCE;
const NO_NETWORK = process.argv.includes("--offline");

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

function isLooseWorkLine(trimmed) {
  return /^\\?\*?\s*《.+》/.test(trimmed);
}

function parseLooseWorkLine(trimmed) {
  const starred = /^\\?\*/.test(trimmed);
  let rest = trimmed.replace(/^\\?\*\s*/, "").trim();
  // 提取书名（含可能紧跟书名号后的括号副标，如 《醉舟》（及贝克特的英译版））
  const titleMatch = rest.match(/^(《[^》]+》(?:[（(][^）)]+[）)])?)(.*)$/);
  if (!titleMatch) return null;
  const title = titleMatch[1].trim();
  let tail = titleMatch[2].trim();

  let year = "";
  const yearMatch = tail.match(/(?:^|\s)((?:19|20)\d{2})\s*$/);
  if (yearMatch) {
    year = yearMatch[1];
    tail = tail.slice(0, tail.length - yearMatch[0].length).trim();
  }
  const originalTitle = tail.replace(/^\t+|\t+$/g, "").trim();
  return { title, originalTitle, year, starred };
}

function looksLikeLatinName(trimmed) {
  return /^[A-Za-zÀ-ÖØ-öø-ÿĀ-ž\u0100-\u024F\s.,'’\-&/]+$/.test(trimmed) && /[A-Za-z]{2,}/.test(trimmed);
}

function looksLikeLooseAuthorLine(trimmed) {
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("|") || trimmed.startsWith(">")) return false;
  if (trimmed === "（待补充）") return false;
  if (isLooseWorkLine(trimmed)) return false;
  if (looksLikeLatinName(trimmed)) return false;
  // 含有中文且长度合理，视为漏掉 ##### 的作者行
  return /[\u4e00-\u9fff]/.test(trimmed) && trimmed.length <= 40;
}

// ============================================================================
// 1. 解析原文档（同时兼容标准格式与随手写入的散落行）
// ============================================================================
const headerLines = [];
const disciplines = [];
let currentDiscipline = null;
let currentSubcategory = null;
let currentAuthor = null;
let currentNote = null;
let inCatalog = false;
let formatFixedCount = 0;

function flushNote() {
  if (currentNote && currentAuthor) {
    currentAuthor.notes.push(currentNote);
  }
  currentNote = null;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();

  if (!inCatalog) {
    headerLines.push(line);
    if (trimmed.startsWith("## 二、完整资源清单")) {
      inCatalog = true;
    }
    continue;
  }

  if (currentNote) {
    if (trimmed.startsWith(">")) {
      currentNote.lines.push(line);
      continue;
    } else {
      flushNote();
    }
  }

  if (!trimmed) continue;

  if (trimmed.startsWith("### ")) {
    flushNote();
    currentDiscipline = { title: trimmed.slice(4).trim(), subcategories: [] };
    disciplines.push(currentDiscipline);
    currentSubcategory = null;
    currentAuthor = null;
    continue;
  }

  if (trimmed.startsWith("#### ")) {
    flushNote();
    if (!currentDiscipline) continue;
    currentSubcategory = { title: trimmed.slice(5).trim(), authors: [], placeholder: false };
    currentDiscipline.subcategories.push(currentSubcategory);
    currentAuthor = null;
    continue;
  }

  if (trimmed.startsWith("##### ")) {
    flushNote();
    if (!currentSubcategory) continue;
    const parsed = parseAuthorHeading(trimmed.slice(6).trim());
    currentAuthor = {
      ...parsed,
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

  if (/^>\s*\[!note\]/i.test(trimmed) && currentAuthor) {
    currentNote = { lines: [line] };
    continue;
  }

  // 标准表格行
  if (trimmed.startsWith("|") && currentAuthor) {
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length >= 2) {
      if (cells[0] === "作品" || /^:?-{2,}:?$/.test(cells[0])) continue;
      const rawWork = cells[0] || "";
      const starred = rawWork.startsWith("\\*") || rawWork.startsWith("*");
      const title = rawWork.replace(/^\\?\*\s*/, "").trim();
      const originalTitle = (cells[1] || "").trim();
      const year = (cells[2] || "").trim();
      if (title) {
        currentAuthor.works.push({ title, originalTitle, year, starred });
      }
    }
    continue;
  }

  // 散落作品行（如 \*《伊菲革涅亚》2026）
  if (isLooseWorkLine(trimmed) && currentAuthor) {
    const w = parseLooseWorkLine(trimmed);
    if (w) {
      currentAuthor.works.push(w);
      formatFixedCount++;
      continue;
    }
  }

  // 作者外文/拼音原名
  if (currentAuthor && !currentAuthor.originalName && currentAuthor.works.length === 0 && looksLikeLatinName(trimmed)) {
    currentAuthor.originalName = trimmed;
    continue;
  }

  // 散落作者行（漏掉 ##### 前缀）
  if (looksLikeLooseAuthorLine(trimmed) && currentSubcategory) {
    flushNote();
    const parsed = parseAuthorHeading(trimmed);
    currentAuthor = {
      ...parsed,
      originalName: "",
      works: [],
      notes: [],
    };
    currentSubcategory.authors.push(currentAuthor);
    formatFixedCount++;
    continue;
  }

  // 兜底：若当前作者尚无外文名且尚未读到作品
  if (currentAuthor && !currentAuthor.originalName && currentAuthor.works.length === 0) {
    currentAuthor.originalName = trimmed;
  }
}
flushNote();

// ============================================================================
// 2. 联网权威查补（Wikidata 公开 API，零密钥、宁缺毋滥）
// ============================================================================
async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AcademicGenealogyEnricher/1.0 (personal-archive)" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function formatWikidataYear(timeStr) {
  if (!timeStr) return "";
  const m = timeStr.match(/^([+-])(\d+)-/);
  if (!m) return "";
  const sign = m[1];
  const yr = parseInt(m[2], 10);
  if (!yr) return "";
  return sign === "-" ? `前${yr}` : `${yr}`;
}

async function lookupAuthorWikidata(nameCn) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
    nameCn
  )}&language=zh&uselang=zh&limit=5&format=json`;
  const searchData = await fetchJson(searchUrl);
  if (!searchData?.search?.length) return null;

  const ids = searchData.search.map((x) => x.id).join("|");
  const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels|claims&languages=en|fr|de|it|es|zh&format=json`;
  const entityData = await fetchJson(entityUrl);
  if (!entityData?.entities) return null;

  for (const item of searchData.search) {
    const ent = entityData.entities[item.id];
    if (!ent?.claims) continue;
    // P31 = Q5 (human)
    const isHuman = (ent.claims.P31 || []).some((c) => c?.mainsnak?.datavalue?.value?.id === "Q5");
    if (!isHuman) continue;

    const birthTime = ent.claims.P569?.[0]?.mainsnak?.datavalue?.value?.time;
    const deathTime = ent.claims.P570?.[0]?.mainsnak?.datavalue?.value?.time;
    const b = formatWikidataYear(birthTime);
    const d = formatWikidataYear(deathTime);
    const lifeSpan = b ? `${b}–${d}` : "";

    const origName =
      ent.labels?.en?.value ||
      ent.labels?.fr?.value ||
      ent.labels?.de?.value ||
      ent.labels?.it?.value ||
      ent.labels?.es?.value ||
      "";

    if (lifeSpan || origName) {
      return { lifeSpan, originalName: origName };
    }
  }
  return null;
}

async function lookupWorkWikidata(titleCn, authorOrig) {
  const cleanTitle = titleCn.replace(/^《|》$/g, "").replace(/[（(][^）)]+[）)]/g, "").trim();
  const queries = authorOrig ? [`${cleanTitle} ${authorOrig}`, cleanTitle] : [cleanTitle];

  for (const q of queries) {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(
      q
    )}&language=zh&uselang=zh&limit=5&format=json`;
    const searchData = await fetchJson(searchUrl);
    if (!searchData?.search?.length) continue;

    const ids = searchData.search.map((x) => x.id).join("|");
    const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=labels|claims&languages=en|fr|de|it|es|ja|zh&format=json`;
    const entityData = await fetchJson(entityUrl);
    if (!entityData?.entities) continue;

    for (const item of searchData.search) {
      const ent = entityData.entities[item.id];
      if (!ent?.claims) continue;
      // 跳过人物实体
      const isHuman = (ent.claims.P31 || []).some((c) => c?.mainsnak?.datavalue?.value?.id === "Q5");
      if (isHuman) continue;

      // 优先 P1476 (title) 原题，其次根据原语种或常见欧洲/日文标签提取
      const p1476 = ent.claims.P1476?.[0]?.mainsnak?.datavalue?.value?.text;
      if (p1476 && !/^[\u4e00-\u9fff\s：·，。！？]+$/.test(p1476)) {
        return p1476.trim();
      }
      const langMap = { Q150: "fr", Q188: "de", Q652: "it", Q1321: "es", Q1860: "en", Q5287: "ja" };
      const origLangId = ent.claims.P407?.[0]?.mainsnak?.datavalue?.value?.id;
      const origLangCode = origLangId ? langMap[origLangId] : "";
      if (origLangCode && ent.labels?.[origLangCode]?.value) {
        return ent.labels[origLangCode].value.trim();
      }
      const label =
        ent.labels?.en?.value ||
        ent.labels?.fr?.value ||
        ent.labels?.de?.value ||
        ent.labels?.it?.value ||
        ent.labels?.es?.value ||
        ent.labels?.ja?.value ||
        "";
      if (label && label !== cleanTitle) {
        return label.trim();
      }
    }
  }
  return "";
}

let enrichedAuthors = 0;
let enrichedWorks = 0;
const stillMissing = [];

for (const d of disciplines) {
  for (const s of d.subcategories) {
    const isChineseSub = s.title.includes("汉语") && !s.title.includes("非汉语");
    for (const a of s.authors) {
      // 1) 补全作者生卒年与外文名
      if ((!a.lifeSpan && !a.role) || !a.originalName) {
        if (!NO_NETWORK) {
          const found = await lookupAuthorWikidata(a.displayName);
          if (found) {
            if (!a.lifeSpan && !a.role && found.lifeSpan) {
              a.lifeSpan = found.lifeSpan;
              a.birthYear = parseBirthYear(a.lifeSpan);
              enrichedAuthors++;
              console.log(`  + 补全生卒年: ${a.displayName}（${a.lifeSpan}）`);
            }
            if (!a.originalName && found.originalName) {
              a.originalName = found.originalName;
              enrichedAuthors++;
              console.log(`  + 补全外文名: ${a.displayName} -> ${a.originalName}`);
            }
          }
        }
        if (!a.lifeSpan && !a.role) stillMissing.push(`作者生卒年缺失: ${a.displayName}`);
        if (!a.originalName) stillMissing.push(`作者外文/拼音名缺失: ${a.displayName}`);
      }

      // 2) 补全作品原名
      for (const w of a.works) {
        if (!w.originalTitle) {
          if (isChineseSub) {
            w.originalTitle = w.title.replace(/^《|》$/g, "").trim();
            enrichedWorks++;
            console.log(`  + 补全中文原名: ${a.displayName} ${w.title} -> ${w.originalTitle}`);
          } else if (!NO_NETWORK) {
            const orig = await lookupWorkWikidata(w.title, a.originalName);
            if (orig) {
              w.originalTitle = orig;
              enrichedWorks++;
              console.log(`  + 补全作品原名: ${a.displayName} ${w.title} -> ${orig}`);
            } else {
              stillMissing.push(`作品原名未自动查到: ${a.displayName} ${w.title}`);
            }
          } else {
            stillMissing.push(`作品原名缺失: ${a.displayName} ${w.title}`);
          }
        }
      }
    }

    // 3) 同一子目录下按出生年升序稳定排序（仅在存在倒序时重排）
    let needSort = false;
    for (let k = 1; k < s.authors.length; k++) {
      if (s.authors[k].birthYear < s.authors[k - 1].birthYear) {
        needSort = true;
        break;
      }
    }
    if (needSort) {
      s.authors.sort((x, y) => x.birthYear - y.birthYear);
      formatFixedCount++;
      console.log(`  ~ 已按出生年重排子目录: ${d.title} > ${s.title}`);
    }
  }
}

// ============================================================================
// 3. 仅当发生格式修缮或信息补全时，安全备份并写回原 Markdown
// ============================================================================
if (formatFixedCount === 0 && enrichedAuthors === 0 && enrichedWorks === 0) {
  console.log("✓ Markdown 格式规范且无空缺信息，无需改写原文件。");
  if (stillMissing.length > 0) {
    console.warn("⚠ 以下空缺项暂未自动查到，建议人工核对补全:");
    stillMissing.forEach((m) => console.warn("  - " + m));
  }
  process.exit(0);
}

const out = [...headerLines];
// 确保 ## 二、完整资源清单 后有一个空行
while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
out.push("");

for (const d of disciplines) {
  out.push(`### ${d.title}`);
  out.push("");
  for (const s of d.subcategories) {
    out.push(`#### ${s.title}`);
    out.push("");
    if (s.placeholder && s.authors.length === 0) {
      out.push("（待补充）");
      out.push("");
      continue;
    }
    for (const a of s.authors) {
      const heading = a.role
        ? `##### ${a.displayName}（${a.role}）`
        : a.lifeSpan
          ? `##### ${a.displayName}（${a.lifeSpan}）`
          : `##### ${a.displayName}`;
      out.push(heading);
      if (a.originalName) out.push(a.originalName);
      out.push("");
      out.push("| 作品 | 原名 | 年份 |");
      out.push("| --- | --- | --- |");
      for (const w of a.works) {
        const workCell = w.starred ? `\\*${w.title}` : w.title;
        out.push(`| ${workCell} | ${w.originalTitle} | ${w.year} |`);
      }
      out.push("");
      for (const n of a.notes) {
        out.push(...n.lines);
        out.push("");
      }
    }
  }
}

const nextContent = out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const backupPath = path.join(BACKUP_DIR, `学术资源与谱系-${stamp}.md`);
fs.writeFileSync(backupPath, raw, "utf-8");
fs.writeFileSync(sourcePath, nextContent, "utf-8");

console.log(`✓ 已自动修缮原 Markdown（格式修正 ${formatFixedCount} 处，补全作者 ${enrichedAuthors} 项，补全原名 ${enrichedWorks} 项）`);
console.log(`  写回前已自动备份至: ${backupPath}`);
if (stillMissing.length > 0) {
  console.warn("⚠ 以下项暂未从 Wikidata 查到，已保留空位待人工复核:");
  stillMissing.forEach((m) => console.warn("  - " + m));
}
