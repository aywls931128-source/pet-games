(function () {
  const STORAGE_KEY = 'nyang-pet-v1';
  const MINUTE = 60 * 1000;

  // 수치는 0~100. 시간이 지나면 조금씩 줄어든다(창을 닫아 둔 동안에도).
  const DECAY_PER_HOUR = { food: 8, clean: 5, fun: 7, energy: 4 };
  const SLEEP_MINUTES = 20;
  const SLEEP_ENERGY_PER_MINUTE = 4;

  const STAGES = [
    { name: '아기 고양이', exp: 0, size: 0.7 },
    { name: '어린 고양이', exp: 60, size: 0.85 },
    { name: '어른 고양이', exp: 200, size: 1 },
    { name: '대장 고양이', exp: 500, size: 1.1 },
  ];

  const ACTIONS = {
    food: { stat: 'food', amount: 30, effect: '🍖', say: '냠냠, 맛있다옹!' },
    clean: { stat: 'clean', amount: 35, effect: '🫧', say: '뽀송뽀송해졌다옹' },
    fun: { stat: 'fun', amount: 25, effect: '🧶', say: '신난다옹!', cost: { energy: 10 } },
  };

  const $ = (id) => document.getElementById(id);
  const pet = $('pet');

  function freshState() {
    return {
      name: '',
      food: 70, clean: 70, fun: 70, energy: 70,
      exp: 0,
      sleepUntil: 0,
      updatedAt: Date.now(),
    };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) return Object.assign(freshState(), saved);
    } catch (e) {}
    return freshState();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  const clamp = (n) => Math.max(0, Math.min(100, n));

  let state = load();

  // 마지막 저장 이후 흐른 시간만큼 수치를 반영한다.
  function catchUp() {
    const now = Date.now();
    const hours = (now - state.updatedAt) / (60 * MINUTE);
    if (hours <= 0) return;
    const sleptUntil = Math.min(now, state.sleepUntil);
    const sleptMinutes = Math.max(0, (sleptUntil - state.updatedAt) / MINUTE);
    for (const key in DECAY_PER_HOUR) {
      if (key === 'energy' && sleptMinutes > 0) continue;
      state[key] = clamp(state[key] - DECAY_PER_HOUR[key] * hours);
    }
    if (sleptMinutes > 0) {
      state.energy = clamp(state.energy + sleptMinutes * SLEEP_ENERGY_PER_MINUTE);
    }
    state.updatedAt = now;
  }

  function isSleeping() {
    return Date.now() < state.sleepUntil;
  }

  function stageIndex() {
    let i = 0;
    STAGES.forEach((s, idx) => { if (state.exp >= s.exp) i = idx; });
    return i;
  }

  function mood() {
    if (isSleeping()) {
      const left = Math.ceil((state.sleepUntil - Date.now()) / MINUTE);
      return 'zZ... (' + left + '분 뒤에 깨요)';
    }
    if (state.food < 25) return '배고프다옹...';
    if (state.energy < 20) return '졸리다옹...';
    if (state.clean < 25) return '꼬질꼬질해졌다옹';
    if (state.fun < 25) return '심심하다옹...';
    if (Math.min(state.food, state.clean, state.fun, state.energy) > 70) return '오늘 행복하다옹!';
    return state.name + '는 잘 지내고 있어요';
  }

  function setBar(id, value) {
    const bar = $(id);
    bar.style.width = value + '%';
    bar.classList.toggle('low', value < 25);
  }

  function render() {
    const idx = stageIndex();
    const stage = STAGES[idx];
    const next = STAGES[idx + 1];
    const sleeping = isSleeping();

    $('pet-name').textContent = state.name || '냥이';
    $('stage').textContent = stage.name;
    $('bubble').textContent = mood();
    pet.style.setProperty('--size', stage.size);
    pet.classList.toggle('sleeping', sleeping);
    const src = '../../assets/' + (sleeping ? 'cat-sleep.svg' : 'cat.svg');
    if (pet.getAttribute('src') !== src) pet.setAttribute('src', src);
    pet.classList.toggle('sad', !sleeping && Math.min(state.food, state.clean, state.fun) < 25);
    $('room').classList.toggle('night', sleeping);

    setBar('bar-food', state.food);
    setBar('bar-clean', state.clean);
    setBar('bar-fun', state.fun);
    setBar('bar-energy', state.energy);

    if (next) {
      const pct = ((state.exp - stage.exp) / (next.exp - stage.exp)) * 100;
      $('exp-bar').style.width = pct + '%';
      $('exp-text').textContent = Math.floor(state.exp) + '/' + next.exp;
    } else {
      $('exp-bar').style.width = '100%';
      $('exp-text').textContent = '최고!';
    }

    document.querySelectorAll('.actions button').forEach((btn) => {
      btn.disabled = sleeping;
    });
  }

  function showEffect(emoji) {
    const el = $('effect');
    el.textContent = emoji;
    el.classList.remove('show');
    void el.offsetWidth; // 같은 효과를 연달아 보여 주려고 애니메이션을 다시 시작
    el.classList.add('show');
  }

  function hop() {
    pet.classList.remove('happy');
    void pet.offsetWidth;
    pet.classList.add('happy');
  }

  function say(text) {
    $('bubble').textContent = text;
  }

  function gainExp(before, after) {
    // 이미 가득 찬 수치를 또 채우면 애정이 오르지 않는다(연타 방지).
    const gained = (after - before) / 5;
    const oldStage = stageIndex();
    state.exp += gained;
    if (stageIndex() > oldStage) {
      setTimeout(() => say(STAGES[stageIndex()].name + '(으)로 자랐어요! 🎉'), 50);
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    }
  }

  function doAction(key) {
    catchUp();
    if (isSleeping()) return;

    if (key === 'sleep') {
      if (state.energy >= 90) {
        say('아직 안 졸리다옹!');
        return;
      }
      state.sleepUntil = Date.now() + SLEEP_MINUTES * MINUTE;
      showEffect('💤');
      save();
      render();
      return;
    }

    const action = ACTIONS[key];
    if (action.cost && state.energy < action.cost.energy) {
      say('힘이 없다옹... 재워 주세요');
      return;
    }
    if (state[action.stat] >= 100) {
      say('이제 충분하다옹!');
      return;
    }

    const before = state[action.stat];
    state[action.stat] = clamp(before + action.amount);
    if (action.cost) state.energy = clamp(state.energy - action.cost.energy);
    gainExp(before, state[action.stat]);

    showEffect(action.effect);
    hop();
    save();
    render();
    // render가 기분 문구를 덮어쓰므로 행동 대사는 그 뒤에 보여 준다.
    // 자랐을 때는 gainExp가 예약한 축하 문구가 이 대사를 덮는다.
    say(action.say);
  }

  document.querySelectorAll('.actions button').forEach((btn) => {
    btn.addEventListener('click', () => doAction(btn.dataset.action));
  });

  pet.addEventListener('click', () => {
    if (isSleeping()) return;
    hop();
    say('냐옹~');
  });

  // 처음 오면 이름을 짓는다.
  const dialog = $('name-dialog');
  if (!state.name) {
    dialog.showModal();
    dialog.addEventListener('close', () => {
      state.name = $('name-input').value.trim() || '냥이';
      state.updatedAt = Date.now();
      save();
      render();
    });
  }

  catchUp();
  save();
  render();

  // 화면을 켜 둔 동안에도 1분마다 수치를 갱신한다.
  setInterval(() => { catchUp(); save(); render(); }, MINUTE);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { catchUp(); save(); render(); }
  });
})();
