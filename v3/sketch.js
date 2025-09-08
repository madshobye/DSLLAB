/*


Todo:

- pop up on refresh
- gherkin: 
-- hihglight is, to, the, 
-- validate
- gherking parser: https://editor.p5js.org/hobye/sketches/4eaNj_QyG

- add a bit more report visualisation
- show sensor on the nose (nice to have)
- area
- add more markers (open close help)
- larger help text
- make info screen for dsl
- hide admin when running test?
- remove admin panel when doing a test
- diff 

- More room when starting each scenario .
- keywords highlight (the / is).in dsl
- entities defined?
- special keyword list on top of code editor
- schema validation gherkin
- no interaction
- another example of another robot simulation
- prompt with test ID + hashed id key. 
- code diff based on type - e.g. copy paste, error, run etc.
- linter and syntax highligther for gherkin.

*/

let myFont;

let showDSLVersion = true;

let containerColors = {};
let t = 0;
let resetCounter = 3;
let running = false;
let pause = false;
let myInterpreter;
let hideAdmin = false;
let taskOneSolved = false;
let taskTwoSolved = false;

let arm;
let simulator;
let canvasElement;
let mySessions;
var selectedReport = new uiFloat(0);

let imgGuideJS;
let imgGuideDSL; 
let hideControl = false;

// Load the image and create a p5.Image object.
function preload() {
  imgGuideJS = loadImage("guideJS-1.png");
imgGuideDSL = loadImage("guideDSL-4.png");
  myFont = loadFont(base64Font); // load a font via base64?!
}

function setup() {
  if (getUrlParam("type") != null && getUrlParam("type") == "dsl") {
    showDSLVersion = true;
  }
  setupAceEditor();
  mySessions = new LSessions();

  noStroke();
  noScrolling();

  let canvasContainer = select("#canvascont");

  let canvas = createCanvas(windowWidth / 2, windowHeight, WEBGL);

  canvas.parent("canvascont");
  textFont(myFont);

  frameRate(30);
  this.canvas.onwheel = () => false;
  this._setProperty("wheelDefaultDisabled", true);
  this.canvas.oncontextmenu = () => false;
  this._setProperty("contextMenuDisabled", true);

  resetEnv(false);
}

function setupSimulator() {
  clearLog();
  let pieceColors = ["RED", "GREEN", "BLUE"];

  arm = new RobotArm(0, 0, 0);
  simulator = new Simulator(arm);

  let randomPieceIndex;
  let tmpContaioner = simulator.createContainer(
    90,
    20,
    20,
    2,
    "black",
    "START_POS",
    3
  );
  while (pieceColors.length > 0) {
    // add one of the colors
    randomPieceIndex = Math.floor(Math.random() * pieceColors.length);
    tmpContaioner.addPiece(pieceColors[randomPieceIndex]);
    pieceColors.splice(randomPieceIndex, 1);
  }
  let tmp = simulator.createContainer(0, -75, 20, 2, "white", "END_POS", 3);

  simulator.createContainer(70, -60 - 25, 20, 2, "RED", "RED_POS", 3);
  simulator.createContainer(70 + 45, -35 - 15, 20, 2, "GREEN", "GREEN_POS", 3);
  simulator.createContainer(80 + 45, -70 - 30, 20, 2, "BLUE", "BLUE_POS", 3);

  //simulator.goto(0, true);

  containerColors = simulator.getAllContainerColors();
}
let showHelp = false;
let showReport = false;
let playBack = false;
let playBackTimer = 0;

