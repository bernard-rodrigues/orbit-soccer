(function () {
  var TAU = Math.PI * 2;
  var INK = '#1a1245', PAPER = '#fff8e7', SUN = '#ffd23f', CORAL = '#ff6b6b', MINT = '#3ddc97';
  var W = 360, BR = 8, POST = 5, GRAV = 3600, MAXPULL = 100, SPEEDK = 5.2, MINPULL = 14;
  var SPEEDS = [180, 240, 300, 360, 420, 480];
  var GOAL = { y: 96, h: 36 };
  var PAL = [
    ['#ff6b6b', '#d94a6a'], ['#ffd23f', '#f2a516'], ['#3ddc97', '#1fa874'],
    ['#4cc9f0', '#2a8fd6'], ['#b980f0', '#8a4fd6'], ['#ff9f1c', '#e0701b'], ['#f78fc8', '#d9559f']
  ];
  var FONT = 'Fredoka, "Arial Rounded MT Bold", system-ui, sans-serif';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Dificuldade = parâmetros da geração + "espaço de soluções".
     O solver já conta quantos chutes (ângulo x força) entram; a dificuldade exige
     um mínimo (e, no difícil, um máximo) desses chutes, além de gol menor e mais planetas.
     gw: [largura inicial, largura mínima]; planets: [qtd inicial, qtd máxima];
     directFrom: a partir de qual fase o chute reto é bloqueado. */
  var DIFFS = {
    facil:   { name: 'Fácil',   gw: [132, 92], planets: [1, 3], minWays: 14, maxWays: Infinity, directFrom: 4 },
    normal:  { name: 'Normal',  gw: [112, 72], planets: [2, 5], minWays: 3,  maxWays: Infinity, directFrom: 2 },
    dificil: { name: 'Difícil', gw: [100, 60], planets: [3, 6], minWays: 2,  maxWays: 30,       directFrom: 1 }
  };

  function load(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch (e) { return def; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var diffKey = load('os-diff', 'normal');
  if (!DIFFS[diffKey]) diffKey = 'normal';
  var best = load('os-best', {});

  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var cssW = cv.clientWidth || window.innerWidth;
  var cssH = cv.clientHeight || window.innerHeight;
  var H = Math.round(Math.min(780, Math.max(540, cssH / (cssW / W))));
  var START = { x: W / 2, y: H - 150 };
  var scale = 1, offX = 0, offY = 0, dpr = 1;

  function resize() {
    var r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    scale = Math.min(r.width / W, r.height / H);
    offX = (r.width - W * scale) / 2;
    offY = (r.height - H * scale) / 2;
  }
  window.addEventListener('resize', resize);
  resize();
  try { document.fonts.load('600 24px Fredoka'); } catch (e) {}

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- fases ---------- */
  function makeLevel(n) {
    var D = DIFFS[diffKey];
    var gw = Math.max(D.gw[1], D.gw[0] - n * 4);
    var gx = rnd(gw / 2 + 26, W - gw / 2 - 26);
    var count = Math.min(D.planets[0] + Math.floor((n - 1) / 2), D.planets[1]);
    var planets = [];
    for (var i = 0; i < count; i++) {
      for (var t = 0; t < 60; t++) {
        var r = rnd(15, 34), x = rnd(r + 12, W - r - 12), y = rnd(GOAL.y + 60, START.y - 90);
        if (Math.hypot(x - START.x, y - START.y) < r + 95) continue;
        if (Math.hypot(x - gx, y - GOAL.y) < r + 75) continue;
        var clash = false;
        for (var k = 0; k < planets.length; k++) {
          if (Math.hypot(x - planets[k].x, y - planets[k].y) < r + planets[k].r + 42) { clash = true; break; }
        }
        if (clash) continue;
        var c = PAL[Math.floor(Math.random() * PAL.length)];
        var spots = [];
        for (var s = 0; s < 5; s++) spots.push({ lon: rnd(0, TAU), lat: rnd(-1, 1), s: rnd(0.16, 0.3) });
        planets.push({
          x: x, y: y, r: r, m: r * r, color: c[0], dark: c[1],
          spin: rnd(0.5, 1.5) * (Math.random() < 0.5 ? -1 : 1),
          ring: r > 22 && Math.random() < 0.4, tilt: rnd(-0.5, 0.5), spots: spots
        });
        break;
      }
    }
    return { n: n, gx: gx, gw: gw, planets: planets };
  }

  /* um passo de física, usado no jogo e na checagem de fase resolvível */
  function step(b, L, h) {
    var ax = 0, ay = 0, i;
    for (i = 0; i < L.planets.length; i++) {
      var p = L.planets[i];
      var dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
      if (d < p.r + BR) return 'planet';
      var a = GRAV * p.m / (d2 + 400) / d;
      ax += a * dx; ay += a * dy;
    }
    b.vx += ax * h; b.vy += ay * h;
    b.x += b.vx * h; b.y += b.vy * h;
    var posts = [L.gx - L.gw / 2, L.gx + L.gw / 2];
    for (i = 0; i < 2; i++) {
      var qx = b.x - posts[i], qy = b.y - GOAL.y, qd = Math.hypot(qx, qy), min = POST + BR;
      if (qd < min && qd > 0) {
        var nx = qx / qd, ny = qy / qd, vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; }
        b.x = posts[i] + nx * min; b.y = GOAL.y + ny * min;
      }
    }
    if (b.y < GOAL.y - 4 && b.y > GOAL.y - GOAL.h && Math.abs(b.x - L.gx) < L.gw / 2 - 3) return 'goal';
    if (b.x < -60 || b.x > W + 60 || b.y < -50 || b.y > H + 60) return 'out';
    return null;
  }
  function sim(L, ang, sp) {
    var b = { x: START.x, y: START.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
    for (var i = 0; i < 720; i++) {
      var r = step(b, L, 1 / 90);
      if (r) return r === 'goal';
    }
    return false;
  }
  function solvable(L) {
    var D = DIFFS[diffKey], ok = 0, a, j;
    for (a = -170; a <= -10; a += 2) {
      for (j = 0; j < SPEEDS.length; j++) if (sim(L, a * Math.PI / 180, SPEEDS[j])) ok++;
    }
    if (ok < D.minWays || ok > D.maxWays) return false;
    if (L.n >= D.directFrom) {
      var da = Math.atan2(GOAL.y - 10 - START.y, L.gx - START.x);
      for (j = 0; j < SPEEDS.length; j++) if (sim(L, da, SPEEDS[j])) return false;
    }
    return true;
  }
  function genLevel(n) {
    var L;
    for (var t = 0; t < 40; t++) {
      L = makeLevel(n);
      if (solvable(L)) return L;
    }
    return L;
  }

  /* ---------- estado ---------- */
  var level = null;
  var goals = 0, shots = 0, misses = 0, firstShot = true;
  var mode = 'menu', modeT = 0, flightT = 0, clock = 0, missText = '';
  var ball = { x: START.x, y: START.y, vx: 0, vy: 0, rot: 0 };
  var trail = [], parts = [], aim = null;
  var path = [], pull = null, ghost = null; // ghost: último chute errado {dx, dy, path}
  var showMass = load('os-mass', false), massT = 1, MASS_ANIM = 0.25;

  /* estrelas em 3 camadas: longe (pequenas, azuladas, lentas) → perto (grandes, brilham em cruz).
     Coordenadas normalizadas na tela inteira; cada camada desliza e faz parallax num ritmo próprio. */
  var LAYERS = [
    { n: 70, r: [0.4, 0.9], a: 0.5, speed: 3,  par: 0.04, color: '#b9c4ff' },
    { n: 38, r: [0.9, 1.5], a: 0.8, speed: 8,  par: 0.12, color: '#e8e4ff' },
    { n: 14, r: [1.5, 2.4], a: 1,   speed: 18, par: 0.28, color: PAPER, sparkle: true }
  ];
  var stars = [];
  LAYERS.forEach(function (L) {
    for (var i = 0; i < L.n; i++) stars.push({ u: Math.random(), v: Math.random(), r: rnd(L.r[0], L.r[1]), ph: rnd(0, TAU), f: rnd(0.8, 3.2), L: L });
  });
  var cam = { x: 0, y: 0 };

  var NEWLEVEL_AFTER = 5, elNew = document.getElementById('bNew');
  var elLevel = document.getElementById('hLevel'), elShots = document.getElementById('hShots'), elGoals = document.getElementById('hGoals');
  function hud() {
    elLevel.textContent = 'Fase ' + level.n;
    elShots.textContent = 'Chutes ' + shots;
    elGoals.textContent = 'Gols ' + goals;
    // trocar de fase só depois de 5 erros nela
    var left = NEWLEVEL_AFTER - misses;
    elNew.disabled = left > 0;
    elNew.textContent = left > 0 ? 'Nova fase · ' + left : 'Nova fase';
  }

  function resetBall() {
    ball.x = START.x; ball.y = START.y; ball.vx = 0; ball.vy = 0;
    trail = []; mode = 'aim'; modeT = 0;
  }
  function loadLevel(n, keepGoals) {
    level = genLevel(n);
    shots = 0; misses = 0; parts = []; ghost = null;
    if (!keepGoals) goals = 0;
    if (n > (best[diffKey] || 0)) { best[diffKey] = n; save('os-best', best); }
    resetBall(); hud();
  }
  function burst(x, y, colors, count, speed) {
    for (var i = 0; i < count; i++) {
      var a = rnd(0, TAU), v = rnd(speed * 0.3, speed);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.6, 1.2), max: 1.2, c: colors[i % colors.length], s: rnd(3, 6.5) });
    }
  }
  function confetti() {
    var cols = [SUN, CORAL, MINT, '#4cc9f0', '#b980f0', PAPER];
    for (var i = 0; i < 70; i++) {
      parts.push({ x: rnd(20, W - 20), y: rnd(-30, 40), vx: rnd(-40, 40), vy: rnd(60, 180), life: rnd(1.4, 2.4), max: 2.4, c: cols[i % cols.length], s: rnd(4, 8), conf: true });
    }
  }

  /* ---------- menu ---------- */
  var elContinue = document.getElementById('bContinue'), elBest = document.getElementById('best');
  var radios = document.querySelectorAll('input[name=diff]');
  function showBest() {
    var b = best[diffKey] || 0;
    elBest.textContent = b > 1 ? 'Recorde: Fase ' + b : '';
  }
  function openMenu() {
    aim = null; mode = 'menu';
    document.body.classList.add('in-menu');
    elContinue.hidden = !level;
    showBest();
  }
  function closeMenu() { document.body.classList.remove('in-menu'); }
  for (var ri = 0; ri < radios.length; ri++) {
    radios[ri].checked = radios[ri].value === diffKey;
    radios[ri].addEventListener('change', function (e) {
      diffKey = e.target.value; save('os-diff', diffKey);
      level = null; elContinue.hidden = true; // fase atual foi gerada na dificuldade antiga
      showBest();
    });
  }
  document.getElementById('bPlay').addEventListener('click', function () { closeMenu(); firstShot = true; loadLevel(1, false); });
  elContinue.addEventListener('click', function () { closeMenu(); resetBall(); });
  document.getElementById('bMenu').addEventListener('click', openMenu);
  openMenu();

  /* ---------- entrada ---------- */
  function clampAim() {
    var d = Math.hypot(aim.dx, aim.dy);
    if (d > MAXPULL) { aim.dx *= MAXPULL / d; aim.dy *= MAXPULL / d; }
  }
  function planetAt(cx, cy) {
    var x = (cx - offX) / scale, y = (cy - offY) / scale;
    for (var i = 0; i < level.planets.length; i++) {
      var p = level.planets[i];
      if (Math.hypot(x - p.x, y - p.y) < p.r + 10) return true; // folga pro dedo
    }
    return false;
  }
  // inverte de onde a animação parou, sem pulo se tocar no meio dela
  function toggleMass() { showMass = !showMass; massT = MASS_ANIM - Math.min(massT, MASS_ANIM); save('os-mass', showMass); }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (mode === 'goal' && modeT > 0.6) { loadLevel(level.n + 1, true); return; }
    var hit = planetAt(e.clientX, e.clientY);
    if (mode !== 'aim') { if (hit) toggleMass(); return; }
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    aim = { px: e.clientX, py: e.clientY, dx: 0, dy: 0, tap: hit };
  });
  cv.addEventListener('pointermove', function (e) {
    if (!aim) return;
    aim.dx = (e.clientX - aim.px) / scale;
    aim.dy = (e.clientY - aim.py) / scale;
    clampAim();
  });
  function release() {
    if (!aim) return;
    var d = Math.hypot(aim.dx, aim.dy), a = aim;
    aim = null;
    if (mode !== 'aim' || d < MINPULL) { if (a.tap) toggleMass(); return; }
    ball.vx = -a.dx * SPEEDK; ball.vy = -a.dy * SPEEDK;
    ball.x = START.x; ball.y = START.y;
    mode = 'flying'; flightT = 0; trail = []; firstShot = false;
    pull = { dx: a.dx, dy: a.dy }; path = [{ x: START.x, y: START.y }];
    shots++; hud();
  }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', function () { aim = null; });
  elNew.addEventListener('click', function () { loadLevel(level.n, true); });
  document.getElementById('bReset').addEventListener('click', function () { loadLevel(1, false); });

  /* ---------- atualização ---------- */
  function endFlight(res) {
    if (res === 'goal') {
      mode = 'goal'; modeT = 0; goals++; hud(); confetti();
      burst(ball.x, ball.y, [SUN, PAPER], 18, 160);
    } else {
      mode = 'miss'; modeT = 0; misses++; hud();
      ghost ={ dx: pull.dx, dy: pull.dy, path: path };
      missText = res === 'planet' ? 'Ops! Bateu num planeta' : 'Perdida no espaço!';
      if (res === 'planet') burst(ball.x, ball.y, [PAPER, SUN, CORAL], 22, 200);
    }
  }
  function update(dt) {
    clock += dt; modeT += dt; massT += dt;
    // câmera das estrelas segue a bola (ou o puxão do estilingue) com atraso suave
    var tx = 0, ty = 0;
    if (mode === 'flying') { tx = ball.x - START.x; ty = ball.y - START.y; }
    else if (mode === 'aim' && aim) { tx = aim.dx; ty = aim.dy; }
    var k = Math.min(1, dt * 2.5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    if (mode === 'menu') return;
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i]; p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.conf) p.vy += 40 * dt; else { p.vx *= 0.96; p.vy *= 0.96; }
      if (p.life <= 0) parts.splice(i, 1);
    }
    if (mode === 'flying') {
      flightT += dt;
      var n = 4, h = dt / n, res = null;
      for (i = 0; i < n && !res; i++) res = step(ball, level, h);
      ball.rot += ball.vx * dt * 0.05;
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 34) trail.shift();
      path.push({ x: ball.x, y: ball.y });
      if (!res && flightT > 10) res = 'out';
      if (res) endFlight(res);
    } else if (mode === 'miss') {
      if (trail.length) trail.shift();
      if (modeT > 0.95) resetBall();
    } else if (mode === 'goal') {
      if (trail.length) trail.shift();
      if (modeT > 2.4) loadLevel(level.n + 1, true);
    }
  }

  /* ---------- desenho ---------- */
  function wrap(v, m) { return ((v % m) + m) % m; }
  function drawStars(cw, ch) {
    var drift = mode === 'menu' ? 2.2 : 1, pad = 12;
    for (var i = 0; i < stars.length; i++) {
      var st = stars[i], L = st.L;
      var x = st.u * (cw + pad * 2), y = st.v * (ch + pad * 2);
      if (!reduced) {
        x = wrap(x - cam.x * L.par * scale, cw + pad * 2);
        y = wrap(y + clock * L.speed * drift - cam.y * L.par * scale, ch + pad * 2);
      }
      x -= pad; y -= pad;
      var tw = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(clock * st.f + st.ph);
      ctx.globalAlpha = L.a * (0.25 + 0.75 * tw * tw);
      ctx.fillStyle = L.color;
      ctx.beginPath(); ctx.arc(x, y, st.r, 0, TAU); ctx.fill();
      // cintilar: no pico do brilho as estrelas próximas abrem uma cruz de luz
      if (L.sparkle && tw > 0.75) {
        var s = st.r * 2 + st.r * 7 * (tw - 0.75) / 0.25;
        ctx.globalAlpha = (tw - 0.75) * 3;
        ctx.strokeStyle = L.color; ctx.lineWidth = 1; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - s, y); ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s); ctx.lineTo(x, y + s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function poly(n, r, rot) {
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      var a = rot + i * TAU / n;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function drawBall(x, y, rot) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); ctx.arc(0, 0, BR, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = INK;
    poly(5, BR * 0.42, -Math.PI / 2); ctx.fill();
    for (var i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate(i * TAU / 5 - Math.PI / 2 + Math.PI / 5);
      ctx.translate(BR * 1.0, 0);
      poly(5, BR * 0.36, 0); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, BR, 0, TAU);
    ctx.lineWidth = 2.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  function ringPath(p, from, to) {
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.r * 1.8, p.r * 0.55, p.tilt, from, to);
  }
  function drawRing(p, from, to) {
    ringPath(p, from, to); ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.lineCap = 'round'; ctx.stroke();
    ringPath(p, from, to); ctx.lineWidth = 4.5; ctx.strokeStyle = p.dark; ctx.stroke();
  }
  function drawPlanet(p) {
    var rot = clock * p.spin;
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.6, 0, TAU);
    ctx.fillStyle = 'rgba(255,248,231,0.05)'; ctx.fill();
    ctx.setLineDash([4, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,248,231,0.2)'; ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    if (p.ring) drawRing(p, Math.PI, TAU);
    ctx.save();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fillStyle = p.color; ctx.fill();
    ctx.clip();
    ctx.fillStyle = p.dark;
    for (var i = 0; i < p.spots.length; i++) {
      var sp = p.spots[i], a = sp.lon + rot, c = Math.cos(a);
      if (c <= 0.05) continue;
      var sx = p.x + p.r * Math.cos(sp.lat) * Math.sin(a), sy = p.y + p.r * Math.sin(sp.lat);
      ctx.beginPath(); ctx.ellipse(sx, sy, p.r * sp.s * c, p.r * sp.s, 0, 0, TAU); ctx.fill();
    }
    var g = ctx.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.4, p.r * 0.1, p.x, p.y, p.r * 1.15);
    g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(26,18,69,0.4)');
    ctx.fillStyle = g; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.lineWidth = 3.5; ctx.strokeStyle = INK; ctx.stroke();
    if (p.ring) drawRing(p, 0, Math.PI);
  }
  function drawGoal() {
    var x0 = level.gx - level.gw / 2, x1 = level.gx + level.gw / 2, yT = GOAL.y - GOAL.h, yB = GOAL.y;
    var glow = mode === 'goal' ? 0.35 + 0.25 * Math.sin(modeT * 14) : 0;
    ctx.fillStyle = 'rgba(255,248,231,' + (0.14 + glow) + ')';
    ctx.fillRect(x0, yT, level.gw, GOAL.h);
    ctx.strokeStyle = 'rgba(255,248,231,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = x0 + 9; x < x1; x += 9) { ctx.moveTo(x, yT); ctx.lineTo(x, yB); }
    for (var y = yT + 9; y < yB; y += 9) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, yB); ctx.lineTo(x0, yT); ctx.lineTo(x1, yT); ctx.lineTo(x1, yB);
    ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.stroke();
    ctx.lineWidth = 4.5; ctx.strokeStyle = PAPER; ctx.stroke();
    [x0, x1].forEach(function (px) {
      ctx.beginPath(); ctx.arc(px, yB, POST, 0, TAU);
      ctx.fillStyle = CORAL; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
    });
  }
  var GHOST = '#7a70c2'; // lavanda apagada: some no fundo, mas se distingue do rastro atual (PAPER)
  function drawGhost() {
    var i, gx = START.x + ghost.dx, gy = START.y + ghost.dy;
    ctx.fillStyle = GHOST; ctx.globalAlpha = 0.5;
    for (i = 0; i < ghost.path.length; i += 3) {
      ctx.beginPath(); ctx.arc(ghost.path[i].x, ghost.path[i].y, 1.6, 0, TAU); ctx.fill();
    }
    // onde o dedo soltou: direção e força do último chute
    ctx.globalAlpha = 0.55; ctx.strokeStyle = GHOST; ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(START.x, START.y); ctx.lineTo(gx, gy); ctx.stroke();
    ctx.beginPath(); ctx.arc(gx, gy, BR, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  /* leitura de massa estilo painel de corrida sci-fi dos anos 90: mira, LCD e barra de segmentos */
  var PHOSPHOR = '#7dffb0', MAXM = 34 * 34;
  function drawMass(p, k) {
    var s = p.r + 6 + (1 - k) * 16, c = 6;
    ctx.save();
    ctx.globalAlpha = (0.7 + (reduced ? 0 : 0.08 * Math.sin(clock * 37 + p.x))) * k;
    ctx.strokeStyle = PHOSPHOR; ctx.fillStyle = PHOSPHOR; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
    ctx.beginPath();
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) {
      var x = p.x + q[0] * s, y = p.y + q[1] * s;
      ctx.moveTo(x, y - q[1] * c); ctx.lineTo(x, y); ctx.lineTo(x - q[0] * c, y);
    });
    ctx.stroke();
    var right = p.x + s + 52 < W, lx = right ? p.x + s + 4 : p.x - s - 4;
    ctx.font = '15px VT323, ui-monospace, monospace';
    ctx.textAlign = right ? 'left' : 'right'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('M ' + (p.m / 400).toFixed(2), lx, p.y - s + 9);
    var segs = Math.max(1, Math.round(p.m / MAXM * 6));
    for (var i = 0; i < 6; i++) {
      var bx = right ? lx + i * 6 : lx - 5 - i * 6;
      ctx.globalAlpha = (i < segs ? 0.75 : 0.18) * k;
      ctx.fillRect(bx, p.y - s + 13, 4, 3);
    }
    ctx.restore();
  }
  function ease(x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  function banner(text, size, color, y) {
    var s = modeT < 0.25 ? Math.max(0.01, ease(modeT / 0.25)) : 1;
    ctx.save();
    ctx.translate(W / 2, y); ctx.scale(s, s);
    ctx.font = '600 ' + size + 'px ' + FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.24; ctx.strokeStyle = INK; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = color; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  function draw() {
    var cw = cv.width / dpr, ch = cv.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var bg = ctx.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#2f1f86'); bg.addColorStop(1, '#120b3d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    drawStars(cw, ch);
    if (mode === 'menu') return;
    ctx.save();
    ctx.translate(offX, offY); ctx.scale(scale, scale);
    var i;
    drawGoal();
    for (i = 0; i < level.planets.length; i++) drawPlanet(level.planets[i]);
    var mk = reduced ? 1 : Math.min(1, massT / MASS_ANIM);
    if (!showMass) mk = reduced ? 0 : 1 - mk;
    if (mk > 0) for (i = 0; i < level.planets.length; i++) drawMass(level.planets[i], mk);
    if (ghost) drawGhost();

    // base do estilingue
    ctx.beginPath(); ctx.ellipse(START.x, START.y + BR + 5, 24, 8, 0, 0, TAU);
    ctx.fillStyle = MINT; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();

    // rastro
    for (i = 0; i < trail.length; i++) {
      var f = (i + 1) / trail.length;
      ctx.globalAlpha = f * 0.5; ctx.fillStyle = PAPER;
      ctx.beginPath(); ctx.arc(trail[i].x, trail[i].y, BR * 0.7 * f, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;

    var bx = ball.x, by = ball.y;
    var pulling = mode === 'aim' && aim;
    if (pulling) { bx = START.x + aim.dx; by = START.y + aim.dy; }
    if (mode === 'aim') {
      var pl = { x: START.x - 26, y: START.y + 4 }, pr = { x: START.x + 26, y: START.y + 4 };
      [pl, pr].forEach(function (pp) {
        ctx.beginPath(); ctx.moveTo(pp.x, pp.y); ctx.lineTo(bx, by);
        ctx.lineCap = 'round'; ctx.lineWidth = 7; ctx.strokeStyle = INK; ctx.stroke();
        ctx.lineWidth = 3.5; ctx.strokeStyle = SUN; ctx.stroke();
        ctx.beginPath(); ctx.arc(pp.x, pp.y, 5, 0, TAU);
        ctx.fillStyle = CORAL; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
      });
      if (pulling) {
        var d = Math.hypot(aim.dx, aim.dy);
        if (d > MINPULL) {
          var ux = -aim.dx / d, uy = -aim.dy / d;
          for (i = 1; i <= 4; i++) {
            var dist = 26 + i * (10 + d * 0.18);
            ctx.globalAlpha = 1 - i * 0.18;
            ctx.beginPath(); ctx.arc(START.x + ux * dist, START.y + uy * dist, 3.2, 0, TAU);
            ctx.fillStyle = PAPER; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
    }
    if (!(mode === 'goal' && modeT > 0.05) && !(mode === 'miss' && modeT < 0.9 && missText.indexOf('planeta') > -1 && modeT > 0.02)) {
      drawBall(bx, by, ball.rot);
    }

    for (i = 0; i < parts.length; i++) {
      var q = parts[i];
      ctx.globalAlpha = Math.min(1, q.life / 0.5);
      ctx.fillStyle = q.c;
      if (q.conf) ctx.fillRect(q.x, q.y, q.s, q.s * 0.6);
      else { ctx.beginPath(); ctx.arc(q.x, q.y, q.s * Math.min(1, q.life / q.max + 0.3), 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    if (mode === 'aim' && firstShot && !aim) {
      ctx.font = '600 16px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
      var tx = 'Arraste para trás e solte', yy = START.y - 52 + Math.sin(clock * 3) * 3;
      ctx.strokeText(tx, W / 2, yy); ctx.fillStyle = PAPER; ctx.fillText(tx, W / 2, yy);
    }
    if (mode === 'goal') {
      banner('GOL!', 64, SUN, H * 0.42);
      if (modeT > 0.6) {
        ctx.font = '600 16px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK;
        ctx.strokeText('Toque para a próxima fase', W / 2, H * 0.42 + 54);
        ctx.fillStyle = PAPER; ctx.fillText('Toque para a próxima fase', W / 2, H * 0.42 + 54);
      }
    } else if (mode === 'miss') {
      banner(missText, 26, CORAL, H * 0.42);
    }
    ctx.restore();
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
