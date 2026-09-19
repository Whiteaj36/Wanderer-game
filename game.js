(function () {
  "use strict";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var hint = document.getElementById("hint");

  var dpr = Math.max(1, window.devicePixelRatio || 1);
  var width = 0;
  var height = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  // ---- Character ----
  var player = {
    x: 0,
    y: 0,
    radius: 22,
    angle: -Math.PI / 2, // facing up
    speed: 0 // current speed, 0..maxSpeed
  };
  var MAX_SPEED = 210; // px per second

  function resetPlayerPosition() {
    player.x = width / 2;
    player.y = height / 2;
  }
  resetPlayerPosition();

  // ---- Drag / joystick control ----
  var MAX_DRAG = 70; // px, distance at which speed maxes out
  var DEAD_ZONE = 6; // px, ignore tiny jitter

  var drag = {
    active: false,
    pointerId: null,
    originX: 0,
    originY: 0,
    currentX: 0,
    currentY: 0,
    dirX: 0,
    dirY: 0,
    magnitude: 0 // 0..1
  };

  function hideHint() {
    if (!hint.classList.contains("hidden")) {
      hint.classList.add("hidden");
    }
  }

  function updateDragVector() {
    var dx = drag.currentX - drag.originX;
    var dy = drag.currentY - drag.originY;
    var dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < DEAD_ZONE) {
      drag.dirX = 0;
      drag.dirY = 0;
      drag.magnitude = 0;
      return;
    }

    var clamped = Math.min(dist, MAX_DRAG);
    drag.dirX = dx / dist;
    drag.dirY = dy / dist;
    drag.magnitude = (clamped - DEAD_ZONE) / (MAX_DRAG - DEAD_ZONE);
    if (drag.magnitude < 0) drag.magnitude = 0;
    if (drag.magnitude > 1) drag.magnitude = 1;
  }

  function onPointerDown(e) {
    if (drag.active) return;
    hideHint();
    canvas.setPointerCapture(e.pointerId);
    drag.active = true;
    drag.pointerId = e.pointerId;
    drag.originX = e.clientX;
    drag.originY = e.clientY;
    drag.currentX = e.clientX;
    drag.currentY = e.clientY;
    updateDragVector();
  }

  function onPointerMove(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    drag.currentX = e.clientX;
    drag.currentY = e.clientY;
    updateDragVector();
  }

  function endDrag(e) {
    if (!drag.active || e.pointerId !== drag.pointerId) return;
    drag.active = false;
    drag.pointerId = null;
    drag.dirX = 0;
    drag.dirY = 0;
    drag.magnitude = 0;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  window.addEventListener("blur", function () {
    drag.active = false;
    drag.dirX = 0;
    drag.dirY = 0;
    drag.magnitude = 0;
  });

  // ---- World coordinate system ----
  // The world is a 500x500 grid of tiles tracked in a plain 2D array. The
  // character's true position lives here (starting at the middle cell) and
  // the background tiles are drawn by reading straight out of this grid,
  // rather than from a free-floating pixel offset.
  var GRID_SPACING = 60; // px per tile
  var WORLD_SIZE = 500;
  var WORLD_CENTER = Math.floor(WORLD_SIZE / 2);

  var world = [];
  for (var wr = 0; wr < WORLD_SIZE; wr++) {
    world.push(new Array(WORLD_SIZE).fill(0));
  }

  var worldCol = WORLD_CENTER;
  var worldRow = WORLD_CENTER;

  // Loads a dense 2D grid (see worlds/forest.json) as the world array. The
  // grid's one "player" cell sets the spawn point and is cleared back to
  // empty, since the player is a moving actor, not a static tile.
  function loadWorldFromGrid(grid) {
    var size = grid.length;
    var spawnCol = null;
    var spawnRow = null;

    for (var r = 0; r < size; r++) {
      for (var c = 0; c < grid[r].length; c++) {
        if (grid[r][c] === "player") {
          spawnCol = c;
          spawnRow = r;
          grid[r][c] = 0;
        }
      }
    }

    world = grid;
    WORLD_SIZE = size;
    worldCol = spawnCol !== null ? spawnCol : Math.floor(WORLD_SIZE / 2);
    worldRow = spawnRow !== null ? spawnRow : Math.floor(WORLD_SIZE / 2);
  }

  function loadWorldFile(path) {
    return fetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error("world file not found: " + path);
        return res.json();
      })
      .then(loadWorldFromGrid)
      .catch(function () {
        // Keep the default empty world, spawned at the middle cell.
      });
  }

  function drawBackground() {
    ctx.fillStyle = "#1b2430";
    ctx.fillRect(0, 0, width, height);

    // Tiles are anchored at the character's actual screen position, not an
    // assumed box center, since the sprite doesn't always sit dead center
    // in the boundary box.
    var firstCol = Math.max(0, Math.floor(worldCol - player.x / GRID_SPACING) - 1);
    var lastCol = Math.min(WORLD_SIZE - 1, Math.ceil(worldCol + (width - player.x) / GRID_SPACING) + 1);
    var firstRow = Math.max(0, Math.floor(worldRow - player.y / GRID_SPACING) - 1);
    var lastRow = Math.min(WORLD_SIZE - 1, Math.ceil(worldRow + (height - player.y) / GRID_SPACING) + 1);

    for (var col = firstCol; col <= lastCol; col++) {
      var screenX = player.x + (col - worldCol) * GRID_SPACING;
      for (var row = firstRow; row <= lastRow; row++) {
        var screenY = player.y + (row - worldRow) * GRID_SPACING;
        var tile = world[row][col];

        if (tile === "tree") {
          drawTree(screenX, screenY);
        } else {
          ctx.beginPath();
          ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
          ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawTree(x, y) {
    ctx.beginPath();
    ctx.fillStyle = "#7a5230";
    ctx.fillRect(x - 1.5, y - 1, 3, 6);

    ctx.beginPath();
    ctx.arc(x, y - 4, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#5fae74";
    ctx.fill();
    ctx.strokeStyle = "#3f7d52";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawBoundary() {
    var halfW = width / 4;
    var halfH = height / 4;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.strokeRect(width / 2 - halfW, height / 2 - halfH, halfW * 2, halfH * 2);
    ctx.restore();
  }

  // ---- Joystick visuals ----
  function drawJoystick() {
    if (!drag.active) return;

    ctx.save();

    ctx.beginPath();
    ctx.arc(drag.originX, drag.originY, MAX_DRAG, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    var dx = drag.currentX - drag.originX;
    var dy = drag.currentY - drag.originY;
    var dist = Math.min(Math.sqrt(dx * dx + dy * dy), MAX_DRAG);
    var angle = Math.atan2(dy, dx);
    var stickX = drag.originX + Math.cos(angle) * dist;
    var stickY = drag.originY + Math.sin(angle) * dist;

    ctx.beginPath();
    ctx.arc(stickX, stickY, 26, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(120, 200, 255, 0.35)";
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 200, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ---- Character rendering ----
  var bobPhase = 0;

  function drawPlayer(dt) {
    var moving = drag.magnitude > 0;
    if (moving) {
      bobPhase += dt * 10 * (0.4 + drag.magnitude);
    }
    var bob = moving ? Math.sin(bobPhase) * 3 : 0;

    ctx.save();
    ctx.translate(player.x, player.y + bob);

    // shadow
    ctx.beginPath();
    ctx.ellipse(0, player.radius * 0.9 - bob * 0.3, player.radius * 0.9, player.radius * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fill();

    ctx.rotate(player.angle + Math.PI / 2);

    // body
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    var grad = ctx.createRadialGradient(-player.radius * 0.3, -player.radius * 0.3, 2, 0, 0, player.radius);
    grad.addColorStop(0, "#ffd873");
    grad.addColorStop(1, "#f4a531");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#c97b16";
    ctx.lineWidth = 2;
    ctx.stroke();

    // direction indicator (nose)
    ctx.beginPath();
    ctx.moveTo(-player.radius * 0.35, -player.radius * 0.6);
    ctx.lineTo(0, -player.radius * 1.25);
    ctx.lineTo(player.radius * 0.35, -player.radius * 0.6);
    ctx.closePath();
    ctx.fillStyle = "#e8791f";
    ctx.fill();

    // eyes
    ctx.beginPath();
    ctx.arc(-player.radius * 0.32, -player.radius * 0.1, 3.5, 0, Math.PI * 2);
    ctx.arc(player.radius * 0.32, -player.radius * 0.1, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#3a2a12";
    ctx.fill();

    ctx.restore();
  }

  // ---- Main loop ----
  var lastTime = performance.now();

  // The boundary box extends half the distance from the center to each
  // screen edge, so it spans the middle 50% of the screen in both axes.
  function getBoundary() {
    var halfW = width / 4;
    var halfH = height / 4;
    var cx = width / 2;
    var cy = height / 2;
    return {
      left: cx - halfW + player.radius,
      right: cx + halfW - player.radius,
      top: cy - halfH + player.radius,
      bottom: cy + halfH - player.radius
    };
  }

  // True while the tile at (col, row) is a tree, blocking movement into it.
  function isTreeAt(col, row) {
    var r = Math.round(row);
    var c = Math.round(col);
    if (r < 0 || r >= WORLD_SIZE || c < 0 || c >= WORLD_SIZE) return false;
    return world[r][c] === "tree";
  }

  function update(dt) {
    if (drag.magnitude > 0) {
      player.angle = Math.atan2(drag.dirY, drag.dirX);
      var speed = MAX_SPEED * drag.magnitude;
      var moveX = drag.dirX * speed * dt;
      var moveY = drag.dirY * speed * dt;

      // A tree blocks real movement through the world, on whichever axis
      // walks into it, while the other axis can still carry the character
      // past it.
      if (isTreeAt(worldCol + moveX / GRID_SPACING, worldRow)) moveX = 0;
      if (isTreeAt(worldCol, worldRow + moveY / GRID_SPACING)) moveY = 0;

      var bounds = getBoundary();
      var newX = Math.max(bounds.left, Math.min(bounds.right, player.x + moveX));
      var newY = Math.max(bounds.top, Math.min(bounds.bottom, player.y + moveY));

      player.x = newX;
      player.y = newY;

      // The world coordinate tracks the character's real position in the
      // game world, so it advances with the full attempted move at the same
      // rate as the sprite itself - not a fraction of it, and not gated on
      // whether the boundary let the sprite move. Tiles are drawn relative
      // to (player.x, player.y), so this keeps the tile under the sprite
      // correct at every moment: static while the sprite is free to move
      // with it, and sliding past once the sprite is pinned at the wall.
      worldCol = Math.max(0, Math.min(WORLD_SIZE - 1, worldCol + moveX / GRID_SPACING));
      worldRow = Math.max(0, Math.min(WORLD_SIZE - 1, worldRow + moveY / GRID_SPACING));
    }
  }

  function frame(now) {
    var dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    update(dt);

    drawBackground();
    drawBoundary();
    drawJoystick();
    drawPlayer(dt);

    requestAnimationFrame(frame);
  }

  loadWorldFile("worlds/forest.json").then(function () {
    requestAnimationFrame(function (t) {
      lastTime = t;
      requestAnimationFrame(frame);
    });
  });
})();
