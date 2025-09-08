
(function () {
  if (!globalThis.GherkinParser) throw new Error('Load gherkin-parser-standalone.js first.');

  // ─────────────────────────── VALIDATOR ENTRY ───────────────────────────
  function validateSyntax(gherkinText, {
    mode = 'robot',
    requireGivenFirst = true,
    requireThenLast  = true,
    requirePhasePresence = true, // require at least one When and one Then
  } = {}) {
    const errors = [];
    const warnings = [];

    // Pre-parse friendly checks
    scanHeaderTypos(gherkinText, errors);       // "senario:" → suggest "Scenario:"
    scanStepKeywordTypos(gherkinText, errors);  // "givn" → suggest "Given"
    checkDocStringFences(gherkinText, errors);  // unclosed """/``` fences

    // Bail early if we already have fatal issues
    if (errors.length) return { ok: false, errors, warnings };

    // Parse with your GherkinParser
    let doc;
    try {
      doc = GherkinParser.parse(gherkinText);
    } catch (e) {
      errors.push({ line: extractLine(e) || 1, column: 1, message: String(e.message || e) });
      return { ok: false, errors, warnings };
    }

    const feature = doc && doc.feature;
    if (!feature) {
      errors.push({ line: 1, column: 1, message: 'Missing Feature' });
      return { ok: false, errors, warnings };
    }

    walkContainer(feature);
    return { ok: errors.length === 0, errors, warnings };

    // ─────────────────────────── WALKERS ───────────────────────────
    function walkContainer(container) {
      for (const child of container.children || []) {
        if (child.type === 'Rule') {
          walkContainer(child);
        } else if (child.type === 'Background') {
          if (mode === 'robot') {
            warnings.push({
              line: child.location.line,
              column: 1,
              message: 'Background is ignored in robot mode; put preconditions as Given steps inside each Scenario.'
            });
          }
        } else if (child.type === 'Scenario') {
          validateScenario(child);
        }
      }
    }

    function validateScenario(sc) {
      // Examples are only allowed on outlines
      if (sc.examples && sc.examples.length && sc.keywordType !== 'ScenarioOutline') {
        for (const ex of sc.examples) {
          errors.push({ line: ex.location.line, column: 1, message: 'Examples are only valid with "Scenario Outline".' });
        }
      }

      if (!sc.steps || sc.steps.length === 0) {
        warnings.push({ line: sc.location.line, column: 1, message: 'Scenario has no steps.' });
        return;
      }

      // Resolve And/But inheritance and collect ordering info
      const resolved = [];
      let lastKind = null;
      for (const st of sc.steps) {
        let kind = st.keywordType;
        if (kind === 'AND' || kind === 'BUT') {
          if (!lastKind) {
            errors.push({
              line: st.location.line, column: 1,
              message: `"${st.keyword}" cannot start a scenario.`,
              hint: `Did you mean: Given ${st.text}`
            });
            kind = 'GIVEN'; // assume Given so we can continue validation
          } else {
            kind = lastKind;
          }
        }
        resolved.push({ node: st, kind });
        lastKind = kind;
      }

      // Robot-mode rules
      if (mode === 'robot') {
        // 1) must start with Given
        const first = resolved[0];
        if (requireGivenFirst && first.kind !== 'GIVEN') {
          errors.push({
            line: first.node.location.line, column: 1,
            message: `Scenario must start with "Given", found "${first.node.keyword}".`,
            hint: `Did you mean: Given ${first.node.text}`
          });
        }

        // 2) must end with Then
        const last = resolved[resolved.length - 1];
        if (requireThenLast && last.kind !== 'THEN') {
          errors.push({
            line: last.node.location.line, column: 1,
            message: `Scenario must end with "Then", found "${last.node.keyword}".`,
            hint: `Did you mean: Then ${last.node.text}`
          });
        }

        // 3) phase ordering: Given* -> When* -> Then*
        let phase = 'G'; // G → W → T
        let countWhen = 0, countThen = 0;

        for (const { node, kind } of resolved) {
          // Table width check (optional but handy)
          if (node.argument && node.argument.type === 'DataTable') {
            const rows = node.argument.rows || [];
            if (rows.length) {
              const width = (rows[0].cells || []).length;
              for (const r of rows) {
                if (!r.cells || r.cells.length !== width) {
                  errors.push({
                    line: r.location.line, column: 1,
                    message: `Data table row has ${r.cells ? r.cells.length : 0} cells; expected ${width}.`
                  });
                }
              }
            }
          }

          if (kind === 'GIVEN') {
            if (phase !== 'G') {
              errors.push({ line: node.location.line, column: 1, message: 'Given must appear before When/Then in robot mode.' });
            }
          } else if (kind === 'WHEN') {
            if (phase === 'G') phase = 'W';
            if (phase === 'T') {
              errors.push({ line: node.location.line, column: 1, message: 'When cannot appear after Then.' });
            }
            countWhen++;
          } else if (kind === 'THEN') {
            if (phase === 'G') {
              errors.push({ line: node.location.line, column: 1, message: 'Then cannot appear before When.' });
            }
            phase = 'T';
            countThen++;
          }
        }

        // 4) optionally require presence of When/Then
        if (requirePhasePresence) {
          if (countWhen === 0) {
            errors.push({ line: sc.location.line, column: 1, message: 'Scenario must include at least one "When" step in robot mode.' });
          }
          if (countThen === 0) {
            errors.push({ line: sc.location.line, column: 1, message: 'Scenario must include at least one "Then" step in robot mode.' });
          }
        }
      }
    }
  }

  // ─────────────────────────── helpers ───────────────────────────
  const KNOWN_HEADERS = ['Feature','Rule','Background','Scenario','Scenario Outline','Scenario Template','Examples'];
  const STEP_WORDS    = ['Given','When','Then','And','But'];

  function scanHeaderTypos(text, errors) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let fence = null, fenceIndent = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      // docstring fences
      if (!fence) {
        const open = /^(\s*)(?:"""|```)/.exec(raw);
        if (open) { fence = raw.trim().startsWith('```') ? '```' : '"""'; fenceIndent = (open[1]||'').length; continue; }
      } else {
        if (raw.trimStart().startsWith(fence) && leading(raw) <= fenceIndent) { fence = null; fenceIndent = 0; }
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(raw)) continue; // table
      const m = /^\s*([A-Za-z][A-Za-z ]*[A-Za-z])\s*:/.exec(raw);
      if (!m) continue;
      const found = m[1].trim();
      const known = KNOWN_HEADERS.find(h => h.toLowerCase() === found.toLowerCase());
      if (known) continue;
      const best = nearest(found, KNOWN_HEADERS);
      if (best && best.dist <= Math.max(2, Math.floor(best.word.length * 0.34))) {
        const after = raw.split(':',2)[1] || '';
        errors.push({ line: i+1, column: 1, message: `Unknown header "${found}:"`, hint: `Did you mean: ${best.word}:${after}` });
      }
    }
  }

  function scanStepKeywordTypos(text, errors) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    let fence = null, fenceIndent = 0;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!fence) {
        const mOpen = /^(\s*)(?:"""|```)/.exec(raw);
        if (mOpen) { fence = raw.trim().startsWith('```') ? '```' : '"""'; fenceIndent = (mOpen[1]||'').length; continue; }
      } else {
        if (raw.trimStart().startsWith(fence) && leading(raw) <= fenceIndent) { fence = null; fenceIndent = 0; }
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(raw)) continue; // table
      if (/^\s*@\w/.test(raw)) continue;        // tags
      if (/^\s*#/.test(raw)) continue;          // comment
      // ignore headers (have colon soon)
      const nocmt = raw.replace(/\s+#.*$/, '');
      if (nocmt.includes(':')) continue;

      const m = /^\s*([A-Za-z]+)\b(\s+.*)?$/.exec(raw);
      if (!m) continue;
      const token = m[1];
      const ok = STEP_WORDS.some(w => w.toLowerCase() === token.toLowerCase());
      if (ok) continue;
      const best = nearest(token, STEP_WORDS);
      if (best && best.dist <= Math.max(1, Math.floor(best.word.length * 0.34))) {
        errors.push({ line: i+1, column: 1, message: `Unknown step keyword "${token}"`, hint: `Did you mean: ${best.word}${m[2] || ''}` });
      }
    }
  }

  function checkDocStringFences(text, errors) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const stack = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const open = /^(\s*)(?:"""|```)/.exec(ln);
      if (open) {
        const fence = ln.trim().startsWith('```') ? '```' : '"""';
        stack.push({ fence, indent: (open[1]||'').length, line: i+1 });
        continue;
      }
      if (stack.length) {
        const top = stack[stack.length-1];
        if (ln.trimStart().startsWith(top.fence) && leading(ln) <= top.indent) {
          stack.pop();
        }
      }
    }
    for (const unclosed of stack) {
      errors.push({ line: unclosed.line, column: 1, message: `Unclosed doc string fence ${unclosed.fence}` });
    }
  }

  // ─────────────────────────── tiny utils ───────────────────────────
  function nearest(word, candidates) {
    let best = null;
    const a = word.toLowerCase();
    for (const c of candidates) {
      const d = lev(a, c.toLowerCase());
      if (!best || d < best.dist) best = { word: c, dist: d };
    }
    return best;
  }

  function lev(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i-1] === b[j-1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
      }
    }
    return dp[m][n];
  }

  function leading(s) { const m = s.match(/^\s*/); return m ? m[0].length : 0; }
  function extractLine(e) { const m = /line\s+(\d+)/i.exec(String(e && e.message)); return m ? Number(m[1]) : null; }

  // expose
  globalThis.GherkinEval = Object.assign(globalThis.GherkinEval || {}, { validateSyntax });
})();