function draw() {
  textSize(20);
  uiUpdateSimple();
  mySessions.tick(editor.getValue());

  push();
  background(0);
  if (!pause) {
    arm.update();
  }

  push();
  noStroke();

  lights();

  handleviewCam();
  verifyTasks();

  sCylinder(0, -10, 0, 10000, 10, "grey");

  arm.draw();
  simulator.draw();

  pop();

  // overlay

  push();

  translate(-width / 2, -height / 2);

  if (showHelp) {
    background("white");
    let curimg; 
    if(showDSLVersion)
      curimg = imgGuideDSL;
    else
      curimg = imgGuideJS;
    
    let ratio = curimg.height / curimg.width;
    let iW = width;
    let iH = width * ratio;

    image(curimg, 0, 100, iW, iH);
    if (uiButton("X", 200, 30, 30, 10, 10).clicked) {
      showHelp = false;
      addLogInfo(sTypes.CLOSEHELP, "", "");
    }
  } else if (showReport) {
    background("white");
    textSize(10);
    let lastLineValue = 0;
    let lastLineX = 100;
    let tmpSession = mySessions.lSessions[round(selectedReport.get())];
    let timePixelRatio =
      (width - lastLineX - 20) / (tmpSession.sessionLength * 60 * 1000);
    fill("black");
    text("Min:", 10, 100);
    for (let i = 0; i < tmpSession.sessionLength; i = i + 5) {
      text(i, lastLineX + timePixelRatio * (i * 60 * 1000), 100);
    }
    stroke("black");
    line(
      10,
      110,
      timePixelRatio * tmpSession.sessionLength * 60 * 1000 + lastLineX + 10,
      110
    );

    let curCode = "";
    let hoverOn = false;
    for (let i = 0; i < tmpSession.items.length; i = i + 1) {
      if (
        !playBack ||
        (playBack &&
          millis() - playBackTimer >
            tmpSession.items[i].time - tmpSession.startTime)
      ) {
        let posX =
          100 +
          (tmpSession.items[i].time - tmpSession.startTime) * timePixelRatio;
        if (
          (uiCircle("", 0, 10, 10, posX, 200 + tmpSession.items[i].type * 15)
            .hover &&
            !hoverOn) ||
          (playBack &&
            i < tmpSession.items.length - 1 &&
            millis() - playBackTimer <
              tmpSession.items[i + 1].time - tmpSession.startTime)
        ) {
          hoverOn = true;
          stroke("red");
          line(posX, 120, posX, 500);
          if (tmpSession.items[i].note != "") {
            uiRect(
              tmpSession.items[i].typeTXT + ": " + tmpSession.items[i].note,
              230,
              width - 10 - 250,
              60,
              250,
              10
            );
          }

          curCode = tmpSession.items[i].code;
        }
        if (tmpSession.items[i].type == sTypes.LINES) {
          stroke(0);
          strokeWeight(2);
          let offset = 180;
          line(
            lastLineX,
            offset - lastLineValue,
            posX,
            offset - tmpSession.items[i].number * 0.8
          );
          lastLineValue = tmpSession.items[i].number * 0.8;
          lastLineX = posX;
        }
      }
    }
    let counter = 0;
    for (const key in sTypes) {
      if (key != "getName") {
        text(key, 10, 205 + counter * 15);
        counter++;
      }
    }

    if (curCode != "") {
      fill(0);
      let curCodeL = curCode.split("\n");
      let lineSpacing = 17;
      push();
      translate(10, 500);
      for (let i = 0; i < curCodeL.length; i++) {
        text(curCodeL[i], 0, 0, width / 2 - 10, lineSpacing);
        translate(0, lineSpacing);

        if (i == 25) {
          pop();
          push();
          translate(width / 2, 500);
        }
      }

      pop();
    }
    if (uiButton("X", 200, 30, 30, 10, 10).clicked) {
      showReport = false;
    }
    if (uiButton("P", 200, 30, 30, 50, 10).clicked) {
      playBack = !playBack;
      playBackTimer = millis();
    }
    if (
      uiScrollbar(
        "ID",
        0,
        mySessions.lSessions.length - 1,
        selectedReport,
        100,
        100,
        10
      ).clicked
    ) {
    }
  } else {
    if (!hideControl) {
      uiContainerStart(20, 30, 150);
      uiText("Control");
      uiText("Solved #1:" + taskOneSolved);
      uiText("Solved #2:" + taskTwoSolved);

      if (mySessions.cur != null) {
        uiText("T:" + mySessions.cur.timeLeft());
      }

      if (uiButton("Task (?)").clicked) {
        showHelp = true;
        addLogInfo(sTypes.OPENHELP, "", "");
      }
      if (!running && uiButton("Run").clicked) {
        runSimulation();
      } else if (running && !pause && uiButton("Pause").clicked) {
        pauseSimulation();
      } else if (running && pause && uiButton("Continue").clicked) {
        unPauseSimulation();
      }

      /* 
  if(running && pause && uiButton("Step").clicked)
  {
    nextStepJS(true);
  }*/
      if (running && uiButton("Stop").clicked) {
        stopSimulation();
      }

      uiContainerEnd();
    }
    if (!hideAdmin) {
      uiContainerStart(max(200, width - 110), 30, 100);
      uiText("Admin");
      if (uiButton("Save").clicked) {
        let stringArray = [editor.getValue()];
        saveStrings(stringArray, "code.js");
      }

      if (uiButton("RST (" + resetCounter + ")").clicked) {
        resetCounter--;
        if (resetCounter <= 0) {
          resetCounter = 3;
          resetEnv(true);
        }
      }
      if (mySessions.cur == null && uiButton("START").clicked) {
        mySessions.start();
      }

      if (mySessions.lSessions.length > 0 && uiButton("Report").clicked) {
        showReport = true;
      }
      
      if (uiButton("Solution").clicked) {
        if(showDSLVersion)
        editor.session.setValue(solutionDSL);
        else
          editor.session.setValue(solutionJS)
      }

      if (mySessions.cur != null) {
        // uiText(mySessions.cur.timeLeft());

        if (uiButton("STOP").clicked) {
          mySessions.stop();
        }
      }

      /* if(uiButton("pri").clicked)
  {
     debug(vpX + ", " + vpY + ", " + vpR1 + ", " + vpR2 + ", " + vpS);
   
  }*/

      uiContainerEnd();
    }
  }

  pop();
}

