(function () {
  const STORAGE_KEY = 'nyang-snack-v1';
  const GAME_SECONDS = 30;
  const CAT_SIZE = 96;

  // 떨어지는 것들. weight가 클수록 자주 나온다.
  const ITEMS = [
    { emoji: '🐟', points: 1, weight: 60 },
    { emoji: '🍗', points: 3, weight: 20 },
    { emoji: '⭐', points: 10, weight: 4, fast: true },
    { emoji: '🥒', points: -5, weight: 16 },
  ];
  const TOTAL_WEIGHT = ITEMS.reduce((sum, item) => sum + item.weight, 0);

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

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    width = field.clientWidth;
    height = field.clientHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (game) game.catX = Math.min(Math.max(game.catX, CAT_SIZE / 2), width - CAT_SIZE / 2);
    draw();
  }

  function pickItem() {
    let r = Math.random() * TOTAL_WEIGHT;
    for (const item of ITEMS) {
      r -= item.weight;
      if (r < 0) return item;
    }
    return ITEMS[0];
  }

  function newGame() {
    return {
      score: 0,
      startedAt: performance.now(),
      lastFrame: performance.now(),
      nextSpawn: 0,
      catX: width / 2,
      startledUntil: 0,
      falling: [],
      popups: [],
      over: false,
    };
  }

  // 시간이 갈수록 간식이 빨리, 자주 떨어진다 (0~1).
  function progress(now) {
    return Math.min(1, (now - game.startedAt) / (GAME_SECONDS * 1000));
  }

  function spawn(now) {
    const item = pickItem();
    const p = progress(now);
    const speed = (160 + 220 * p) * (item.fast ? 1.5 : 1) * (0.9 + Math.random() * 0.2);
    game.falling.push({ item, x: 24 + Math.random() * (width - 48), y: -30, speed });
    game.nextSpawn = now + (650 - 350 * p) * (0.7 + Math.random() * 0.6);
  }

  function catTop() {
    return height - CAT_SIZE - 6;
  }

  function catch_(f, now) {
    game.score = Math.max(0, game.score + f.item.points);
    const good = f.item.points > 0;
    game.popups.push({
      text: (good ? '+' : '') + f.item.points,
      x: f.x, y: catTop(), until: now + 700, good,
    });
    if (!good) {
      game.startledUntil = now + 600;
      if (navigator.vibrate) navigator.vibrate(120);
    }
  }

  function update(now) {
    const dt = Math.min(0.05, (now - game.lastFrame) / 1000);
    game.lastFrame = now;

    if (now >= game.nextSpawn) spawn(now);

    const top = catTop();
    game.falling = game.falling.filter((f) => {
      const prevY = f.y;
      f.y += f.speed * dt;
      // 냥이 머리 높이를 지나가는 순간 냥이 몸 폭 안에 있으면 받은 것.
      if (prevY < top + 20 && f.y >= top + 20 && Math.abs(f.x - game.catX) < CAT_SIZE * 0.5) {
        catch_(f, now);
        return false;
      }
      return f.y < height + 30;
    });
    game.popups = game.popups.filter((p) => p.until > now);

    const left = Math.max(0, GAME_SECONDS - (now - game.startedAt) / 1000);
    $('time').textContent = Math.ceil(left);
    $('score').textContent = game.score;
    if (left <= 0) finish();
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    if (!game) {
      drawCat(width / 2, false);
      return;
    }
    const now = performance.now();
    ctx.font = '34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of game.falling) ctx.fillText(f.item.emoji, f.x, f.y);

    drawCat(game.catX, now < game.startledUntil);

    ctx.font = 'bold 24px sans-serif';
    for (const p of game.popups) {
      const t = 1 - (p.until - now) / 700;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.good ? '#e07b1f' : '#4a8f3c';
      ctx.fillText(p.text, p.x, p.y - 40 * t);
    }
    ctx.globalAlpha = 1;
  }

  function drawCat(x, startled) {
    if (!catImg.complete) return;
    const shake = startled ? Math.sin(performance.now() / 25) * 5 : 0;
    ctx.drawImage(catImg, x - CAT_SIZE / 2 + shake, catTop(), CAT_SIZE, CAT_SIZE);
    if (startled) {
      ctx.font = '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💦', x + CAT_SIZE / 2, catTop() + 10);
    }
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
    requestAnimationFrame(loop);
  }

  function finish() {
    game.over = true;
    const score = game.score;
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest();
      showBest();
    }
    $('result-score').textContent = score;
    $('result-title').textContent = isRecord && score > 0 ? '🎉 새 기록이다옹!'
      : score >= 60 ? '배불러서 행복하다옹!'
      : score >= 25 ? '맛있게 먹었다옹!'
      : '조금 더 먹고 싶다옹…';
    $('result-best').textContent = '최고 기록 ' + best + '점';
    $('result').returnValue = '';
    $('result').showModal();
  }

  function moveTo(clientX) {
    if (!game || game.over) return;
    if (performance.now() < game.startledUntil) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    game.catX = Math.min(Math.max(x, CAT_SIZE / 2), width - CAT_SIZE / 2);
  }

  field.addEventListener('pointerdown', (e) => moveTo(e.clientX));
  field.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) moveTo(e.clientX);
  });

  // 컴퓨터에서는 화살표 키로도 움직일 수 있다.
  const keys = new Set();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { keys.add(e.key); e.preventDefault(); }
  });
  document.addEventListener('keyup', (e) => keys.delete(e.key));
  setInterval(() => {
    if (!game || game.over || performance.now() < game.startledUntil) return;
    const step = (keys.has('ArrowRight') ? 12 : 0) - (keys.has('ArrowLeft') ? 12 : 0);
    if (step) game.catX = Math.min(Math.max(game.catX + step, CAT_SIZE / 2), width - CAT_SIZE / 2);
  }, 16);

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
