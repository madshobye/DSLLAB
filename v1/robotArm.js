class RobotArm {
  constructor(x, y, z) {
    this.basePos = createVector(x, y, z);

    this.startPos = createVector(130, 0, 60);
    this.startAngle = 0;
    this.moving = false;
    this.endAngle = 0;
    this.curAngle = 0;
    this.speed = 20;
    this.timer = 0;
    this.curveLength = 0;
    this.controlPoints = [];
    this.pieces = [];
    this.curPos = createVector(60, 50, 70);
    this.gotoPos = createVector(60, 50, 70);
    this.baseHeight = 39;
    this.containerPos = -1;
    this.arm1L = 88;
    this.arm2L = 91;
    this.noseL = 33;
    this.controlPoints = [];
    this.t = 1;
  }

  goto(x, y, z, a, instant = false) {
    this.gotoPos.x = x;
    this.gotoPos.y = y;
    this.gotoPos.z = z;
    this.endAngle = a;
    this.startAngle = this.curAngle;
    this.startPos = this.curPos.copy();
    this.t = 0;
    this.moving = true;
    if (instant) {
      this.moving = false;
      this.curPos = this.gotoPos.copy();
      this.curAngle = this.endAngle;
      this.t = 1;

      return;
    }
    this.controlPoints = [];
    this.controlPoints.push(this.startPos);
    this.controlPoints.push(
      createVector(
        this.startPos.x + (this.gotoPos.x - this.startPos.x) / 3,
        70,
        this.startPos.z + (this.gotoPos.z - this.startPos.z) / 3
      )
    );
    this.controlPoints.push(
      createVector(
        this.startPos.x + ((this.gotoPos.x - this.startPos.x) / 3) * 2,
        70,
        this.startPos.z + ((this.gotoPos.z - this.startPos.z) / 3) * 2
      )
    );
    this.controlPoints.push(this.gotoPos);
    this.curveLength = calculateBezierCurveLength(this.controlPoints);
  }
  drawRobotElement(angle, length) {
    rotate(-radians(angle));
    translate(0, length / 2);
    box(20, length, 30);
    translate(0, length / 2);
  }

  isColor(compColor) {
    if (this.pieces.length > 0) {
      if (this.pieces[0].c == compColor) {
        debug("The color is " + this.pieces[0].c);
        return true;
      } else {
        debug("The color is not " + compColor);
         return false;
      }
    } else {
      debug("No piece picked to read color from", true);
    
       return false;
    }
  }

  readColor() {
    if (this.pieces.length > 0) {
      return this.pieces[0].c;
    }

    return null;
  }

  pickPiece() {
    if (
      this.containerPos != -1 &&
      this.simulator.containers[this.containerPos].pieces.length > 0
    ) {
      this.pieces.push(this.simulator.containers[this.containerPos].popPiece());
      return true;
    }

    return false;
  }

  async pickPieceBlocked(callback) {
    if(this.pieces.length > 0)
    {
       debug("Error: I can only carry one piece",true);
    
    }
    else if (this.pickPiece()) {
      await delay(500);
      debug("Piece picked");
    } else {
      debug("no Piece to pick");
      stopSimulation();
    }
    if (callback != null) {
      callback(null);
    }
  }

  draw() {
    let angle1 = 30;
    let angle2 = 30;

    let tmpNoseAngle = this.curAngle + 180;

    let xBeforeNose = sin(radians(tmpNoseAngle)) * this.noseL;
    let yBeforeNose = cos(radians(tmpNoseAngle)) * this.noseL;

    let xCalcTarget = dist(this.curPos.x - xBeforeNose, this.curPos.z, 0, 0);
    let yCalcTarget = this.curPos.y - yBeforeNose - this.baseHeight;

    let distBeforeNose = dist(xCalcTarget, yCalcTarget, 0, 0);

    let cosTheta2 =
      (distBeforeNose * distBeforeNose -
        this.arm1L * this.arm1L -
        this.arm2L * this.arm2L) /
      (2 * this.arm1L * this.arm2L);

    let theta2 = degrees(acos(cosTheta2));

    // Calculate theta1 based on the triangle formed by L1 and D_prime
    let angleToTarget = degrees(atan2(-yCalcTarget, xCalcTarget)); // Angle from base to target
    let cosTheta1 =
      (distBeforeNose * distBeforeNose +
        this.arm1L * this.arm1L -
        this.arm2L * this.arm2L) /
      (2 * distBeforeNose * this.arm1L);
    let theta1Adjustment = degrees(acos(cosTheta1)); // Adjustment angle
    let theta1 = angleToTarget - theta1Adjustment; // Final theta1 calculation
    fill("blue");

    let possible = distBeforeNose < this.arm1L + this.arm2L;
    stroke(255);

    theta1 = theta1 + 90;

    tmpNoseAngle = tmpNoseAngle - theta1 - theta2;

    push();
    translate(this.basePos);
    if (possible) {
      push();
      //  translate(xBeforeNose,yBeforeNose,this.curPos.z);
      //  box(200);

      pop();
      /*
      stroke("white");
      strokeWeight(1);
      noFill();
      if (this.controlPoints.length == 4)
        bezier(
          this.controlPoints[0].x,
          this.controlPoints[0].y,
          this.controlPoints[0].z,
          this.controlPoints[1].x,
          this.controlPoints[1].y,
          this.controlPoints[1].z,
          this.controlPoints[2].x,
          this.controlPoints[2].y,
          this.controlPoints[2].z,
          this.controlPoints[3].x,
          this.controlPoints[3].y,
          this.controlPoints[3].z
        );*/
      fill("silver");
      noStroke();
      sCylinder(0, 0, 0, 30, 10);
      stroke("silver");
      strokeWeight(2);
      rotate(-atan2(this.curPos.z, this.curPos.x), [0, 1, 0]);
      this.drawRobotElement(0, this.baseHeight);
      this.drawRobotElement(theta1, this.arm1L);
      this.drawRobotElement(theta2, this.arm2L);
      this.drawRobotElement(tmpNoseAngle, this.noseL);
      noStroke();
      for (let i = 0; i < this.pieces.length; i++) {
        sCylinder(0, i * 10, 0, 15, 10, this.pieces[i].c);
      }
    } else {
      noStroke();
      stroke("red");
      noFill();
      box(20, 100, 20);
    }
    pop();
  }

  async dropPieceBlocked(callback) {
    if (arm.dropPiece()) {
      await delay(500);
      debug("Piece dropped");
    } else {
      debug("no Piece to drop");
    }
    
    if (callback != null) {
     
       callback();
    }
  }

  dropPiece() {
    if (this.pieces.length > 0 && this.containerPos != -1) {
      this.simulator.containers[this.containerPos].pieces.push(
        this.pieces.pop()
      );
      return true;
    }
    return false;
  }
  update() {
    if (millis() - this.timer > this.speed) {
      if (this.t < 1 && this.moving) {
        this.timer = millis();
        this.t = this.t + 0.02;
        this.curPos.x = bezierPoint(
          this.controlPoints[0].x,
          this.controlPoints[1].x,
          this.controlPoints[2].x,
          this.controlPoints[3].x,
          this.t
        );
        this.curPos.y = bezierPoint(
          this.controlPoints[0].y,
          this.controlPoints[1].y,
          this.controlPoints[2].y,
          this.controlPoints[3].y,
          this.t
        );
        this.curPos.z = bezierPoint(
          this.controlPoints[0].z,
          this.controlPoints[1].z,
          this.controlPoints[2].z,
          this.controlPoints[3].z,
          this.t
        );

        this.curAngle =
          this.startAngle + (this.endAngle - this.startAngle) * this.t;
      } else {
        this.moving = false;
      }
    }
  }
}
