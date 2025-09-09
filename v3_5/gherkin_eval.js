/**
 * Keyword-aware registry + runner.
 * Expects globalThis.GherkinParser (parse, expandOutlines).
 */
(function () {
  if (!globalThis.GherkinParser)
    throw new Error("Load gherkin-parser-standalone.js first.");
  // ---- Parameter types ---------------------------------------------------------
  const PARAMS = Object.create(null);

  /**
   * defineParam('pos', ['POSITION_START','POSITION_END'])
   * defineParam('color', /RED|GREEN|BLUE/i)
   * defineParam('id', '(?:R\\d{3}|G\\d{3})')  // raw regex source (non-capturing preferred)
   */
  function defineParam(name, spec) {
    if (!/^[A-Za-z_]\w*$/.test(name)) {
      throw new Error(
        `Invalid param name "${name}". Use letters, digits, underscore; cannot start with a digit.`
      );
    }
    let source;
    if (Array.isArray(spec)) {
      if (spec.length === 0) throw new Error("Param list cannot be empty.");
      const alts = spec.map((v) => escapeRegex(String(v)));
      source = `(?:${alts.join("|")})`;
    } else if (spec instanceof RegExp) {
      source = spec.source; // flags handled at compile time; keep pattern clean
    } else if (typeof spec === "string") {
      source = spec; // treat as raw regex source
    } else {
      throw new Error(
        "defineParam spec must be an array, RegExp, or string (regex source)."
      );
    }
    PARAMS[name] = { source };
  }

  /** Compile "the robot moves to position {pos}" -> /^...(?<pos>...param...$)/i */
  function compileExpression(expr, flags = "i") {
    const parts = [];
    const paramNames = [];
    let last = 0;
    const re = /\{([A-Za-z_]\w*)\}/g;
    let m;
    while ((m = re.exec(expr))) {
      const [whole, name] = m;
      if (!(name in PARAMS)) {
        throw new Error(
          `Unknown parameter type "{${name}}" in expression "${expr}". Define it with defineParam().`
        );
      }
      const staticText = expr.slice(last, m.index);
      if (staticText) parts.push(escapeRegex(staticText));
      parts.push(`(?<${name}>${PARAMS[name].source})`); // named capture
      paramNames.push(name);
      last = m.index + whole.length;
    }
    const tail = expr.slice(last);
    if (tail) parts.push(escapeRegex(tail));

    const src = `^\\s*${parts.join("")}\\s*$`;
    const regex = new RegExp(src, flags);
    return { regex, paramNames };
  }

  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ---- Expression-based step helpers ------------------------------------------
  function defineGivenExpr(expr, fn, flags) {
    const { regex } = compileExpression(expr, flags);
    defineStep("GIVEN", regex, fn, expr);
  }
  function defineWhenExpr(expr, fn, flags) {
    const { regex } = compileExpression(expr, flags);
    defineStep("WHEN", regex, fn, expr);
  }
  function defineThenExpr(expr, fn, flags) {
    const { regex } = compileExpression(expr, flags);
    defineStep("THEN", regex, fn, expr);
  }

  // --- Step registry (keyed by GIVEN/WHEN/THEN) ------------------------------
  const REG = { GIVEN: [], WHEN: [], THEN: [] };

  // Allow an optional "expr" label for debugging
  function defineStep(kind, pattern, fn, exprLabel) {
    const K = String(kind).toUpperCase();
    if (!REG[K]) throw new Error(`Unknown step kind: ${kind}`);
    if (!(pattern instanceof RegExp)) {
      throw new Error(
        "Step pattern must be a RegExp (use *Expr helpers to compile expressions)."
      );
    }
    // Strip 'g' to avoid lastIndex pitfalls
    const clean = new RegExp(pattern.source, pattern.flags.replace(/g/g, ""));
    REG[K].push({ pattern: clean, fn, expr: exprLabel || null });
  }

  function findStep(kind, text) {
    const list = REG[kind] || [];
    for (const s of list) {
      s.pattern.lastIndex = 0;
      const m = s.pattern.exec(text);
      if (m) {
        return {
          handler: s.fn,
          params: m.groups || {}, // ← named groups
          captures: m
            .slice(1)
            .map((v) => (typeof v === "string" ? v.trim() : v)),
          pattern: s.pattern,
          expr: s.expr,
        };
      }
    }
    return null;
  }

  // Inherit "And/But" from previous concrete kind
  function resolveKind(keywordType, lastKind) {
    if (keywordType === "AND" || keywordType === "BUT") return lastKind;
    return keywordType; // GIVEN/WHEN/THEN
  }

  // “World” factory — customize to your robot
  function makeWorld() {
    return {
      robots: {},
      robot: { angleDeg: 0, ready: true, position: null, piece: null },
    };
  }

  // --- Runner that treats Given as guards ------------------------------------
  function runFeatureText(featureText) {
    const parsed = GherkinParser.parse(featureText);
    const expanded = GherkinParser.expandOutlines(parsed);

    const results = [];
    if (!expanded.feature) return { results, ok: true };

    runContainer(expanded.feature, results);
    return { results, ok: results.every((r) => r.ok || r.skipped) };
  }

  function runContainer(container, results) {
    for (const child of container.children || []) {
      if (child.type === "Rule") {
        runContainer(child, results);
        continue;
      }
      if (child.type === "Background") continue; // robot mode: ignore Backgrounds

      if (child.type === "Scenario") {
        const world = makeWorld();
        const entry = {
          scenario: child.name || "(unnamed scenario)",
          ok: true,
          skipped: false,
          error: null,
        };

        let lastKind = null;
        try {
          for (const st of child.steps || []) {
            let kind = resolveKind(st.keywordType, lastKind);
            if (!kind)
              throw new Error(
                `"${st.keyword}" cannot start a scenario: "${st.keyword} ${st.text}"`
              );

            const stepText = st.text.trim(); // MATCH WITHOUT LEADING KEYWORD

            const found = findStep(kind, stepText);

            if (found === null)
              throw new Error(
                `No step definition matches (${kind}): "${stepText}"`
              );
            const { handler, params, captures } = found;

            if (kind === "GIVEN") {
              const ok = handler(world, params, captures);
              if (ok === false) {
                entry.skipped = true;
                break;
              }
            } else if (kind === "WHEN" || kind === "THEN") {
              handler(world, params, captures);
            } else {
              throw new Error(`Unsupported step kind: ${kind}`);
            }
            lastKind = kind;
          }
        } catch (err) {
  // Normalize to an Error and fail-fast
  const wrapped = err instanceof Error ? err : new Error(String(err));
  entry.ok = false;
  entry.error = wrapped.message;
  results.push(entry);      // record the failure for inspection
  throw wrapped;            // <-- STOP: reject runFeatureTextAsync()
}
        results.push(entry);
      }
    }
  }
  // (if you expose debug registry)
  globalThis.GherkinEval = Object.assign(globalThis.GherkinEval || {}, {
    defineParam,
    defineGivenExpr,
    defineWhenExpr,
    defineThenExpr,
    runFeatureText,
    _debugRegistry: REG,
    _debugParams: PARAMS,
  });
  /* 
  // Expose API
  globalThis.GherkinEval = {
    defineStep,
    defineGiven,
    defineWhen,
    defineThen,
    runFeatureText,
    _debugRegistry: REG,
  };*/


// (if you expose debug registry)
  globalThis.GherkinEval = Object.assign(globalThis.GherkinEval || {}, {
    defineParam,
    defineGivenExpr,
   
    defineWhenExpr,
    defineThenExpr,
       runFeatureText,
    _debugRegistry: REG,
    _debugParams: PARAMS,
  });
   
  
  
  // ──────────────────────────────────────────────────────────────
  // Async runner: await each step (Promise or callback control)
  // Exposes: GherkinEval.runFeatureTextAsync(text)
  // ──────────────────────────────────────────────────────────────
 // ── Async runner that honors pause/resume/stop ───────────────────────────────
(function () {
  if (!globalThis.GherkinParser) throw new Error('Load parser first.');

  // optional: step timeout (disabled if undefined)
  GherkinEval.stepTimeoutMs = GherkinEval.stepTimeoutMs ?? undefined;
// tokens to indicate a stop
const STOP_SCENARIO = Symbol('STOP_SCENARIO');
const STOP_FEATURE  = Symbol('STOP_FEATURE');

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let t;
  const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`Step "${label}" timed out after ${ms}ms`)), ms); });
  return Promise.race([promise.finally(() => clearTimeout(t)), to]);
}

