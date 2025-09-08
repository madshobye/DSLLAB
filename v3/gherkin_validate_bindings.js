(function () {
  if (!globalThis.GherkinParser) throw new Error('Load gherkin-parser-standalone.js first.');

  // --- New binding validator with friendly suggestions ------------------------
  function validateBindings(gherkinText, { registry = null, params = null } = {}) {
    const REG = registry ||
      (globalThis.GherkinEval && globalThis.GherkinEval._debugRegistry) ||
      { GIVEN: [], WHEN: [], THEN: [] };

    const PARAMS = params ||
      (globalThis.GherkinEval && globalThis.GherkinEval._debugParams) ||
      {};

    const errors = [];
    const warnings = [];
    const summary = { totalScenarios: 0, totalSteps: 0, missingSteps: 0, ambiguousSteps: 0 };

    // Warn about /g
    for (const k of ['GIVEN', 'WHEN', 'THEN']) {
      for (const s of REG[k] || []) {
        if (s.pattern && s.pattern.flags && s.pattern.flags.includes('g')) {
          warnings.push({ line: 1, column: 1, message: `Pattern ${s.pattern} in ${k} uses 'g'. Remove it to avoid lastIndex issues.` });
        }
      }
    }

    // Parse & expand
    let doc;
    try {
      doc = GherkinParser.parse(gherkinText);
      doc = GherkinParser.expandOutlines(doc);
    } catch (e) {
      errors.push({ line: extractLineFromError(e) || 1, column: 1, message: String(e.message || e) });
      return finalize();
    }
    const feature = doc && doc.feature;
    if (!feature) {
      errors.push({ line: 1, column: 1, message: 'Missing Feature' });
      return finalize();
    }

    // Param catalog (values list when available; else try to extract from regex)
    const PCAT = buildParamCatalog(PARAMS);

    walkContainer(feature);
    return finalize();

    // ---- walkers ----
    function walkContainer(container) {
      for (const child of container.children || []) {
        if (child.type === 'Rule') walkContainer(child);
        else if (child.type === 'Scenario') validateScenario(child);
      }
    }

    function validateScenario(sc) {
      summary.totalScenarios++;
      let lastKind = null;

      for (const st of sc.steps || []) {
        summary.totalSteps++;

        // Resolve And/But
        let kind = st.keywordType;
        if (kind === 'AND' || kind === 'BUT') {
          if (!lastKind) {
            errors.push({ line: st.location.line, column: 1, message: `"${st.keyword}" cannot start a scenario: "${st.keyword} ${st.text}"` });
            continue;
          }
          kind = lastKind;
        }
        if (!(kind === 'GIVEN' || kind === 'WHEN' || kind === 'THEN')) {
          errors.push({ line: st.location.line, column: 1, message: `Unknown step keyword type: ${kind}` });
          continue;
        }

        const stepText = st.text.trim();
        const { matches, matchPatterns } = matchRegistry(REG, kind, stepText);

        if (matches === 0) {
          summary.missingSteps++;
          const hint = suggestPattern(kind, stepText, REG, PCAT);
          errors.push({
            line: st.location.line,
            column: 1,
            message: `No ${kind} definition matches: "${stepText}"`,
            hint
          });
        } else if (matches > 1) {
          summary.ambiguousSteps++;
          errors.push({
            line: st.location.line,
            column: 1,
            message: `Ambiguous ${kind} step: "${stepText}" matches ${matches} definitions`,
            details: matchPatterns.map(p => String(p))
          });
        }

        lastKind = kind;
      }
    }

    function finalize() {
      const ok = errors.length === 0;
      return { ok, errors, warnings, summary };
    }
  }

  // --- Matching helpers -------------------------------------------------------
  function matchRegistry(REG, kind, text) {
    const list = REG[kind] || [];
    let count = 0;
    const pats = [];
    for (const s of list) {
      const pat = new RegExp(s.pattern.source, s.pattern.flags.replace(/g/g, ''));
      pat.lastIndex = 0;
      const m = pat.exec(text);
      if (m) { count++; pats.push(s.expr || s.pattern); }
    }
    return { matches: count, matchPatterns: pats };
  }
// ---- FRIENDLY, GHERKIN-STYLE SUGGESTIONS ------------------------------------
function suggestPattern(kind, stepText, REG, PCAT) {
  const keyword = capitalize(kind.toLowerCase());

  // 0) If this exact text would match under another keyword, suggest that.
  const otherKinds = ['GIVEN', 'WHEN', 'THEN'].filter(k => k !== kind);
  for (const k of otherKinds) {
    const { matches } = matchRegistry(REG, k, stepText);
    if (matches > 0) {
      const otherKw = capitalize(k.toLowerCase());
      return `This looks like a ${otherKw} step. Did you mean: ${otherKw} ${stepText}`;
    }
  }

  // 1) PARAMETER issues: spot SNAKE_CASE tokens and validate against param types
  const tokensUpper = collectUpperTokens(stepText); // e.g. ["START_POS", "POSITION_END"]
  const likelyParam = guessParamName(stepText);     // e.g. "pos" if "position" is present

  const unknownVals = [];
  const knownVals = [];
  for (const tok of tokensUpper) {
    const hit = matchParamsForToken(tok, PCAT);
    if (hit.length) knownVals.push({ token: tok, params: hit });
    else unknownVals.push(tok);
  }

  // 1a) If there are unknown tokens, propose the closest known value for the likely param,
  //     and list allowed values.
  if (unknownVals.length) {
    // Build candidate dictionary for the likely param, else fall back to all params
    const catalog = PCAT[likelyParam] && (PCAT[likelyParam].valuesList?.length || PCAT[likelyParam].tester)
      ? { [likelyParam]: PCAT[likelyParam] }
      : PCAT;

    const lines = [];
    for (const bad of unknownVals) {
      const best = nearestAllowed(bad, catalog);
      if (best) {
        const corrected = replaceWholeToken(stepText, bad, best.value);
        lines.push(`Unknown ${prettyParamFamily(best.name)} "${bad}". Did you mean "${best.value}"?`);
        lines.push(`Did you mean: ${keyword} ${corrected}`);
        const allowed = listAllowedValues(catalog[best.name], 10);
        if (allowed) lines.push(`Allowed ${prettyParamFamily(best.name)}s: ${allowed}`);
      } else {
        // No obvious family — list a short union of all known values
        const union = listUnionAllowedValues(PCAT, 12);
        lines.push(`Unknown value "${bad}".`);
        if (union) lines.push(`Examples of allowed values: ${union}`);
      }
    }
    return lines.join('\n');
  }

  // 2) STATIC TEXT issues: suggest spelling fixes using step expression vocabulary
  const vocab = buildExprVocab(REG); // static words from registered expressions (all kinds)
  const correctedStatic = suggestStaticCorrections(stepText, vocab);

  if (correctedStatic && correctedStatic !== stepText) {
    return `Did you mean: ${keyword} ${correctedStatic}`;
  }

  // 3) If we recognized params and static looks fine but still no match,
  //    construct a paramized suggestion from nearest expression skeleton.
  const exprHit = nearestExpressionSkeleton(kind, stepText, REG);
  if (exprHit) {
    // Keep user’s tokens for params if present
    const pulled = pullUpperTokens(stepText);
    const suggested = fillSkeletonWithTokens(exprHit.expr, pulled);
    return `No ${keyword} step matches. Did you mean: ${keyword} ${suggested}`;
  }

  // 4) Fallback: generic wording
  return `No ${keyword} step matches. Check spelling or valid parameter values for: ${keyword} ${stepText}`;
}

// ---- helpers used above ------------------------------------------------------

function collectUpperTokens(s) {
  const m = s.match(/\b[A-Z][A-Z0-9_]*\b/g);
  return m ? Array.from(new Set(m)) : [];
}

function pullUpperTokens(s) {
  const tokens = [];
  s.replace(/\b([A-Z][A-Z0-9_]*)\b/g, (_, t) => { tokens.push(t); });
  return tokens;
}

// Return array of param names whose tester/values accept the token
function matchParamsForToken(token, PCAT) {
  const hits = [];
  for (const [name, p] of Object.entries(PCAT)) {
    if (p.values && p.values.has(token)) hits.push(name);
    else if (p.tester && p.tester.test(token)) hits.push(name);
  }
  return hits;
}

// Find nearest allowed value for token among catalog's params (by Levenshtein)
function nearestAllowed(token, catalog) {
  let best = null; // { name, value, dist }
  for (const [name, p] of Object.entries(catalog)) {
    const candidates = p.valuesList && p.valuesList.length ? p.valuesList : [];
    for (const v of candidates) {
      const d = editDistance(token, v);
      if (!best || d < best.dist) best = { name, value: v, dist: d };
    }
  }
  // Only suggest if reasonably close
  return (best && best.dist <= Math.max(1, Math.floor(best.value.length * 0.34))) ? best : null;
}

function listAllowedValues(p, limit = 10) {
  if (!p) return '';
  if (p.valuesList && p.valuesList.length) {
    const list = p.valuesList.slice(0, limit).join(', ');
    return p.valuesList.length > limit ? `${list}, …` : list;
  }
  return '';
}

function listUnionAllowedValues(PCAT, limit = 12) {
  const all = [];
  for (const p of Object.values(PCAT)) {
    if (p.valuesList && p.valuesList.length) {
      for (const v of p.valuesList) all.push(v);
    }
  }
  const uniq = Array.from(new Set(all)).slice(0, limit);
  return uniq.length ? uniq.join(', ') + (all.length > limit ? ', …' : '') : '';
}

function prettyParamFamily(name) {
  // heuristics for wording in messages
  if (name.toLowerCase().includes('pos')) return 'position';
  if (name.toLowerCase().includes('color')) return 'color';
  return name;
}

// Vocabulary of static words from all expression labels in the registry
function buildExprVocab(REG) {
  const words = new Set();
  for (const k of ['GIVEN', 'WHEN', 'THEN']) {
    for (const s of REG[k] || []) {
      if (!s.expr) continue;
      // remove {params}, keep words
      const plain = s.expr.replace(/\{[A-Za-z_]\w*\}/g, ' ').toLowerCase();
      for (const w of plain.split(/[^\w]+/)) {
        if (w && !/^[A-Z0-9_]+$/.test(w)) words.add(w);
      }
    }
  }
  return words;
}

// Suggest spelling fixes for static words (robot(s), position(s), moves/move, etc.)
function suggestStaticCorrections(stepText, vocab) {
  // only change lowercase words; keep SNAKE_CASE as-is here
  const parts = stepText.split(/(\b)/); // keep boundaries
  let changed = false;
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    if (!/^\w+$/.test(w)) continue;
    if (/^[A-Z0-9_]+$/.test(w)) continue; // constants untouched
    const lower = w.toLowerCase();
    if (vocab.has(lower)) continue; // exact known
    // find nearest vocab word
    let best = null;
    for (const v of vocab) {
      const d = editDistance(lower, v);
      if (!best || d < best.dist) best = { v, d };
    }
    if (best && best.d > 0 && best.d <= Math.max(1, Math.floor(best.v.length * 0.34))) {
      // replace with vocab spelling (preserve original casing loosely)
      const replacement = matchCase(best.v, w);
      parts[i] = replacement;
      changed = true;
    }
  }
  return changed ? parts.join('') : null;
}

// Try to match casing style of original word
function matchCase(target, original) {
  if (original === original.toUpperCase()) return target.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
  return target;
}

// Find nearest expression skeleton for *this kind* (use expr labels)
function nearestExpressionSkeleton(kind, stepText, REG) {
  const list = REG[kind] || [];
  let best = null; // { expr, dist }
  const canon = stepText.toLowerCase().replace(/\b[A-Z][A-Z0-9_]*\b/g, '{X}');
  for (const s of list) {
    if (!s.expr) continue;
    const skeleton = s.expr.toLowerCase().replace(/\{[A-Za-z_]\w*\}/g, '{X}');
    const d = editDistance(canon, skeleton);
    if (!best || d < best.dist) best = { expr: s.expr, dist: d };
  }
  return best;
}

// Fill "{param}" placeholders with tokens from the user line, if any
function fillSkeletonWithTokens(expr, tokens) {
  let i = 0;
  return expr.replace(/\{[A-Za-z_]\w*\}/g, () => tokens[i++] || '{VALUE}');
}

// Replace ONE whole-token occurrence (SNAKE_CASE) with a suggestion
function replaceWholeToken(line, oldTok, newTok) {
  return line.replace(new RegExp(`\\b${escapeRegex(oldTok)}\\b`), newTok);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Simple Levenshtein distance (iterative, O(mn))
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // delete
        dp[i][j - 1] + 1,      // insert
        dp[i - 1][j - 1] + cost // substitute
      );
    }
  }
  return dp[m][n];
}

