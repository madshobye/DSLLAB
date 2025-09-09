/* gherkin-parser-standalone.js
 * Tiny Gherkin parser (pure JS, no deps, no modules).
 * globalThis.GherkinParser = { parse, expandOutlines }
 */
(function () {
  const EN_DIALECT = {
    feature: ["Feature"],
    rule: ["Rule"],
    background: ["Background"],
    scenario: ["Scenario"],
    scenarioOutline: ["Scenario Outline", "Scenario Template"],
    examples: ["Examples"],
    given: ["Given"],
    when: ["When"],
    then: ["Then"],
    and: ["And"],
    but: ["But"],
  };

  function normalizeDialect(d) {
    const EN_DIALECT = {
      feature: ["Feature"],
      rule: ["Rule"],
      background: ["Background"],
      scenario: ["Scenario"],
      scenarioOutline: ["Scenario Outline", "Scenario Template"],
      examples: ["Examples"],
      given: ["Given"],
      when: ["When"],
      then: ["Then"],
      and: ["And"],
      but: ["But"],
    };

    const lower = {};
    for (const k of Object.keys(EN_DIALECT)) {
      const list = (d && d[k] ? d[k] : EN_DIALECT[k]).slice();
      lower[k] = list.map((s) => s.trim());
    }

    // Header-like keywords (with trailing colon)
    const kw = {};
    for (const k of ["feature", "rule", "background", "scenario", "examples"]) {
      const re = lower[k]
        .map(escapeRegex)
        .sort((a, b) => b.length - a.length)
        .join("|");
      // NOTE the leading \s* so indentation is allowed
      kw[k] = new RegExp(`^\\s*(?:${re})\\s*:`, "i");
    }

    // Scenario Outline is special because its keyword set is separate
    const scenOutRe = lower.scenarioOutline
      .map(escapeRegex)
      .sort((a, b) => b.length - a.length)
      .join("|");
    const scenarioOutline = new RegExp(`^\\s*(?:${scenOutRe})\\s*:`, "i");

    // Step keywords (colon-less)
    const stepKw = {};
    for (const k of ["given", "when", "then", "and", "but"]) {
      const re = lower[k]
        .map(escapeRegex)
        .sort((a, b) => b.length - a.length)
        .join("|");
      stepKw[k] = new RegExp(`^(?:${re})\\b`, "i"); // we already trimStart() for steps
    }

    return {
      ...lower,
      re: {
        feature: kw.feature,
        rule: kw.rule,
        background: kw.background,
        scenario: kw.scenario,
        scenarioOutline,
        examples: kw.examples,
        step: stepKw,
      },
    };
  }

  // --- Strict near-miss detection for headers & step keywords -------------------
  const STRICT_NEAR_MISS = true; // set false to disable

  const HEADER_CANON = [
    "Feature",
    "Rule",
    "Background",
    "Scenario",
    "Scenario Outline",
    "Examples",
  ];

  const STEP_CANON = ["Given", "When", "Then", "And", "But"];

  function looksLikeHeaderTypo(line) {
    // header-ish: letters (and spaces) then a colon
    const m = /^\s*([A-Za-z][A-Za-z ]*[A-Za-z])\s*:/.exec(line);
    if (!m) return null;
    const found = m[1].trim();
    if (HEADER_CANON.some((h) => h.toLowerCase() === found.toLowerCase()))
      return null;
    const best = nearestWord(found, HEADER_CANON);
    if (best && best.dist <= Math.max(2, Math.floor(best.word.length * 0.34))) {
      return { found, expected: best.word };
    }
    return null;
  }

  function looksLikeStepTypo(line) {
    // starts with a word token (not a header: no colon soon after)
    const m = /^\s*([A-Za-z]+)\b/.exec(line);
    if (!m) return null;
    // treat lines with an early colon as non-steps (headers/labels)
    const idx = line.indexOf(":");
    if (idx !== -1 && idx < 24) return null;

    const found = m[1];
    if (STEP_CANON.some((s) => s.toLowerCase() === found.toLowerCase()))
      return null;
    const best = nearestWord(found, STEP_CANON);
    if (best && best.dist <= Math.max(1, Math.floor(best.word.length * 0.34))) {
      return { found, expected: best.word };
    }
    return null;
  }

  function nearestWord(word, candidates) {
    let best = null;
    const a = word.toLowerCase();
    for (const c of candidates) {
      const d = levenshtein(a, c.toLowerCase());
      if (!best || d < best.dist) best = { word: c, dist: d };
    }
    return best;
  }

  function levenshtein(a, b) {
    const m = a.length,
      n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[m][n];
  }

  function parse(text, options = {}) {
    const dialect = normalizeDialect(options.dialect || EN_DIALECT);
    const includeComments = !!options.includeComments;

    const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    const lines = src.split("\n");

    const ctx = {
      dialect,
      includeComments,
      lines,
      i: 0,
      currentTags: [],
      docString: null,
      docStringIndent: 0,
      docStringFence: null,
      language: "en",
      comments: [],
      file: options.file || undefined,
    };

    scanLanguageHeader(ctx);
    const feature = parseFeature(ctx);

    return {
      type: "GherkinDocument",
      language: ctx.language,
      feature,
      comments: includeComments ? ctx.comments : undefined,
    };
  }

  function expandOutlines(doc) {
    const cloned = structuredClonePolyfill(doc);
    if (!cloned.feature) return cloned;

    function expandInContainer(container) {
      if (!container || !container.children) return;
      const expanded = [];
      for (const child of container.children) {
        if (
          child.type === "Scenario" &&
          child.keywordType === "ScenarioOutline"
        ) {
          const concrete = expandScenarioOutline(child);
          expanded.push(...concrete);
        } else if (child.type === "Rule") {
          expandInContainer(child);
          expanded.push(child);
        } else {
          expanded.push(child);
        }
      }
      container.children = expanded;
    }

    expandInContainer(cloned.feature);
    return cloned;
  }

  /* ============================ Parsing helpers ============================ */

  function scanLanguageHeader(ctx) {
    for (let j = 0; j < Math.min(5, ctx.lines.length); j++) {
      const raw = ctx.lines[j];
      const line = trimRight(raw);
      const m = line.match(/^\s*#\s*language\s*:\s*([A-Za-z0-9_-]+)/i);
      if (m) {
        ctx.language = m[1];
        break;
      }
    }
  }

  function parseFeature(ctx) {
    skipEmptyAndTagsAndComments(ctx);
    if (eof(ctx)) return null;

    const leadingTags = takeTags(ctx);

    const head = peekLine(ctx);
    if (!ctx.dialect.re.feature.test(head)) {
      throw syntaxError(ctx, 'Expected "Feature:"');
    }

    const { name, keyword } = takeHeader(ctx, ctx.dialect.re.feature);
    const feature = node("Feature", ctx, {
      name,
      keyword,
      tags: leadingTags,
      description: "",
    });
    feature.children = [];

    feature.description = takeDescriptionUntil(
      ctx,
      (ln) =>
        ctx.dialect.re.background.test(ln) ||
        ctx.dialect.re.rule.test(ln) ||
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln) ||
        isTagLine(ln) ||
        isComment(ln) ||
        eof(ctx)
    );

    while (!eof(ctx)) {
      skipEmptyAndComments(ctx);
      const tags = takeTags(ctx);
      if (eof(ctx)) break;

      const ln = peekLine(ctx);

      if (ctx.dialect.re.background.test(ln)) {
        const bg = parseBackground(ctx);
        attachTagsOrPush(ctx, feature, bg, tags);
        continue;
      }
      if (ctx.dialect.re.rule.test(ln)) {
        const rule = parseRule(ctx, tags);
        feature.children.push(rule);
        continue;
      }
      if (
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln)
      ) {
        const sc = parseScenario(ctx, tags);
        feature.children.push(sc);
        continue;
      }
      if (isTagLine(ln)) {
        continue;
      }
      if (ln.trim() === "") {
        advance(ctx);
        continue;
      }
      throw syntaxError(
        ctx,
        `Unexpected content under Feature: "${ln.trim()}"`
      );
    }

    return feature;
  }

  function parseRule(ctx, tags) {
    const { name, keyword } = takeHeader(ctx, ctx.dialect.re.rule);
    const rule = node("Rule", ctx, { name, keyword, tags, description: "" });
    rule.children = [];

    rule.description = takeDescriptionUntil(
      ctx,
      (ln) =>
        ctx.dialect.re.background.test(ln) ||
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln) ||
        isTagLine(ln) ||
        isComment(ln) ||
        eof(ctx)
    );

    while (!eof(ctx)) {
      skipEmptyAndComments(ctx);
      const childTags = takeTags(ctx);
      if (eof(ctx)) break;

      const ln = peekLine(ctx);
      if (ctx.dialect.re.background.test(ln)) {
        const bg = parseBackground(ctx);
        attachTagsOrPush(ctx, rule, bg, childTags);
        continue;
      }
      if (
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln)
      ) {
        const sc = parseScenario(ctx, childTags);
        rule.children.push(sc);
        continue;
      }
      if (ctx.dialect.re.rule.test(ln)) break;
      if (ctx.dialect.re.feature.test(ln)) break;

      if (ln.trim() === "") {
        advance(ctx);
        continue;
      }
      throw syntaxError(ctx, `Unexpected content under Rule: "${ln.trim()}"`);
    }

    return rule;
  }

  function parseBackground(ctx) {
    const { name, keyword } = takeHeader(ctx, ctx.dialect.re.background);
    const bg = node("Background", ctx, { name, keyword, description: "" });
    bg.steps = [];

    bg.description = takeDescriptionUntil(
      ctx,
      (ln) =>
        isStepLine(ctx, ln) ||
        isTagLine(ln) ||
        isComment(ln) ||
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln) ||
        ctx.dialect.re.rule.test(ln) ||
        ctx.dialect.re.background.test(ln) ||
        eof(ctx)
    );

    parseStepsInto(ctx, bg.steps);
    return bg;
  }

  function parseScenario(ctx, tags) {
    const headerRe = ctx.dialect.re.scenarioOutline.test(peekLine(ctx))
      ? ctx.dialect.re.scenarioOutline
      : ctx.dialect.re.scenario;

    const { name, keyword } = takeHeader(ctx, headerRe);
    const isOutline = headerRe === ctx.dialect.re.scenarioOutline;

    const sc = node("Scenario", ctx, {
      name,
      keyword,
      keywordType: isOutline ? "ScenarioOutline" : "Scenario",
      tags,
      description: "",
    });
    sc.steps = [];
    sc.examples = [];

    sc.description = takeDescriptionUntil(
      ctx,
      (ln) =>
        isStepLine(ctx, ln) ||
        isTagLine(ln) ||
        ctx.dialect.re.examples.test(ln) ||
        ctx.dialect.re.rule.test(ln) ||
        ctx.dialect.re.background.test(ln) ||
        ctx.dialect.re.scenario.test(ln) ||
        ctx.dialect.re.scenarioOutline.test(ln) ||
        isComment(ln) ||
        eof(ctx)
    );

    parseStepsInto(ctx, sc.steps);

    while (!eof(ctx)) {
      skipEmptyAndComments(ctx);
      const exTags = takeTags(ctx);
      if (eof(ctx)) break;

      const ln = peekLine(ctx);
      if (!ctx.dialect.re.examples.test(ln)) {
        if (
          ctx.dialect.re.rule.test(ln) ||
          ctx.dialect.re.scenario.test(ln) ||
          ctx.dialect.re.scenarioOutline.test(ln) ||
          ctx.dialect.re.background.test(ln) ||
          isTagLine(ln)
        )
          break;
        if (ln.trim() === "") {
          advance(ctx);
          continue;
        }
        break;
      }

      const { name, keyword } = takeHeader(ctx, ctx.dialect.re.examples);
      const ex = node("Examples", ctx, {
        name,
        keyword,
        tags: exTags,
        description: "",
      });
      ex.tableHeader = null;
      ex.tableBody = [];

      ex.description = takeDescriptionUntil(
        ctx,
        (line) =>
          isTableRow(line) ||
          isComment(line) ||
          ctx.dialect.re.examples.test(line) ||
          ctx.dialect.re.scenario.test(line) ||
          ctx.dialect.re.scenarioOutline.test(line) ||
          ctx.dialect.re.background.test(line) ||
          ctx.dialect.re.rule.test(line) ||
          eof(ctx)
      );

      const table = takeTable(ctx);
      if (table.length > 0) {
        ex.tableHeader = {
          cells: table[0],
          location: { ...loc(ctx, ctx.i - 1) },
        };
        for (let r = 1; r < table.length; r++) {
          ex.tableBody.push({
            cells: table[r],
            location: { ...loc(ctx, ctx.i - (table.length - r)) },
          });
        }
      }
      sc.examples.push(ex);
    }

    return sc;
  }

  function parseStepsInto(ctx, outSteps) {
    while (!eof(ctx)) {
      skipEmptyAndComments(ctx);
      if (eof(ctx)) break;

      const ln = peekLine(ctx);
      if (!isStepLine(ctx, ln)) break;

      const step = parseStep(ctx);
      outSteps.push(step);

      const table = takeTable(ctx);
      if (table.length > 0) {
        step.argument = {
          type: "DataTable",
          rows: table.map((cells, idx) => ({
            cells,
            location: loc(ctx, ctx.i - (table.length - idx)),
          })),
        };
      }

      const doc = tryTakeDocString(ctx);
      if (doc) {
        step.argument = doc;
      }
    }
  }

  function parseStep(ctx) {
    const raw = takeLine(ctx);
    const { keyword, keywordType, text } = parseStepHeader(ctx, raw);
    return node("Step", ctx, { keyword, keywordType, text });
  }

  function parseStepHeader(ctx, rawLine) {
    const line = rawLine.trimStart();
    const kinds = ["given", "when", "then", "and", "but"];
    for (const kind of kinds) {
      const re = ctx.dialect.re.step[kind];
      const m = line.match(re);
      if (m) {
        const keyword = m[0];
        const text = line.slice(m[0].length).trim();
        const keywordType = kind.toUpperCase();
        return { keyword, keywordType, text };
      }
    }
    throw syntaxError(ctx, `Invalid step line: "${line}"`);
  }

  function tryTakeDocString(ctx) {
    if (eof(ctx)) return null;
    const ln = peekLine(ctx);
    const m = ln.match(/^(\s*)(?:(?:\"\"\"|```))(.*)$/);
    if (!m) return null;

    const fence = m[0].trim().startsWith("```") ? "```" : '"""';
    const indent = m[1] ? m[1].length : 0;
    const after = m[2]?.trim() || "";
    advance(ctx);

    const mediaType = after.length ? after : null;
    const lines = [];
    while (!eof(ctx)) {
      const cur = peekLine(ctx);
      if (cur.trimStart().startsWith(fence) && leadingSpaces(cur) <= indent) {
        advance(ctx);
        break;
      }
      lines.push(cur);
      advance(ctx);
    }
    const dedented = dedentLines(lines, indent);
    return { type: "DocString", content: dedented.join("\n"), mediaType };
  }

  function takeTable(ctx) {
    const rows = [];
    while (!eof(ctx)) {
      const ln = peekLine(ctx);
      if (!isTableRow(ln)) break;
      const { cells } = parseTableRow(ln);
      rows.push(cells);
      advance(ctx);
    }
    return rows;
  }

  function parseTableRow(line) {
    const raw = line.trim();
    const pieces = splitTableRow(raw);
    return { cells: pieces.map((c) => unescapeTableCell(c.trim())) };
  }

  function splitTableRow(s) {
    const result = [];
    let cur = "";
    let i = 0;
    if (!s.trim().startsWith("|")) return [];
    while (i < s.length) {
      const ch = s[i];
      if (ch === "\\") {
        if (i + 1 < s.length) {
          cur += s[i + 1];
          i += 2;
          continue;
        }
      }
      if (ch === "|") {
        if (cur !== "" || result.length > 0) {
          result.push(cur);
        }
        cur = "";
        i++;
        continue;
      }
      cur += ch;
      i++;
    }
    if (cur.length) result.push(cur);
    if (result.length && result[0] === "") result.shift();
    if (result.length && result[result.length - 1] === "") result.pop();
    return result;
  }

  function unescapeTableCell(s) {
    return s
      .replace(/\\\|/g, "|")
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t");
  }

  function isTableRow(ln) {
    return /^\s*\|.*\|\s*$/.test(ln);
  }

  function isStepLine(ctx, ln) {
    const s = ln.trimStart();
    return ["given", "when", "then", "and", "but"].some((k) =>
      ctx.dialect.re.step[k].test(s)
    );
  }

  function takeHeader(ctx, re) {
    const raw = takeLine(ctx);
    const m = raw.match(re);
    if (!m) throw syntaxError(ctx, `Expected header matching ${re}`);
    const keyword = m[0].slice(0, -1).trim();
    const name = raw.slice(m[0].length).trim();
    return { name, keyword };
  }

  function takeDescriptionUntil(ctx, stopPredicate) {
    const out = [];
    while (!eof(ctx)) {
      const ln = peekLine(ctx);
      if (stopPredicate(ln)) break;

      // NEW: strict near-miss detection
      if (STRICT_NEAR_MISS) {
        const h = looksLikeHeaderTypo(ln);
        if (h)
          throw syntaxError(
            ctx,
            `Unknown header "${h.found}:" — Did you mean "${h.expected}:"`
          );
        const s = looksLikeStepTypo(ln);
        if (s)
          throw syntaxError(
            ctx,
            `Unknown step keyword "${s.found}" — Did you mean "${s.expected}"`
          );
      }

      if (isComment(ln)) {
        if (ctx.includeComments) {
          ctx.comments.push(commentNode(ctx, ln));
        }
        advance(ctx);
        continue;
      }
      out.push(trimRight(ln));
      advance(ctx);
    }
    while (out.length && out[out.length - 1].trim() === "") out.pop();
    return out.join("\n");
  }

  function takeTags(ctx) {
    const tags = [];
    while (!eof(ctx)) {
      const ln = peekLine(ctx);
      if (!isTagLine(ln)) break;
      const found = ln
        .trim()
        .split(/\s+/)
        .filter((t) => t.startsWith("@"));
      for (const t of found) tags.push(t);
      advance(ctx);
    }
    return tags;
  }

  function isTagLine(ln) {
    return /^\s*@\w/.test(ln);
  }

  function isComment(ln) {
    return /^\s*#/.test(ln);
  }

  function commentNode(ctx, ln) {
    return {
      type: "Comment",
      text: trimRight(ln),
      location: loc(ctx, ctx.i),
    };
  }

  function attachTagsOrPush(ctx, container, node, tags) {
    if (tags && tags.length) node.tags = (node.tags || []).concat(tags);
    container.children.push(node);
  }

  function advance(ctx) {
    ctx.i++;
  }
  function takeLine(ctx) {
    if (eof(ctx)) throw syntaxError(ctx, "Unexpected end of file");
    const line = ctx.lines[ctx.i];
    ctx.i++;
    return line;
  }
  function peekLine(ctx) {
    return ctx.lines[ctx.i] ?? "";
  }
  function eof(ctx) {
    return ctx.i >= ctx.lines.length;
  }

  function skipEmptyAndComments(ctx) {
    while (!eof(ctx)) {
      const ln = peekLine(ctx);
      if (ln.trim() === "") {
        advance(ctx);
        continue;
      }
      if (isComment(ln)) {
        if (ctx.includeComments) ctx.comments.push(commentNode(ctx, ln));
        advance(ctx);
        continue;
      }
      break;
    }
  }

  function skipEmptyAndTagsAndComments(ctx) {
    while (!eof(ctx)) {
      const ln = peekLine(ctx);
      if (ln.trim() === "") {
        advance(ctx);
        continue;
      }
      if (isTagLine(ln) || isComment(ln)) {
        if (isComment(ln) && ctx.includeComments)
          ctx.comments.push(commentNode(ctx, ln));
        advance(ctx);
        continue;
      }
      break;
    }
  }

  function node(type, ctx, extra) {
    return { type, location: loc(ctx, ctx.i - 1), ...extra };
  }

  function loc(ctx, lineIdx) {
    return { line: lineIdx + 1, column: 1, uri: ctx.file || null };
  }

  function syntaxError(ctx, message) {
    const line = Math.min(ctx.i + 1, ctx.lines.length);
    const err = new Error(`${message} (line ${line})`);
    err.name = "GherkinSyntaxError";
    err.line = line;
    return err;
  }

  function trimRight(s) {
    return s.replace(/\s+$/, "");
  }
  function leadingSpaces(s) {
    const m = s.match(/^\s*/);
    return m ? m[0].length : 0;
  }

  function dedentLines(lines, baseIndent) {
    const indents = lines
      .filter((l) => l.trim() !== "")
      .map((l) => Math.max(0, leadingSpaces(l) - baseIndent));
    const min = indents.length ? Math.min(...indents) : 0;
    return lines.map((l) => {
      const drop = Math.min(leadingSpaces(l) - baseIndent, min);
      return l.slice(Math.max(0, baseIndent + (drop || 0)));
    });
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function structuredClonePolyfill(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /* ============================ Outline Expansion ============================ */

  function expandScenarioOutline(sc) {
    const cases = [];
    for (const ex of sc.examples || []) {
      if (!ex.tableHeader || !(ex.tableBody && ex.tableBody.length)) continue;
      const headers = ex.tableHeader.cells;
      for (const row of ex.tableBody) {
        const values = row.cells;
        const map = {};
        headers.forEach((h, idx) => {
          map[h] = values[idx];
        });

        const concrete = structuredClonePolyfill(sc);
        concrete.keywordType = "Scenario";
        concrete.type = "Scenario";
        concrete.name = interpolate(sc.name, map);
        concrete.steps = sc.steps.map((st) => {
          const cst = structuredClonePolyfill(st);
          cst.text = interpolate(st.text, map);
          if (st.argument?.type === "DocString") {
            cst.argument.content = interpolate(st.argument.content, map);
          } else if (st.argument?.type === "DataTable") {
            cst.argument.rows = st.argument.rows.map((r) => ({
              ...r,
              cells: r.cells.map((cell) => interpolate(cell, map)),
            }));
          }
          return cst;
        });
        if (ex.tags && ex.tags.length) {
          concrete.tags = Array.from(new Set([...(sc.tags || []), ...ex.tags]));
        }
        concrete.examples = [];
        cases.push(concrete);
      }
    }
    return cases.length ? cases : [structuredClonePolyfill(sc)];
  }

  function interpolate(s, map) {
    return s.replace(/<([^>]+)>/g, (_, k) =>
      k in map ? String(map[k]) : `<${k}>`
    );
  }

  // expose
  globalThis.GherkinParser = { parse, expandOutlines };
})();