function verifyTasks() {
  /* taskOneSolved = false;
 taskTwoSolved = false;*/

  if (
    !taskOneSolved &&
    simulator.containers[containerColors["RED_POS"]].hasOnePieceColorMatch() &&
    simulator.containers[
      containerColors["GREEN_POS"]
    ].hasOnePieceColorMatch() &&
    simulator.containers[containerColors["BLUE_POS"]].hasOnePieceColorMatch()
  ) {
    taskOneSolved = true;
    addLogInfo(sTypes.TASKONE, "", "");
  }

  let endCont = simulator.containers[containerColors["END_POS"]];

  if (
    !taskTwoSolved &&
    endCont.pieces.length == 3 &&
    endCont.pieces[0].c == "green" &&
    endCont.pieces[1].c == "red" &&
    endCont.pieces[2].c == "blue"
  ) {
    taskTwoSolved = true;
    addLogInfo(sTypes.TASKTWO, "", "");
  }
}

let counter = 0;
function addLogInfo(sType, number, note) {
  if (mySessions.cur != null) {
    mySessions.add(sType, number, note, editor.getValue());
  }
}

function storeChange() {
  localStorage.setItem("code" + showDSLVersion, editor.getValue());
}

function stopSimulation() {
  arm.moving = false;
  running = false;
  pause = false;

  addLogInfo(sTypes.STOPSIM, "", "");
  if (showDSLVersion) {
    GherkinEval.stop('feature');
    debug("STOPPING");
  }
}

function pauseSimulation() {
  addLogInfo(sTypes.PAUSESIM, "", "");
  pause = true;
  if (showDSLVersion) {
    GherkinEval.pause();
  }
}