// Await one step; race it with the stop signal
async function runHandler(handler, world, params, captures, stepLabel, stepTimeoutMs) {
  // callback-style control
  let _resolve, _reject;
  const control = {
    next: (value) => _resolve(value),
    done: (err, value) => err ? _reject(err) : _resolve(value),
  };
  const controlPromise = new Promise((res, rej) => { _resolve = res; _reject = rej; });

  let ret;
  try {
    ret = handler(world, params || {}, captures || [], control);
  } catch (e) {
    throw e;
  }

  const stopPromise = GherkinEval._waitForStop();

  // Promise/async style
  if (ret && typeof ret.then === 'function') {
    const raced = await withTimeout(Promise.race([ret, stopPromise]), stepTimeoutMs, stepLabel);
    if (raced === 'feature') return STOP_FEATURE;
    if (raced === 'scenario') return STOP_SCENARIO;
    return raced;
  }

  // callback style
  if (handler.length >= 4) {
    const raced = await withTimeout(Promise.race([controlPromise, stopPromise]), stepTimeoutMs, stepLabel);
    if (raced === 'feature') return STOP_FEATURE;
    if (raced === 'scenario') return STOP_SCENARIO;
    return raced;
  }

  // sync
  return ret;
}

  async function runFeatureTextAsync(featureText, { stepTimeoutMs = GherkinEval.stepTimeoutMs } = {}) {
    const parsed   = GherkinParser.parse(featureText);
    const expanded = GherkinParser.expandOutlines(parsed);

    const results = [];
    if (!expanded.feature) return { results, ok: true };

    const ctl = GherkinEval._controlState;

    async function runContainer(container) {
      for (const child of container.children || []) {
        if (child.type === 'Rule') { await runContainer(child); continue; }
        if (child.type === 'Background') continue;

        if (child.type === 'Scenario') {
          const world = (typeof GherkinEval.makeWorld === 'function')
            ? GherkinEval.makeWorld()
            : { robot: { ready: true } };

          const entry = { scenario: child.name || '(unnamed scenario)', ok: true, skipped: false, stopped: false, error: null };
          let lastKind = null;

          try {
            // pause/stop checks BEFORE first step
            await GherkinEval.waitIfPaused();
            if (ctl.stopFeature) return;
            if (ctl.stopScenario) { entry.ok = false; entry.stopped = true; results.push(entry); ctl.stopScenario = false; continue; }

            for (const st of (child.steps || [])) {
              // pause/stop between steps
              await GherkinEval.waitIfPaused();
              if (ctl.stopFeature) return;
              if (ctl.stopScenario) { entry.ok = false; entry.stopped = true; entry.error = 'Stopped by user'; ctl.stopScenario = false; break; }

              let kind = (st.keywordType === 'AND' || st.keywordType === 'BUT') ? lastKind : st.keywordType;
              if (!kind) throw new Error(`"${st.keyword}" cannot start a scenario: ${st.keyword} ${st.text}`);
              
              

              const stepText  = st.text.trim();
              const stepLabel = `${st.keyword} ${stepText}`;
              const found = findStep(kind, stepText);
              const line      = (st.location && st.location.line) || 1;
const column    = (st.location && st.location.column) || 1;
              
                        // tell the UI we’re about to run this step
GherkinEval._emitStep('start', {
  line, column, text: stepText, keyword: st.keyword, kind, scenario: entry.scenario
});

              if (found === null) throw new Error(`No ${kind} definition matches: "${stepText}"`);
              const { handler, params, captures } = found;


              
// In your main step loop, handle STOP_* outcomes:
const outcome = await runHandler(found.handler, world, params, captures, stepLabel, stepTimeoutMs);

if (outcome === STOP_FEATURE) {
  entry.ok = false; entry.stopped = true; entry.error = 'Stopped by user (feature)';
    GherkinEval._emitStep('stop', { line, column, text: stepText, keyword: st.keyword, kind, scenario: entry.scenario, scope: 'feature' });

  results.push(entry);
  GherkinEval._consumeStop();
  return; // bail out entirely
}
if (outcome === STOP_SCENARIO) {
  entry.ok = false; entry.stopped = true; entry.error = 'Stopped by user (scenario)';
  GherkinEval._consumeStop();
  break; // leave this scenario, continue to next
}
              // `false` softly stops the scenario, no throw
              if (outcome === false) {
                if (kind === 'GIVEN') { 
                      GherkinEval._emitStep('skip', { line, column, text: stepText, keyword: st.keyword, kind, scenario: entry.scenario });

                  
                  entry.skipped = true; }
                else { 
                      GherkinEval._emitStep('stop', { line, column, text: stepText, keyword: st.keyword, kind, scenario: entry.scenario });

                  entry.ok = false; entry.stopped = true; entry.error = `${stepLabel} returned false`; }
                break;
              }
// success
GherkinEval._emitStep('end', {
  line, column, text: stepText, keyword: st.keyword, kind, scenario: entry.scenario
});
              lastKind = kind;
            }
          } catch (err) {
  // Normalize to an Error and fail-fast
  const wrapped = err instanceof Error ? err : new Error(String(err));
  entry.ok = false;
  entry.error = wrapped.message;
  results.push(entry);      // record the failure for inspection
  throw wrapped;            // <-- STOP: reject runFeatureTextAsync()
}

          results.push(entry);
          if (ctl.stopFeature) return; // if user requested full stop during scenario
        }
      }
    }

    await runContainer(expanded.feature);
    const ok = results.every(r => r.ok || r.skipped);
    return { results, ok };
  }

  Object.assign(globalThis.GherkinEval, { runFeatureTextAsync });
})();


  
})();


