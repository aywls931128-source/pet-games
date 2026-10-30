(function () {
  const STORAGE_KEY = 'nyang-mouse-v1';
  const MAX_HP = 100;
  const RAMP_SECONDS = 60; // 이 시간에 걸쳐 점점 어려워진다
  const HOLE_COUNT = 9;
  const MISS_DAMAGE = 5;

  // 튀어나오는 동물. weight와 stay(머무는 ms)는 처음 → 가장 어려울 때 값.
  const CRITTERS = {
    mouse: { emoji: '🐭', points: 1, weight: [70, 58], stay: [1150, 560] },
    fast: { emoji: '🐁', points: 3, weight: [12, 18], stay: [650, 360] },
    dog: { emoji: '🐶', damage: 20, weight: [18, 24], stay: [1300, 850] },
  };
  const KINDS = Object.keys(CRITTERS);

  const $ = (id) => document.getElementById(id);
  const field = $('field');

  let best = loadBest();
  let game = null;

  const holes = [];
  for (let i = 0; i < HOLE_COUNT; i++) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'hole';
    el.setAttribute('aria-label', '구멍 ' + (i + 1));
    const critter = document.createElement('span');
    critter.className = 'critter';
    el.appendChild(critter);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); whack(i); });
    $('holes').appendChild(el);
    holes.push({ el, critter, kind: null, downAt: 0, hit: false });
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

  const lerp = (a, b, t) => a + (b - a) * t;

  // 0(처음) ~ 1(가장 어려움). 오래 버틸수록 빨리, 많이, 짧게 나온다.
  function progress(now) {
    return Math.min(1, (now - game.startedAt) / (RAMP_SECONDS * 1000));
  }

  function pickKind(p) {
    const weights = KINDS.map((k) => lerp(CRITTERS[k].weight[0], CRITTERS[k].weight[1], p));
    let r = Math.random() * weights.reduce((sum, w) => sum + w, 0);
    for (let i = 0; i < KINDS.length; i++) {
      r -= weights[i];
      if (r < 0) return KINDS[i];
    }
    return KINDS[0];
  }

  function spawn(now) {
    const p = progress(now);
    const maxUp = Math.round(lerp(1, 3, p));
    const up = holes.filter((h) => h.kind).length;
    const empty = holes.filter((h) => !h.kind);
    if (up < maxUp && empty.length) {
      const hole = empty[Math.floor(Math.random() * empty.length)];
      const kind = pickKind(p);
      const c = CRITTERS[kind];
      hole.kind = kind;
      hole.hit = false;
      hole.downAt = now + lerp(c.stay[0], c.stay[1], p) * (0.85 + Math.random() * 0.3);
      hole.critter.textContent = c.emoji;
      hole.el.classList.remove('hit');
      hole.el.classList.add('up');
    }
    game.nextSpawn = now + lerp(820, 380, p) * (0.7 + Math.random() * 0.6);
  }

  function hide(hole) {
    hole.kind = null;
    hole.el.classList.remove('up', 'hit');
  }

  function popup(hole, text, good) {
    const el = document.createElement('span');
    el.className = 'pop ' + (good ? 'good' : 'bad');
    el.textContent = text;
    hole.el.appendChild(el);
    setTimeout(() => el.remove(), 700);
  }

  function hurt(amount) {
    game.hp = Math.max(0, game.hp - amount);
    field.classList.remove('hurt');
    void field.offsetWidth; // 애니메이션을 다시 시작하게 한다
    field.classList.add('hurt');
    if (navigator.vibrate) navigator.vibrate(amount * 8);
  }

  function whack(i) {
    if (!game || game.over) return;
    const hole = holes[i];
    const paw = document.createElement('span');
    paw.className = 'paw';
    paw.textContent = '🐾';
    hole.el.appendChild(paw);
    setTimeout(() => paw.remove(), 350);

    if (!hole.kind || hole.hit) return;
    const c = CRITTERS[hole.kind];
    hole.hit = true;
    hole.el.classList.add('hit');
    hole.downAt = performance.now() + 250;
    if (c.damage) {
      hurt(c.damage);
      popup(hole, '❤️−' + c.damage, false);
    } else {
      game.score += c.points;
      popup(hole, '+' + c.points, true);
    }
    render();
  }

  function render() {
    $('hp').style.width = game.hp + '%';
    $('hp').classList.toggle('low', game.hp <= 30);
    $('hp-text').textContent = game.hp;
    $('score').textContent = game.score;
  }

  function tick(now) {
    if (!game || game.over) return;
    if (now >= game.nextSpawn) spawn(now);
    for (const hole of holes) {
      if (!hole.kind || now < hole.downAt) continue;
      // 쥐가 잡히지 않고 숨으면 놓친 것.
      if (!hole.hit && !CRITTERS[hole.kind].damage) {
        hurt(MISS_DAMAGE);
        popup(hole, '❤️−' + MISS_DAMAGE, false);
      }
      hide(hole);
    }
    render();
    if (game.hp <= 0) finish(now);
    else requestAnimationFrame(tick);
  }

  function start() {
    $('start').hidden = true;
    holes.forEach(hide);
    game = {
      score: 0,
      hp: MAX_HP,
      startedAt: performance.now(),
      nextSpawn: performance.now() + 500,
      over: false,
    };
    render();
    requestAnimationFrame(tick);
  }

  function finish(now) {
    game.over = true;
    holes.forEach(hide);
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
      : score >= 100 ? '쥐들이 다 도망갔다옹!'
      : score >= 40 ? '사냥 솜씨 좋다옹!'
      : '쥐들이 너무 빠르다옹…';
    $('result-time').textContent = seconds + '초 버텼어요';
    $('result-best').textContent = '최고 기록 ' + best + '점';
    $('result').returnValue = '';
    $('result').showModal();
  }

  $('start-btn').addEventListener('click', start);
  $('result').addEventListener('close', () => {
    if ($('result').returnValue === 'again') start();
    else $('start').hidden = false;
  });

  showBest();
})();
