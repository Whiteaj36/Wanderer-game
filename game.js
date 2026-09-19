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
  var MAX_SPEED = 260; // px per second

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

  // ---- Background (subtle wandering dot grid, gives sense of motion) ----
  var GRID_SPACING = 60;
  var worldOffsetX = 0;
  var worldOffsetY = 0;

  function drawBackground() {
    ctx.fillStyle = "#1b2430";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    var offX = ((worldOffsetX % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;
    var offY = ((worldOffsetY % GRID_SPACING) + GRID_SPACING) % GRID_SPACING;

    for (var x = -offX; x < width + GRID_SPACING; x += GRID_SPACING) {
      for (var y = -offY; y < height + GRID_SPACING; y += GRID_SPACING) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
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

  function update(dt) {
    if (drag.magnitude > 0) {
      player.angle = Math.atan2(drag.dirY, drag.dirX);
      var speed = MAX_SPEED * drag.magnitude;
      var moveX = drag.dirX * speed * dt;
      var moveY = drag.dirY * speed * dt;

      var bounds = getBoundary();
      var newX = Math.max(bounds.left, Math.min(bounds.right, player.x + moveX));
      var newY = Math.max(bounds.top, Math.min(bounds.bottom, player.y + moveY));

      var appliedX = newX - player.x;
      var appliedY = newY - player.y;

      // The portion of the attempted move the boundary refused to let
      // through. The character stands still against the wall, but the
      // background keeps scrolling by that blocked amount so it still
      // reads as movement.
      var blockedX = moveX - appliedX;
      var blockedY = moveY - appliedY;

      player.x = newX;
      player.y = newY;

      worldOffsetX += blockedX * 0.5;
      worldOffsetY += blockedY * 0.5;
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

  requestAnimationFrame(function (t) {
    lastTime = t;
    requestAnimationFrame(frame);
  });
})();
