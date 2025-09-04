
let startcodeJS = `var START_POS = "START_POS";
var END_POS = "END_POS";
var RED_POS = "RED_POS";
var GREEN_POS = "GREEN_POS";
var BLUE_POS = "BLUE_POS";
var RED = "red";
var GREEN = "green";
var BLUE = "blue";

gotoPos(START_POS);
grab();
if (isColor(RED)) {
    gotoPos(RED_POS);
    drop();
} else if (isColor(GREEN)) {
    gotoPos(GREEN_POS);
    drop();
} else if (isColor(BLUE)) {
    gotoPos(BLUE_POS);
    drop();
}

print("done");
`;



// %%%%%%%%%%%%%%%%
// JS Simulator
// %%%%%%%%%%%%%%%%

async function runJS() {
  //setupSimulator();

  try {
    beautify.beautify(editor.session);
    if (editor.getValue().includes("let ")) {
      debug("Let is not supported use var instead");
    }
    const forOfPattern = /for\s*\(\s*\w+\s+of\s+\w+\s*\)/;

    if (detectForOfLoop(editor.getValue())) {
      debug('"for (... of ...)" is not supported use an index instead');
    }

    myInterpreter = new Interpreter(editor.getValue(), initInterpreter);

    await delay(500);
    //myInterpreter.appendCode("print(a)");

    running = true;
    nextStepJS();
  } catch (error) {
    const match = error.message.match(/\((\d+):(\d+)\)/);

    if (match) {
      const lineNumber = match[1];
      const columnNumber = match[2];

      debug(`Error at line ${lineNumber}:  ${error.message}`), true;
      editor.session.addMarker(
        new Range(lineNumber - 1, 0, lineNumber - 1, 1),
        "myMarker",
        "fullLine"
      );
    } else {
      debug(error, true);
    }
  }
 
}

// Function to initialize the javascript interpreter and expose the native function
function initInterpreter(interpreter, globalObject) {
  // Expose the native 'hep' function to the interpreter
  const nativePrint = interpreter.createNativeFunction(function (arg) {
    debug(arg); // Call the native hep function
  });

  const isColorWrapper = interpreter.createNativeFunction(function (compColor) {
    return arm.isColor(compColor);
  });

  var gotoWrapper = function goto(name, callback) {
    simulator.gotoBlocked(containerColors[name], callback);
  };
  var grabWrapper = function grab(callback) {
    simulator.arm.pickPieceBlocked(callback);
  };
  var dropWrapper = function pick(callback) {
    simulator.arm.dropPieceBlocked(callback);
  };

  // Add the function to the interpreter's global scope
  interpreter.setProperty(globalObject, "isColor", isColorWrapper);

  interpreter.setProperty(globalObject, "print", nativePrint);
  interpreter.setProperty(
    globalObject,
    "gotoPos",
    interpreter.createAsyncFunction(gotoWrapper)
  );
  interpreter.setProperty(
    globalObject,
    "grab",
    interpreter.createAsyncFunction(grabWrapper)
  );
  interpreter.setProperty(
    globalObject,
    "drop",
    interpreter.createAsyncFunction(dropWrapper)
  );
}

function nextStepJS(oneStep = false) {
  try {
    if (running && (!pause || oneStep) && myInterpreter.step()) {
      var stack = myInterpreter.getStateStack();
      if (stack.length) {
        let node = stack[stack.length - 1].node;
        let start = node.start;
        let end = node.end;
        let curLine = editor.getValue().slice(0, start).split("\n").length;
        let curLineEnd = editor.getValue().slice(0, end).split("\n").length;

        if (curLineEnd - curLine < 8) {
          clearMarkers();
          editor.session.addMarker(
            new Range(curLine - 1, 0, curLineEnd - 1, 1),
            "myMarker",
            "fullLine"
          );
        }
      }
      window.setTimeout(nextStepJS, 0);
    } else if (!pause) {
      running = false;
      debug("Program stopped");
    }
  } catch (error) {
    running = false;
    debug("Program stopped");
    if (error.stack) {
      // Parse the stack trace to find the line number
      const stackLines = error.stack.split("\n");

      // Example: Extract the first line after the message
      const relevantLine = stackLines[1];
      const lineInfo = relevantLine.match(/:(\d+):(\d+)/); // Captures line and column numbers

      if (lineInfo) {
        const lineNumber = lineInfo[1]; // The captured line number
        const columnNumber = lineInfo[2]; // The captured column number (optional)
        debug(`Error at line ${lineNumber}:  ${error.message}`, true);
        editor.session.addMarker(
          new Range(lineNumber - 1, 0, lineNumber - 1, 1),
          "myMarker",
          "fullLine"
        );
      }
    } else {
      debug(error.line);
    }
  }
}
/*
async function runJS() {
  setupSimulator();

  try {
    beautify.beautify(editor.session);
    if (editor.getValue().includes("let ")) {
      debug("Let is not supported use var instead");
    }
    const forOfPattern = /for\s*\(\s*\w+\s+of\s+\w+\s*\)/;

    if (detectForOfLoop(editor.getValue())) {
      debug('"for (... of ...)" is not supported use an index instead');
    }

    myInterpreter = new Interpreter(editor.getValue(), initInterpreter);

    await delay(500);
    //myInterpreter.appendCode("print(a)");

    running = true;
    nextStepJS();
  } catch (error) {
    const match = error.message.match(/\((\d+):(\d+)\)/);

    if (match) {
      const lineNumber = match[1];
      const columnNumber = match[2];

      debug(`Error at line ${lineNumber}:  ${error.message}`, true);
      editor.session.addMarker(
        new Range(lineNumber - 1, 0, lineNumber - 1, 1),
        "myMarker",
        "fullLine"
      );
    } else {
      debug(error, true);
    }
  }
 
}*/