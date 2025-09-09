

class Simulator {
  constructor(arm) {
    this.containers = [];
    this.arm = arm;
    this.arm.simulator = this;
    
  }
  
 

  getAllContainerColors() { // should be containers not colors
    let tmpList = {};
    for (let i = 0; i < this.containers.length; i++) {
      tmpList[this.containers[i].name] = i;
    }
    return tmpList;
  }
  
  

  createContainer(x, y, r, h, c, name, maxPieces) {
    let tmp = new Container(x, y, r, h, c, name, maxPieces);
    this.containers.push(tmp);
    return tmp;
  }
  async gotoBlocked(position, callback) {
    if (position == undefined) {
      debug("Position not recognised",true);
 
    }
    else
    {
   
    debug("Moves to " + simulator.containers[position].name);
    this.goto(position);
    while (arm.moving) {
      await delay(200);
    }
    }
    if (callback != null) {
      callback(null);
    }
  }

  goto(i, instant = false) {
    if (i != this.arm.containerPos) {
      this.arm.goto(
        this.containers[i].x,
        this.containers[i].z +
          this.containers[i].pieces.length * 10 +
          20 +
          this.arm.pieces.length * 10,
        this.containers[i].y,
        0,
        instant
      );
      this.arm.containerPos = i;
    }
  }

  draw() {
    for (let i = 0; i < this.containers.length; i++) {
      this.containers[i].draw();
    }
  }
}
class Container {
  constructor(x, y, r, h, c, name, maxPieces) {
    this.x = x;
    this.y = y;
    this.name = name;
    this.z = 0;
    this.r = r;
    this.h = h;
    this.maxPieces = maxPieces;
    this.c = c;
    this.pieces = [];
  }
  
  hasOnePieceColorMatch()
  {
    return this.pieces.length == 1 && this.pieces[0].c == this.c;
  }

  draw() {
    noStroke();

    if (this.pieces.length == 1 && this.pieces[0].c == this.c) {
      push();

      sCylinder(this.x, this.z, this.y, this.r + 4, 1, "white");
      pop();
    }
    
    sCylinder(this.x, this.z, this.y, this.r, this.h, darkerColor(this.c));
    //  sCylinder(this.x, this.z, this.y, this.r, this.h/4*3, this.c);
    //  sCylinder(this.x, this.z+this.h/4*3, this.y, this.r, this.h/4, "black");

    for (let i = 0; i < this.pieces.length; i++) {
      //emissiveMaterial(this.pieces[i].c);

      sCylinder(this.x, this.z + i * 10 + 2, this.y, 15, 10, this.pieces[i].c);
    }
    fill(255);
    textSize(10);
    push();
    // textAlign(CENTER);
    // if (c != undefined) fill(c);

    let v1 = createVector(0, 0); // Starting point (x1, y1)
    let v2 = createVector(this.x, this.y); // Ending point (x2, y2)

    // Calculate the direction vector from v1 to v2
    let direction = p5.Vector.sub(v2, v1); // direction = v2 - v1

    // Normalize the direction vector to a unit vector
    direction.normalize();

    // Scale the direction vector to 10 pixels
    direction.mult(3 + this.r);

    // Calculate the new point 10 pixels beyond v2
    let newPoint = p5.Vector.add(v2, direction);

    translate(newPoint.x, this.z + 1, newPoint.y - 5);
    let axis = createVector(1, 0, 0);
    rotate(radians(-90), axis);
    axis = createVector(0, 0, 1);
    rotate(atan2(-this.x, -this.y) + radians(90), axis);

    text(this.name, 0, 0);
    pop();
  }

  addPiece(c) {
    this.pieces.push(new Piece(c));
  }

  popPiece() {
    return this.pieces.pop();
  }
}

class Piece {
  constructor(c) {
    this.c = c;
  }
}

function darkerColor(colorString) {
  // Convert string to p5.Color object
  let c = color(colorString);

  // Get the HSB values of the color
  colorMode(HSB, 360, 100, 100);
  let h = hue(c);
  let s = saturation(c);
  let b = brightness(c);

  // Decrease brightness by 20%
  b = max(0, b * 0.4); // Ensure brightness doesn't go below 0

  // Create a new darker color object
  let darkerC = color(h, s, b);

  // Reset color mode back to RGB (default)
  colorMode(RGB, 255);

  return darkerC;
}
