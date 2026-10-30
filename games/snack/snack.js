(function () {
  const STORAGE_KEY = 'nyang-snack-v3';
  const MAX_HP = 100;
  const RAMP_SECONDS = 60; // 이 시간에 걸쳐 점점 어려워진다
  const CAT_SIZE = 96;

  // 떨어지는 것들. weight는 처음 → 가장 어려울 때 나오는 비율.
  const ITEMS = [
    { emoji: '🐟', points: 1, weight: [60, 50] },
    { emoji: '🍗', points: 3, weight: [20, 16] },
    { emoji: '⭐', points: 10, weight: [4, 4], fast: true },
    { emoji: '🥒', damage: 10, weight: [14, 24] },
    { emoji: '🍫', damage: 10, weight: [10, 18] },
    { emoji: '🍖', damage: 20, weight: [5, 14], rotten: true },
  ];

  const $ = (id) => document.getElementById(id);
  const field = $('field');
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');

  const catImg = new Image();
  catImg.src = '../../assets/cat.svg';

  const rottenImg = makeRottenMeat();

  let width = 0;
  let height = 0;
  let best = loadBest();
  let game = null;

  // 이모지에 썩은 고기가 없어서, 고기를 초록빛으로 물들이고 파리를 붙여 만든다.
  function makeRottenMeat() {
    const size = 80;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    g.font = '56px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🍖', size / 2, size / 2 + 6);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(96, 140, 48, 0.6)';
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'source-over';
    g.font = '22px sans-serif';
    g.fillText('🪰', size - 16, 14);
    return c;
  }

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
    if (game) game.catX = clampX(game.catX);
    draw();
  }

  const clampX = (x) => Math.min(Math.max(x, CAT_SIZE / 2), width - CAT_SIZE / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  function pickItem(p) {
    const weights = ITEMS.map((item) => lerp(item.weight[0], item.weight[1], p));
    let r = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < ITEMS.length; i++) {
      r -= weights[i];
      if (r < 0) return ITEMS[i];
    }
    return ITEMS[0];
  }

  function newGame() {
    return {
      score: 0,
      hp: MAX_HP,
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

  // 0(처음) ~ 1(가장 어려움). 오래 버틸수록 빨리, 자주, 나쁜 것이 많이 떨어진다.
  function progress(now) {
    return Math.min(1, (now - game.startedAt) / (RAMP_SECONDS * 1000));
  }

  function spawn(now) {
    const p = progress(now);
    const item = pickItem(p);
    const speed = (190 + 270 * p) * (item.fast ? 1.5 : 1) * (0.9 + Math.random() * 0.2);
    game.falling.push({ item, x: 24 + Math.random() * (width - 48), y: -30, speed });
    game.nextSpawn = now + (560 - 330 * p) * (0.7 + Math.random() * 0.6);
  }

  function catTop() {
    return height - CAT_SIZE - 6;
  }

  function eat(f, now) {
    const item = f.item;
    if (item.damage) {
      game.hp = Math.max(0, game.hp - item.damage);
      game.startledUntil = now + 600;
      if (navigator.vibrate) navigator.vibrate(item.damage * 10);
      game.popups.push({ text: '❤️−' + item.damage, x: f.x, y: catTop(), until: now + 700, good: false });
    } else {
      game.score += item.points;
      game.popups.push({ text: '+' + item.points, x: f.x, y: catTop(), until: now + 700, good: true });
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
      // 냥이 머리 높이를 지나가는 순간 냥이 몸 폭 안에 있으면 먹은 것.
      if (prevY < top + 20 && f.y >= top + 20 && Math.abs(f.x - game.catX) < CAT_SIZE * 0.5) {
        eat(f, now);
        return false;
      }
      return f.y < height + 30;
    });
    game.popups = game.popups.filter((p) => p.until > now);

    $('hp').style.width = game.hp + '%';
    $('hp').classList.toggle('low', game.hp <= 30);
    $('hp-text').textContent = game.hp;
    $('score').textContent = game.score;
    if (game.hp <= 0) finish(now);
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
    for (const f of game.falling) {
      if (f.item.rotten) ctx.drawImage(rottenImg, f.x - 24, f.y - 24, 48, 48);
      else ctx.fillText(f.item.emoji, f.x, f.y);
    }

    drawCat(game.catX, now < game.startledUntil);

    ctx.font = 'bold 24px sans-serif';
    for (const p of game.popups) {
      const t = 1 - (p.until - now) / 700;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.good ? '#e07b1f' : '#d64545';
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

  function finish(now) {
    game.over = true;
    const score = game.score;
    const seconds = Math.floor((now - game.startedAt) / 1000);
    const isRecord = score > best;
    if (isRecord) {
      best = score;
      saveBest();
      showBest();
    }
    $('result-score').textContent = score;
    $('result-title').textContent = isRecord && score > 0 ? '🎉 새 기록이다옹!'
      : score >= 100 ? '배불러서 행복하다옹!'
      : score >= 40 ? '맛있게 먹었다옹!'
      : '배탈 났다옹…';
    $('result-time').textContent = seconds + '초 버텼어요';
    $('result-best').textContent = '최고 기록 ' + best + '점';
    $('result').returnValue = '';
    $('result').showModal();
  }

  function moveTo(clientX) {
    if (!game || game.over) return;
    if (performance.now() < game.startledUntil) return;
    const rect = canvas.getBoundingClientRect();
    game.catX = clampX(clientX - rect.left);
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
    if (step) game.catX = clampX(game.catX + step);
  }, 16);

  $('start-btn').addEventListener('click', start);
  $('result').addEventListener('close', () => {
    if ($('result').returnValue === 'again') start();
    else $('start').hidden = false;
  });

  $('legend-rotten').src = rottenImg.toDataURL();
  catImg.onload = draw;
  window.addEventListener('resize', resize);
  showBest();
  resize();
})();
