(function () {
  const STORAGE_KEY = 'nyang-coloring-v1';

  const $ = (id) => document.getElementById(id);
  const picker = $('picker');
  const play = $('play');
  const board = $('board');
  const palette = $('palette');
  const progress = $('progress');
  const title = $('title');
  const back = $('back');
  const done = $('done');

  let picture = null;
  let filled = null; // Set of cell indexes already painted
  let color = 1;
  let cells = [];

  // 저장은 실패해도(사생활 보호 모드 등) 게임은 그대로 돈다.
  function loadAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveAll(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function savedCells(id) {
    return new Set(loadAll()[id] || []);
  }
  function save() {
    const data = loadAll();
    data[picture.id] = [...filled];
    saveAll(data);
  }

  function numberAt(pic, i) {
    const size = pic.rows.length;
    return Number(pic.rows[Math.floor(i / size)][i % size]);
  }

  function drawThumb(pic, canvas) {
    const size = pic.rows.length;
    const done = savedCells(pic.id);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < size * size; i++) {
      const n = numberAt(pic, i);
      ctx.fillStyle = done.has(i) ? pic.palette[n - 1] : (n % 2 ? '#f4efe9' : '#ffffff');
      ctx.fillRect(i % size, Math.floor(i / size), 1, 1);
    }
    return done.size;
  }

  function showPicker() {
    picture = null;
    play.hidden = true;
    picker.hidden = false;
    done.hidden = true;
    title.textContent = '냥이 색칠하기';
    progress.textContent = '';
    back.href = '../../';
    back.onclick = null;

    const list = $('picture-list');
    list.innerHTML = '';
    window.PICTURES.forEach((pic) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'picture-item';
      const canvas = document.createElement('canvas');
      const count = drawThumb(pic, canvas);
      const total = pic.rows.length ** 2;
      const label = document.createElement('span');
      label.innerHTML = pic.name + '<br><small>' + Math.floor((count / total) * 100) + '%</small>';
      btn.append(canvas, label);
      btn.addEventListener('click', () => startPicture(pic));
      li.append(btn);
      list.append(li);
    });
  }

  function startPicture(pic) {
    picture = pic;
    filled = savedCells(pic.id);
    picker.hidden = true;
    play.hidden = false;
    title.textContent = pic.name;
    back.href = '#';
    back.onclick = (e) => { e.preventDefault(); showPicker(); };

    const size = pic.rows.length;
    board.style.gridTemplateColumns = 'repeat(' + size + ', 1fr)';
    board.innerHTML = '';
    cells = [];
    for (let i = 0; i < size * size; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.i = i;
      cell.textContent = numberAt(pic, i);
      board.append(cell);
      cells.push(cell);
    }
    filled.forEach((i) => paintCell(i));

    palette.innerHTML = '';
    pic.palette.forEach((hex, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'swatch';
      btn.style.background = hex;
      btn.style.color = isLight(hex) ? '#3b2a20' : '#ffffff';
      btn.textContent = idx + 1;
      btn.addEventListener('click', () => selectColor(idx + 1));
      palette.append(btn);
    });

    selectColor(firstUnfinishedColor() || 1);
    updateProgress();
  }

  function isLight(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return r * 0.299 + g * 0.587 + b * 0.114 > 160;
  }

  function paintCell(i) {
    const cell = cells[i];
    cell.classList.add('filled');
    cell.classList.remove('target');
    cell.style.background = picture.palette[numberAt(picture, i) - 1];
  }

  function remaining(n) {
    let left = 0;
    for (let i = 0; i < cells.length; i++) {
      if (numberAt(picture, i) === n && !filled.has(i)) left++;
    }
    return left;
  }

  function firstUnfinishedColor() {
    for (let n = 1; n <= picture.palette.length; n++) {
      if (remaining(n) > 0) return n;
    }
    return 0;
  }

  function selectColor(n) {
    color = n;
    [...palette.children].forEach((btn, idx) => {
      btn.classList.toggle('active', idx + 1 === n);
      btn.classList.toggle('complete', remaining(idx + 1) === 0);
    });
    cells.forEach((cell, i) => {
      cell.classList.toggle('target', !filled.has(i) && numberAt(picture, i) === n);
    });
  }

  function updateProgress() {
    progress.textContent = Math.floor((filled.size / cells.length) * 100) + '%';
  }

  function tryFill(target) {
    if (!target || !target.classList || !target.classList.contains('cell')) return;
    const i = Number(target.dataset.i);
    if (filled.has(i) || numberAt(picture, i) !== color) return;
    filled.add(i);
    paintCell(i);
    updateProgress();
    if (remaining(color) === 0) {
      save();
      const next = firstUnfinishedColor();
      if (next) {
        selectColor(next);
      } else {
        selectColor(color);
        if (navigator.vibrate) navigator.vibrate(80);
        setTimeout(() => { done.hidden = false; }, 900);
      }
    }
  }

  // 손가락으로 쓸면 지나가는 칸이 모두 칠해진다.
  let painting = false;
  board.addEventListener('pointerdown', (e) => {
    painting = true;
    tryFill(e.target);
  });
  board.addEventListener('pointermove', (e) => {
    if (!painting) return;
    tryFill(document.elementFromPoint(e.clientX, e.clientY));
  });
  window.addEventListener('pointerup', () => {
    if (painting && picture) save();
    painting = false;
  });

  $('done-btn').addEventListener('click', showPicker);

  showPicker();
})();
