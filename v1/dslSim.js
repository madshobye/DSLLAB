
let startcodeDSL = `Scenario: "Grabbing a piece"
Given the robot is ready
When the robot moves to position START_POS
And the robot grabs the piece
Then the robot is at START_POS

Scenario: "Sorting the object to its corresponding bucket"
Given the piece is RED
When the robot moves to position RED_POS
Then the piece is dropped

Scenario: "Sorting the object to its corresponding bucket"
Given the piece is GREEN
When the robot moves to position GREEN_POS
Then the piece is dropped

Scenario: "Sorting the object to its corresponding bucket"
Given the piece is BLUE
When the robot moves to position BLUE_POS
Then the piece is dropped

Scenario: "Grabbing a piece"
Given the robot is ready
When the robot moves to position START_POS
And the robot grabs the piece
Then the robot is at START_POS
`;



// %%%%%%%%%%%%%%%%
// YADDA -DSL SIMULATOR
// %%%%%%%%%%%%%%%%


let myYadda = require("yadda");
let English = myYadda.localisation.English;
let Dictionary = myYadda.Dictionary;
let myYaddaInstance;
let feature;
window.myNum = 0;

var dictionary = new Dictionary()
  // Define variables in your feature file if necessary
  .define("number", /(\d+)/)
  .define(
    "containerColor",
    /(START_POS|END_POS|RED_POS|GREEN_POS|BLUE_POS)/,
    (method, cb) => cb(null, method.toUpperCase())
  )
  .define("pieceColor", /(RED|GREEN|BLUE)/, (method, cb) =>
    cb(null, method.toLowerCase())
  );

var library = English.library(dictionary)
  .given("the robot is ready", function (next) {
   /* if (arm.containerPos != -1) {
      throw new Error("Robot is in the air");
    } else {
      debug("Robot is not the air");
    }*/
    next();
  })

  .then("the robot is at $containerColor", function (containerColor, next) {
    if (arm.containerPos != containerColors[containerColor]) {
      throw new Error("Not at " + containerColor);
    } else {
      debug("Position verified: " + containerColor);
      next();
    }
  })
  .given("the robot is at $containerColor", function (containerColor, next) {
    if (arm.containerPos != containerColors[containerColor]) {
      throw new Error("Not at " + containerColor);
    } else {
      debug("At " + containerColor);
      next();
    }
  })
  .given("the piece is $pieceColor", function (pieceColor, next) {
    if (!arm.isColor(pieceColor)) {
      throw new Error("Not " + pieceColor);
    } else {
         next();
    }
 
  })
  .when("the robot grabs the piece", function (next) {
    simulator.arm.pickPieceBlocked(next);
  })
  .when(
    "the robot moves to position $containerColor",
    function (containerColor, next) {
      simulator.gotoBlocked(containerColors[containerColor], (err) => {
        if (err) return done(err);
        next();
      });
    }
  )
  .then("the piece is dropped", function (next) {
    simulator.arm.dropPieceBlocked(next);
  })
.then("the robot drops the piece", function (next) {
    simulator.arm.dropPieceBlocked(next);
  })

  /* .given(
    "the piece is $pieceColor the robot moves to the $containerColor",
    function (pieceColor, containerColor, next) {
      next();
    }
  )*/
  .then("the piece should match with the container", function (next) {
    let contPos = arm.containerPos;

    let container = simulator.containers[contPos];
    if (
      container.pieces.length > 0 &&
      container.pieces[container.pieces.length - 1].c == container.c
    ) {
      debug(
        "It is a match " +
          container.pieces[container.pieces.length - 1].c +
          " " +
          container.c
      );
      next();
    } else {
      throw new Error("Not a match");
    }
  });

let scenarioIndex = 0;
let stepIndex = 0;
let context = null;
let currentScenario = null;

async function runDSL() {
  try {
    beautify.beautify(editor.session);
    lineStepCounter =-2;
    feature = new myYadda.parsers.FeatureParser().parse(editor.getValue());

    myYaddaInstance = myYadda.createInstance(library, { ctx: {} });

    scenarioIndex = -1;
    stepIndex = 0;
    context = { ctx: {} };

    if (feature.scenarios.length > 0) {
      //currentScenario = feature.scenarios[scenarioIndex];

      running = true;
      await delay(500);

      nextStepDSL();
    }
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
}

function getLine(txt, number) {
  const lines = txt.split("\n");
  return lines[number - 1];
}

let lineStepCounter =0;

function nextStepDSL(oneStep = false) {
  try {
    if (running && (!pause || oneStep)) {
      if (
        scenarioIndex == -1 ||
        currentScenario == null ||
        stepIndex >= currentScenario.steps.length
      ) {
        // debug(`Scenario passed: ${scenarioIndex + 1}`);
        scenarioIndex++;
        stepIndex = 0;

        if (scenarioIndex >= feature.scenarios.length) {
           debug("", false,true);
        debug("------------------------------------",false,true);
          debug("All scenarios completed.");
          running = false;
           // Remove previous markers
      const prevMarkers = editor.session.getMarkers();
      if (prevMarkers) {
        Object.keys(prevMarkers).forEach((id) => {
          editor.session.removeMarker(prevMarkers[id].id);
        });
      }
          return;
          
        }
       
        currentScenario = feature.scenarios[scenarioIndex];
        context = { ctx: {} }; // Reset context for new scenario
        debug("", false,true);
        debug("------------------------------------------",false,true);
        debug("SCENARIO: " + currentScenario.title);
        debug("------------------------------------------",false,true);
         
      }

      const step = currentScenario.steps[stepIndex];
  
      // Remove previous markers
      const prevMarkers = editor.session.getMarkers();
      if (prevMarkers) {
        Object.keys(prevMarkers).forEach((id) => {
          editor.session.removeMarker(prevMarkers[id].id);
        });
      }
      
      lineStepCounter = stepIndex+ scenarioIndex*2+1;
      for(i =0; i < scenarioIndex; i++)
      {
        lineStepCounter = lineStepCounter +feature.scenarios[i].steps.length;
      }
     // print(lineStepCounter + " " + stepIndex + " " + scenarioIndex );
      

    //  let lPos = (stepIndex + 1) * (scenarioIndex + 1) + 1;
      editor.session.addMarker(
        new Range(lineStepCounter, 0, lineStepCounter, 1),
        "myMarker",
        "fullLine"
      );

      myYaddaInstance.run(step, context, (err) => {
        if (err) {
          if (step.toLowerCase().startsWith("give")) {
            stepIndex = currentScenario.steps.length;
          } else {
            debug(`Step failed: ${err.message}`, true);
            running = false;
            return;
          }
        } else {
          stepIndex++;
        }
        window.setTimeout(nextStepDSL, 0);
      });
    } else if (!pause) {
      debug("Program stopped");
      running = false;
    }
  } catch (error) {
    running = false;

    debug(
      currentScenario.title +
        " - " +
        currentScenario.steps[stepIndex] +
        " " +
        error,
      true
    );
  }
}