function guessParamName(text) {
  const lower = text.toLowerCase();
  if (/\bpos(?:ition)?s?\b/.test(lower)) return 'pos';
  if (/\bcolor\b/.test(lower)) return 'color';
  if (/\bbucket\b/.test(lower)) return 'bucket';
  return 'value';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // --- Suggestion helpers -----------------------------------------------------
  function buildParamCatalog(PARAMS) {
    const out = {};
    for (const [name, meta] of Object.entries(PARAMS)) {
      const src = meta.source || '';
      const valuesList = Array.isArray(meta.values) ? meta.values.slice() : tryExtractValues(src);
      const values = valuesList ? new Set(valuesList) : null;
      const tester = src ? new RegExp(`^(?:${src})$`, 'i') : null;
      out[name] = { source: src, tester, values, valuesList: valuesList || [] };
    }
    return out;
  }

  function tryExtractValues(src) {
    // very simple alternation extractor: (?:A|B|C) or A|B|C (no nested groups)
    if (!src) return null;
    let s = src.trim();
    if (s.startsWith('(?:') && s.endsWith(')')) s = s.slice(3, -1);
    if (s.startsWith('(') && s.endsWith(')')) s = s.slice(1, -1);
    if (!s.includes('|')) return null;
    // split on | that are not escaped
    const parts = s.split(/(?<!\\)\|/).map(p => p.replace(/\\\|/g, '|'));
    // bail if any meta chars that likely mean "not a simple list"
    if (parts.some(p => /[.*+?^${}()[\]\\]/.test(p))) return null;
    return parts.filter(Boolean);
  }

  function tokenize(text) {
    return text.split(/[^\w]+/).filter(Boolean);
  }

  function replaceTokensWithParams(stepText, hits, PCAT) {
    // Choose first param name for each token; if multiple, pick the shortest name
    const choice = {};
    for (const h of hits) {
      const chosen = h.paramNames.slice().sort((a,b)=>a.length-b.length)[0];
      choice[h.token] = chosen;
    }
    const used = new Set(Object.values(choice));
    // replace only whole-token matches
    let expr = stepText.replace(/\b([A-Z][A-Z0-9_]*)\b/g, (m, tok) => {
      const name = choice[tok];
      return name ? `{${name}}` : m;
    });
    return { expr, usedParamNames: used };
  }

  function guessParamName(text) {
    // quick heuristics: look for 'position', 'color', 'speed', etc.
    const lower = text.toLowerCase();
    if (/\bpos(?:ition)?\b/.test(lower)) return 'pos';
    if (/\bcolor\b/.test(lower)) return 'color';
    if (/\bspeed\b/.test(lower)) return 'speed';
    if (/\bangle\b/.test(lower)) return 'angle';
    if (/\bname\b/.test(lower)) return 'name';
    return 'value';
  }

  function collectSampleUpperTokens(text) {
    const toks = tokenize(text);
    return toks.filter(t => /^[A-Z][A-Z0-9_]*$/.test(t)).slice(0, 5);
  }

  function escapeForExpr(s) {
    // Escape only chars that matter in a plain string expression (not a regex)
    // We keep braces {} literal; compileExpression will consume them.
    return s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, ' ');
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function code(s) { return '```js\n' + s + '\n```'; }
  function extractLineFromError(e) {
    const m = /line\s+(\d+)/i.exec(String(e && e.message));
    return m ? Number(m[1]) : null;
  }

  // Expose the upgraded validator
  globalThis.GherkinEval = Object.assign(globalThis.GherkinEval || {}, {
    validateBindings
  });
})();