function unPauseSimulation() {
  addLogInfo(sTypes.UNPAUSESIM, "", "");
  pause = false;
  nextStepSimulation();
  if (showDSLVersion) {
    GherkinEval.resume();
  }
}

function runSimulation() {
  setupSimulator();
  addLogInfo(sTypes.RUNSIM, 0, "");
  if (showDSLVersion) {
    runDSL();
  } else {
    runJS();
  }
}

function nextStepSimulation() {
  addLogInfo(sTypes.NEXTSIM, "", 0, "");
  if (showDSLVersion) {
    nextStepDSL();
  } else {
    nextStepJS();
  }
}

function resetEnv(resetStorage) {
  if (running) {
    stopSimulation();
  }
  setupSimulator();
  taskOneSolved = false;
  taskTwoSolved = false;

  if (resetStorage || localStorage.getItem("code" + showDSLVersion) == null) {
    let tmpCode = "";
    if (!showDSLVersion) {
      tmpCode = startcodeJS;
    } else {
      tmpCode = startcodeDSL;
    }
    localStorage.setItem("code" + showDSLVersion, tmpCode);
  }
  editor.setValue(localStorage.getItem("code" + showDSLVersion));
  editor.clearSelection(); // This will remove the highlight over the text

  vpS = height / 500;
  vpX = -width * 0.1;
  vpY = -height * 0.1;
  vpZ = 0;
  vpR1 = -60;
  vpR2 = -40;
  vpR3 = 0;
  vpMXOld = -1;
  vpMYOld = -1;
}

function clearMarkers() {
  const prevMarkers = editor.session.getMarkers();
  if (prevMarkers) {
    const prevMarkersArr = Object.keys(prevMarkers);
    for (let item of prevMarkersArr) {
      editor.session.removeMarker(prevMarkers[item].id);
    }
  }
}

function detectForOfLoop(code) {
  // Updated regular expression to match `for (... of ...)` pattern even with varying whitespace/newlines
  const forOfPattern = /for\s*\(\s*(?:var|let)\s+\w+\s+of\s+[\w\[\]'"$]+\s*\)/g;

  // Test if the code contains the `for..of` loop
  const match = code.match(forOfPattern);

  return match ? true : false;
}

function keyPressed() {
  if (keyIsDown(CONTROL)) {
    if (key === "f" || key === "F") {
      fullScreenToggle();
    }

    if (key === "a" || key === "A") {
      hideAdmin = !hideAdmin;
    }
    if (key === "c" || key === "C") {
      hideControl = !hideControl;
    }
  }

  storeChange();
}
function mouseWheel() {
  if (mouseX < 0) {
    _mouseWheelDeltaY = 0;
  }
}

let consoleLog = []; //dddd
function debug(msg, isError = false, noLogging = false) {
  addToConsole(msg);

  if (isError) {
    // stopSimulation();
    if (!noLogging) addLogInfo(sTypes.ERROR, "", msg);
  } else {
    if (!noLogging) addLogInfo(sTypes.CONSOLE, "", msg);
  }
  // print(msg);
}

function addToConsole(msg) {
  if (consoleLog.length > 100) {
    consoleLog.shift();
  }
  consoleLog.unshift(msg);
  consoleDiv = document.querySelector("#consoleContent");
  consoleDiv.innerHTML = consoleLog.slice().reverse().join("<br>\n");
}

function clearLog() {
  consoleLog = [];
  consoleDiv = document.querySelector("#consoleContent");

  consoleDiv.innerHTML = consoleLog.slice().reverse().join("<br>\n");
}

function getUrlParam(name) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name);
}

function clearAllMarkers()
{
 const prevMarkers = editor.session.getMarkers();

if (prevMarkers) {
  const markerIds = Object.keys(prevMarkers);
  for (let id of markerIds) {
    editor.session.removeMarker(prevMarkers[id].id);
  }
} 
}
