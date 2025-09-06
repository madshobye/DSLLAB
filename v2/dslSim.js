let startcodeDSL = `
Feature: Robot sorting

Scenario: "My first scenario"
Given...
When... 
Then...
`


let solutionDSL = `
Feature: Robot Task Control

# Sort one piece

Scenario: "Grabbing a piece"
Given the robot is ready
When the robot moves to position START_POS
And the robot grabs the piece
Then the robot has a piece

Scenario: "Sorting RED object"
Given the piece is RED
When the robot moves to position RED_POS
And the piece is dropped
Then the RED_POS has a RED piece

Scenario: "Sorting BLUE object"
Given the piece is BLUE
When the robot moves to position BLUE_POS
And the piece is dropped
Then the BLUE_POS has a BLUE piece

Scenario: "Sorting GREEN object"
Given the piece is GREEN
When the robot moves to position GREEN_POS
And the piece is dropped
Then the GREEN_POS has a GREEN piece

# Sort one piece

Scenario: "Grabbing a piece"
Given the robot is ready
When the robot moves to position START_POS
And the robot grabs the piece
Then the robot has a piece

Scenario: "Sorting RED object"
Given the piece is RED
When the robot moves to position RED_POS
And the piece is dropped
Then the RED_POS has a RED piece

Scenario: "Sorting BLUE object"
Given the piece is BLUE
When the robot moves to position BLUE_POS
And the piece is dropped
Then the BLUE_POS has a BLUE piece

Scenario: "Sorting GREEN object"
Given the piece is GREEN
When the robot moves to position GREEN_POS
And the piece is dropped
Then the GREEN_POS has a GREEN piece

# Sort one piece

Scenario: "Grabbing a piece"
Given the robot is ready
When the robot moves to position START_POS
And the robot grabs the piece
Then the robot has a piece

Scenario: "Sorting RED object"
Given the piece is RED
When the robot moves to position RED_POS
And the piece is dropped
Then the RED_POS has a RED piece

Scenario: "Sorting BLUE object"
Given the piece is BLUE
When the robot moves to position BLUE_POS
And the piece is dropped
Then the BLUE_POS has a BLUE piece

Scenario: "Sorting GREEN object"
Given the piece is GREEN
When the robot moves to position GREEN_POS
And the piece is dropped
Then the GREEN_POS has a GREEN piece

# Stacking the objects

Scenario: "Place GREEN object"
Given the GREEN_POS has a GREEN piece
When the robot moves to position GREEN_POS
And the robot grabs the piece
And the robot moves to position END_POS
And the piece is dropped
Then the END_POS has a GREEN piece

Scenario: "Place RED object"
Given the RED_POS has a RED piece
When the robot moves to position RED_POS
And the robot grabs the piece
And the robot moves to position END_POS
And the piece is dropped
Then the END_POS has a RED piece

Scenario: "Place BLUE object"
Given the BLUE_POS has a BLUE piece
When the robot moves to position BLUE_POS
And the robot grabs the piece
And the robot moves to position END_POS
And the piece is dropped
Then the END_POS has a BLUE piece


`;

// Allowed positions / colors used in your text
GherkinEval.defineParam("pos", [
  "START_POS",
  "RED_POS",
  "GREEN_POS",
  "BLUE_POS",
  "END_POS",
]);
GherkinEval.defineParam("color", ["RED", "GREEN", "BLUE"]);

// GPT GHERKIN

// Given the robot is ready
GherkinEval.defineGivenExpr("the robot is ready", (world) => {
  // ensureWorld(world);

  return true;
});

// Given the piece is {color}
GherkinEval.defineGivenExpr("the piece is {color}", (world, { color }) => {
  return arm.isColor(color);
});

// Given the {pos} has a {color} piece
GherkinEval.defineGivenExpr(
  "the {pos} has a {color} piece",
  (world, { pos, color }) => {
    let container = simulator.containers[containerColors[pos]];

    if (
      container.pieces.length > 0 &&
      container.pieces[container.pieces.length - 1].c == color
    ) {
      debug(
        "It is a match " +
          container.pieces[container.pieces.length - 1].c +
          " " +
          container.name
      );
      return true;
    }
    return false;
  }
);

// Move
GherkinEval.defineWhenExpr(
  "the robot moves to position {pos}",
  (world, { pos }, _captures, control) => {
    simulator.gotoBlocked(containerColors[pos], (err) => {
      if (err) return control.done(err);
      control.next(); // signal completion
    });
  }
);

// Grab (two phrasings)

GherkinEval.defineWhenExpr(
  "the robot grabs the piece",
  (world, par, _captures, control) => {
    simulator.arm.pickPieceBlocked(control.next());
  }
);

// Drop
GherkinEval.defineWhenExpr(
  "the piece is dropped",
  (world, par, _captures, control) => {
    simulator.arm.dropPieceBlocked(control.next());
  }
);

// Then the robot has a piece
GherkinEval.defineThenExpr("the robot has a piece", (world) => {
  if (arm.pieces.length == 0) throw new Error("Robot is not holding a piece");
});

// Then the {pos} has a {color} piece
GherkinEval.defineThenExpr(
  "the {pos} has a {color} piece",
  (world, { pos, color }) => {
    //ensureWorld(world);

    let container = simulator.containers[containerColors[pos]];

    const ok =
      container.pieces.length > 0 &&
      container.pieces[container.pieces.length - 1].c == color;
    if (!ok) throw new Error(`${pos} does not have a ${color} piece`);
  }
);