// ── Pause/Resume/Stop controls ───────────────────────────────────────────────
(function () {
  const state = {
    paused: false,
    pausePromise: null,
    pauseResolve: null,

    stopScenario: false,
    stopFeature:  false,

    // one-shot stop promise (resolves with 'scenario' or 'feature')
    stopDeferred: null,
    stopResolve: null,
  };

  async function waitIfPaused() {
    while (state.paused) {
      if (!state.pausePromise) state.pausePromise = new Promise(res => (state.pauseResolve = res));
      await state.pausePromise;
    }
  }

  function pause() {
    if (!state.paused) {
      state.paused = true;
      state.pausePromise = new Promise(res => (state.pauseResolve = res));
    }
  }

  function resume() {
    if (state.paused) {
      state.paused = false;
      const r = state.pauseResolve; state.pauseResolve = null;
      const p = state.pausePromise; state.pausePromise = null;
      r && r();
    }
  }

  function waitForStop() {
    if (state.stopFeature) return Promise.resolve('feature');
    if (state.stopScenario) return Promise.resolve('scenario');
    if (!state.stopDeferred) state.stopDeferred = new Promise(res => (state.stopResolve = res));
    return state.stopDeferred;
  }

  function consumeStop() {
    const kind = state.stopFeature ? 'feature' : state.stopScenario ? 'scenario' : null;
    state.stopFeature = false;
    state.stopScenario = false;
    state.stopDeferred = null;
    state.stopResolve = null;
    return kind;
  }

  // scope: 'scenario' | 'feature' (default: 'scenario')
  function stop(scope = 'scenario') {
    if (scope === 'feature' || scope === 'all') state.stopFeature = true;
    else state.stopScenario = true;
    // wake any waiters
    if (state.stopResolve) state.stopResolve(state.stopFeature ? 'feature' : 'scenario');
    // make sure pauses don't hold us
    resume();
  }

  Object.assign(globalThis.GherkinEval, {
    pause, resume, stop, waitIfPaused,
    _controlState: state,
    _waitForStop: waitForStop,
    _consumeStop: consumeStop,
  });
})();

// -- Step listener API ---------------------------------------------------------
(function () {
  function setStepListener(fn) { GherkinEval._stepListener = typeof fn === 'function' ? fn : null; }
  function clearStepListener() { GherkinEval._stepListener = null; }

  function _emitStep(status, info) {
    const fn = GherkinEval._stepListener;
    if (!fn) return;
    try { fn({ status, ...info }); }
    catch (e) { /* never crash the runner because UI code failed */ }
  }

  Object.assign(globalThis.GherkinEval, { setStepListener, clearStepListener, _emitStep });
})();


