//  "DIFF",

var sTypes = autoEnum(
  "LINES",
  "RUNSIM",
  "STOPSIM",
  "PAUSESIM",
  "UNPAUSESIM",
  "NEXTSIM",
  "CONSOLE",
  "ERROR",
  "TASKONE",
  "TASKTWO",
  "COPY",
  "PASTE",
  "CUT",
  "OPENHELP",
  "CLOSEHELP",
  "START", // session
  "STOP", // session
  "MAXTIME" // sesseion
  
);

let sessionsStorageName = "sessions_15";

class LSessions {
  constructor() {
   // print(sTypes);
    this.tickTimer = 0;
    this.lSessions = [];
    this.cur = null;
    if (localStorage.getItem(sessionsStorageName) != null) {
      let tmpSessions = JSON.parse(localStorage.getItem(sessionsStorageName));
    //  print(tmpSessions);
      for (let i = 0; i < tmpSessions.length; i++) {
        let newSession = new LSession();
        this.lSessions.push(newSession);
        newSession.sessionLength = tmpSessions[i].sessionLength;
        newSession.recording = tmpSessions[i].recording;
        newSession.startTime = tmpSessions[i].startTime;

        // newSession.items = tmpSessions.items;
        // print(tmpSessions[i]);

        for (let b = 0; b < tmpSessions[i].items.length; b++) {
          // print("B" + b);

          let tmpItem = new Item(
            tmpSessions[i].items[b].type,
            tmpSessions[i].items[b].number,
            tmpSessions[i].items[b].note,
            tmpSessions[i].items[b].code
          );
          tmpItem.time = tmpSessions[i].items[b].time;
          newSession.items.push(tmpItem);
        }
        print(newSession);
        if (newSession.recording) {
          this.cur = newSession;
          //print("hep");
        }
        //print(newSession);
      }
    }
  }
  
  tick(code)
  {
    if(millis() - this.tickTimer > 5000 && this.cur != null)
    {
      this.tickTimer = millis();
    this.add(sTypes.LINES, code.split("\n").length, "",code);
  
    }
  }
  storeLocal() {
  //  print(this.lSessions[0].startTime);
    localStorage.setItem(sessionsStorageName, JSON.stringify(this.lSessions));
  }

  new() {
    this.cur = new LSession();
    this.lSessions.push(this.cur);
    this.storeLocal();
    return this.cur;
  }

  start() {
    if (this.cur == null) {
      this.new();
    }
    this.cur.start();
  }

  add(sType, number = 0, note = "", code = "") {
    if (this.cur == null) {
      console.log("error b");
      return;
    }

    this.cur.add(sType, number, note, code);
    
    this.storeLocal();
  }

  stop() {
    if (this.cur == null) {
      console.log("error x");
      return;
    }
    this.cur.stop();
    this.cur = null;
    this.storeLocal();
  }
}

class LSession {
  constructor() {
    this.items = [];
    this.sessionLength = 10; // minutes
    this.recording = false;
    this.startTime = -1;
    //this.endTime = -1;
  }
  start() {
    this.startTime = Date.now();
    this.add(sTypes.START, "", "");
    let endMarker = new Item(sTypes.MAXTIME, 0, "This is the max time");
    endMarker.time = Date.now() + this.sessionLength * 60 * 1000;
    this.items.push(endMarker);

    this.recording = true;
  }

  add(sType, number = 0, note = "", code = "") {
    this.items.push(new Item(sType, number, note, code));
  }

  stop() {
    this.recording = false;
    this.add(sTypes.END, "", "");
  }

  timeLeft() {
    const now = Date.now();
    const timePassedMs = this.startTime - now + this.sessionLength * 60 * 1000;

    const totalMinutes = Math.floor(timePassedMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    // Pad with leading zeros if needed (e.g., 03:05)
    const hoursStr = String(hours).padStart(2, "0");
    const minutesStr = String(minutes).padStart(2, "0");

    return `${hoursStr}:${minutesStr}`;
  }
}

class Item {
  constructor(type, number, note, code) {
    this.typeTXT = sTypes.getName(type);
    this.type = type;
    this.number = number;
    this.note = note;
    this.time = Date.now();
    this.code = code;
  }
}