async function runDSL() {
  beautify.beautify(editor.session);
  lineStepCounter = -2;

  // gherkin code
  let gherkinCode = editor.getValue();
  // validate
  const report = GherkinEval.validateSyntax(gherkinCode, { mode: "robot" });
  printErrorTable(report.errors);
  printErrorTable(report.warnings);
  //console.log("OK?", report.ok);

  const reportBindings = GherkinEval.validateBindings(gherkinCode);
  // Inspect
printErrorTable(reportBindings.errors);
 printErrorTable(reportBindings.warnings);
 // console.log(reportBindings.summary); // { totalScenarios, totalSteps, missingSteps, ambiguousSteps }
 // console.log("OK?", reportBindings.ok);

  if (reportBindings.ok && report.ok) {
    GherkinEval.stepTimeoutMs = 30000; // 30s per step (optional)
    running = true;
    clearAllMarkers();
   // editor.clearSelection(); 
    GherkinEval.runFeatureTextAsync(gherkinCode)
      .then(({ results, ok }) => {
        running = false;
     //   console.table(results);
     //   console.log("All good?", ok);
        debug("Done...");
      })
      .catch((err) => {
       
        if (err.line) {
          /*  const lineNumber = match[1];
      const columnNumber = match[2];*/

          debug(`Error at line ${err.line}:  ${err.message}`, true);
          editor.session.addMarker(
            new Range(err.line - 1, 0, err.line - 1, 1),
            "myMarker",
            "fullLine"
          );
        } else {
          debug(err, true);
        }

        running = false;

  
      });
 
  }
  else
  {
    debug("There are syntax errors so the code cannot run");
  }
}

function printErrorTable(table)
{
  print(table);
  for(let i = 0; i < table.length; i ++)
  {
    let msg = "";
    if(table[i].hint)
      msg = table[i].hint;
    else
      msg = table[i].message;
    
  debug("L " + table[i].line + ": " + table[i].hint );
  }
  
}

GherkinEval.setStepListener(({ status, line, column, text, keyword, kind, scenario, scope, error }) => {
  // Minimal requirement: highlight by line
    clearAllMarkers();
 editor.session.addMarker(
            new Range(line - 1, 0, line - 1, 1),
            "myMarker",
            "fullLine"
          );
  editor.scrollToLine(line, true, true);
  // Optional: finer UX
  if (status === 'start') editor.showGutterIcon(line, '▶');
  if (status === 'end')   editor.showGutterIcon(line, '✓');
  if (status === 'skip')  editor.showGutterIcon(line, '⤼');
  if (status === 'stop')  editor.showGutterIcon(line, scope === 'feature' ? '■' : '◼');
  if (status === 'error') editor.markError(line, error || 'Step failed');
});

function getLine(txt, number) {
  const lines = txt.split("\n");
  return lines[number - 1];
}

let lineStepCounter = 0;

function nextStepDSL(oneStep = false) {}



/// error marking


// ---- Convert validator reports to Ace annotations ----------------------------
function toAnno(items, typeDefault) {
  // Ace rows/cols are 0-based; our validators are 1-based.
  
   
  return (items || []).map(e => ({
    row: Math.max(0, (e.line   || 1) - 1),
    column: Math.max(0, (e.column || 1) - 1),
    text: pickMSG(e),
    
    /*[e.message, e.hint, e.details && [].concat(e.details).join('\n')]
            .filter(Boolean).join(' — '),*/
    
    
    type: typeDefault // 'error' | 'warning' | 'info'
  }));
}

function pickMSG(item)
{
  let msg = "";
    if(item.hint)
      msg = item.hint;
    else
      msg = item.message;
  return msg;
}

// ---- Lightweight line markers (background spans) -----------------------------

let markerIds = []; // keep track so we can remove old markers

function clearMarkers() {
  for (const id of markerIds) editor.session.removeMarker(id);
  markerIds = [];
}

function addLineMarker(row, isError) {
  const line = editor.session.getLine(row) || '';
  const range = new Range(row, 0, row, Math.max(1, line.length));
  const klass = isError ? "ace_error-line" : "ace_warning-line";
  const id = editor.session.addMarker(range, klass, "fullLine");
  markerIds.push(id);
}

// ---- Run both validators and show results -----------------------------------
function validateAndAnnotate() {
  const text = editor.session.getValue();

  // 1) run validators
  const syn = GherkinEval.validateSyntax(text, { mode: 'robot' });
  const bind = GherkinEval.validateBindings(text);

  // 2) build Ace annotations
  const ann = [
    ...toAnno(syn.errors,   'error'),
    ...toAnno(syn.warnings, 'warning'),
    ...toAnno(bind.errors,  'error'),
    ...toAnno(bind.warnings,'warning'),
  ];

  // 3) apply gutter annotations
  editor.session.setAnnotations(ann);

  // 4) (optional) soft line highlight markers
  clearMarkers();
  for (const a of ann) addLineMarker(a.row, a.type === 'error');
}

  // ---- Debounce (parse is not cheap) -------------------------------------------
const debounce = (fn, ms=200) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

