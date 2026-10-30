(function () {
  const STORAGE_KEY = 'nyang-tower-v1';
  const RAMP_SECONDS = 60; // 이 시간에 걸쳐 점점 어려워진다
  const VISIBLE_FLOORS = 7;
  const CLIMB_TIME = 5.5; // 한 칸 오를 때 채워지는 시간(%)
  const FISH_TIME = 12;
  const BUMP_TIME = 15; // 장애물에 부딪히면 깎이는 시간(%)
  const BUMP_MS = 300;
  const OBSTACLES = ['🐶', '🧹', '🪤'];

  const $ = (id) => document.getElementById(id);
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const catImg = new Image();
  catImg.src = '../../assets/cat.svg';

  let width = 0;
  let height = 0;
  let best = loadBest();
  let game = null;

  function loadBest() {
    try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; } catch (e) { return 0; }
  }

  function saveBest() {
    try { localStorage.setItem(STORAGE_KEY, String(best)); } catch (e) {}
  }

  function showBest() {
    $('best').textContent = best ? '최고 ' + best : '';
  }

  const lerp = (a, b, t) => a + (b - a) * t;
  const other = (side) => (side === 'L' ? 'R' : 'L');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = field.clientWidth;
    height = field.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw();
  }

  // 0(처음) ~ 1(가장 어려움)
  function progress(now) {
    return Math.min(1, (now - game.startedAt) / (RAMP_SECONDS * 1000));
  }

  // 층마다 장애물은 한쪽에만 둔다. 반대쪽은 늘 안전하고, 가끔 생선이 있다.
  function makeFloor(p) {
    const floor = { obs: null, obsEmoji: '', fish: null };
    if (Math.random() > lerp(0.35, 0.08, p)) {
      floor.obs = Math.random() < 0.5 ? 'L' : 'R';
      floor.obsEmoji = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
    }
    if (Math.random() < 0.12) {
      floor.fish = floor.obs ? other(floor.obs) : (Math.random() < 0.5 ? 'L' : 'R');
    }
    return floor;
  }

  function floorAt(i) {
    while (game.floors.length <= i) game.floors.push(makeFloor(progress(performance.now())));
    return game.floors[i];
  }

  function newGame() {
    const g = {
      floors: [{ obs: null, obsEmoji: '', fish: null }],
      level: 0,
      side: 'L',
      cam: 0,
      score: 0,
      time: 100,
      startedAt: 0,
      lastFrame: 0,
      jumpAt: -1000,
      bumpUntil: 0,
      bumpSide: null,
      popups: [],
      over: false,
    };
    return g;
  }

  function climb(side) {
    if (!game || game.over) return;
    const now = performance.now();
    if (now < game.bumpUntil) return;
    const next = floorAt(game.level + 1);
    if (next.obs === side) {
      game.time = Math.max(0, game.time - BUMP_TIME);
      game.bumpUntil = now + BUMP_MS;
      game.bumpSide = side;
      game.popups.push({ text: '⏱−', side, level: game.level + 1, until: now + 600, good: false });
      if (navigator.vibrate) navigator.vibrate(100);
      return;
    }
    game.level++;
    game.side = side;
    game.jumpAt = now;
    game.score++;
    game.time = Math.min(100, game.time + CLIMB_TIME);
    if (next.fish === side) {
      next.fish = null;
      game.score += 3;
      game.time = Math.min(100, game.time + FISH_TIME);
      game.popups.push({ text: '+3', side, level: game.level, until: now + 600, good: true });
    }
  }

  function update(now) {
    const dt = Math.min(0.05, (now - game.lastFrame) / 1000);
    game.lastFrame = now;
    // 60초가 지나도 조금씩 더 빨라져서, 아무리 잘해도 언젠가는 끝난다.
    const overtime = Math.max(0, (now - game.startedAt) / 1000 - RAMP_SECONDS);
    game.time -= (lerp(10, 26, progress(now)) + overtime * 0.3) * dt;
    game.cam += (game.level - game.cam) * Math.min(1, dt * 14);
    game.popups = game.popups.filter((p) => p.until > now);

    $('time').style.width = Math.max(0, game.time) + '%';
    $('time').classList.toggle('low', game.time <= 25);
    $('score').textContent = game.score;
    if (game.time <= 0) finish(now);
  }

  function floorH() {
    return height / VISIBLE_FLOORS;
  }

  // i층 발판의 윗면 y좌표
  function floorY(i, cam) {
    return height - floorH() * 1.3 - (i - cam) * floorH();
  }

  function sideX(side) {
    return side === 'L' ? width * 0.27 : width * 0.73;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    const g = game || { level: 0, cam: 0, side: 'L', floors: [], popups: [], bumpUntil: 0, jumpAt: -1000 };
    const now = performance.now();
    const fh = floorH();
    const postW = Math.max(18, width * 0.07);

    // 기둥
    ctx.fillStyle = '#c99a6b';
    ctx.fillRect(width / 2 - postW / 2, 0, postW, height);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = (g.cam * fh) % 14; y < height; y += 14) {
      ctx.fillRect(width / 2 - postW / 2, y, postW, 3);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const from = Math.max(0, Math.floor(g.cam) - 2);
    for (let i = from; i < from + VISIBLE_FLOORS + 3; i++) {
      const y = floorY(i, g.cam);
      if (y < -fh || y > height + fh) continue;
      const floor = game ? floorAt(i) : (i === 0 ? { obs: null, fish: null } : null);
      drawBoard('L', y, postW);
      drawBoard('R', y, postW);
      if (!floor) continue;
      const size = Math.min(fh * 0.62, 44);
      ctx.font = size + 'px sans-serif';
      if (floor.obs) ctx.fillText(floor.obsEmoji, sideX(floor.obs), y - 4);
      if (floor.fish) ctx.fillText('🐟', sideX(floor.fish), y - 6);
    }

    // 냥이
    if (catImg.complete) {
      const size = Math.min(fh * 0.85, 72);
      const t = Math.min(1, (now - g.jumpAt) / 140);
      const hop = Math.sin(t * Math.PI) * fh * 0.25;
      const bump = now < g.bumpUntil ? Math.sin(now / 20) * 4 : 0;
      const x = sideX(g.side) - size / 2 + bump;
      const y = floorY(g.level, g.cam) - size + 4 - hop;
      ctx.drawImage(catImg, x, y, size, size);
    }

    ctx.font = 'bold 22px sans-serif';
    for (const p of g.popups) {
      const t = 1 - (p.until - now) / 600;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.good ? '#e07b1f' : '#d64545';
      ctx.fillText(p.text, sideX(p.side), floorY(p.level, g.cam) - fh * 0.7 - 20 * t);
    }
    ctx.globalAlpha = 1;
  }

  function drawBoard(side, y, postW) {
    const margin = width * 0.05;
    const x1 = side === 'L' ? margin : width / 2 + postW / 2;
    const x2 = side === 'L' ? width / 2 - postW / 2 : width - margin;
    ctx.fillStyle = '#e9c9a3';
    roundRect(x1, y, x2 - x1, 12, 6);
    ctx.fillStyle = '#b5835a';
    roundRect(x1 + 4, y + 10, x2 - x1 - 8, 4, 2);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }

  function loop(now) {
    if (!game || game.over) return;
    update(now);
    draw();
    if (!game.over) requestAnimationFrame(loop);
  }

  function start() {
    $('start').hidden = true;
    game = newGame();
    game.startedAt = game.lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function finish(now) {
    game.over = true;
    game.time = 0;
    $('time').style.width = '0%';
    const score = game.score;
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest();
      showBest();
    }
    $('result-score').textContent = score;
    $('result-title').textContent = isRecord && score > 0 ? '🎉 새 기록이다옹!'
      : game.level >= 150 ? '하늘까지 올라갔다옹!'
      : game.level >= 60 ? '높이 올라갔다옹!'
      : '조금만 더 높이 가고 싶다옹…';
    $('result-time').textContent = game.level + '층까지 올라갔어요';
    $('result-best').textContent = '최고 기록 ' + best + '점';
    $('result').returnValue = '';
    $('result').showModal();
  }

  field.addEventListener('pointerdown', (e) => {
    if (!game || game.over || !$('start').hidden) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    climb(e.clientX - rect.left < width / 2 ? 'L' : 'R');
  });

  // 컴퓨터에서는 화살표 키로도 할 수 있다.
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'ArrowLeft') { climb('L'); e.preventDefault(); }
    if (e.key === 'ArrowRight') { climb('R'); e.preventDefault(); }
  });

  $('start-btn').addEventListener('click', start);
  $('result').addEventListener('close', () => {
    if ($('result').returnValue === 'again') start();
    else $('start').hidden = false;
  });

  catImg.onload = draw;
  window.addEventListener('resize', resize);
  showBest();
  resize();
})();
