/* ================================================================
   Tile-Match Memory Game  –  script.js
   Full game logic with door animations, difficulty, sounds & DSA
================================================================ */

'use strict';

/* ─── DOM refs ─────────────────────────────────────────────────── */
const pageHome   = document.getElementById('page-home');
const pageDiff   = document.getElementById('page-diff');
const pageGame   = document.getElementById('page-game');
const doorLeft   = document.getElementById('door-left');
const doorRight  = document.getElementById('door-right');
const cardGrid   = document.getElementById('card-grid');
const resOverlay = document.getElementById('result-overlay');
const resTitle   = document.getElementById('res-title');
const resStats   = document.getElementById('res-stats');

const hudDiff  = document.getElementById('hud-diff');
const hudMoves = document.getElementById('hud-moves');
const hudPairs = document.getElementById('hud-pairs');
const hudTotal = document.getElementById('hud-total');
const hudTime  = document.getElementById('hud-time');

const btnStart   = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');
const btnChgDiff = document.getElementById('btn-chgdiff');
const btnExit    = document.getElementById('btn-exit');
const volSlider  = document.getElementById('vol-slider');

/* ─── Audio ─────────────────────────────────────────────────────── */
const sndHome  = document.getElementById('snd-home');
const sndGame  = document.getElementById('snd-game');
const sndStart = document.getElementById('snd-start');
const sndMatch = document.getElementById('snd-match');
const sndWrong = document.getElementById('snd-wrong');

let masterVol = 0.6;

function setVol(audio, v) {
  try { audio.volume = Math.min(1, Math.max(0, v)); } catch(e) {}
}

function applyVolumes() {
  setVol(sndHome,  masterVol * 0.55);
  setVol(sndGame,  masterVol * 0.65);
  setVol(sndStart, masterVol);
  setVol(sndMatch, masterVol);
  setVol(sndWrong, masterVol);
}

volSlider.addEventListener('input', () => {
  masterVol = parseFloat(volSlider.value);
  applyVolumes();
});

function playHome() {
  sndGame.pause(); sndGame.currentTime = 0;
  sndHome.currentTime = 0;
  sndHome.play().catch(()=>{});
}

function playGame() {
  sndHome.pause();
  sndGame.currentTime = 0;
  sndGame.play().catch(()=>{});
}

function playSFX(audio) {
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}

/* ─── DIFFICULTY CONFIG ─────────────────────────────────────────── */
/*
  DSA: We store card values in a flat array, shuffle with Fisher-Yates O(n),
  and track state with a stack-based "flipped" buffer (max 2).
  Match detection = O(1) string compare.
*/
const DIFFICULTY = {
  easy:   { cols: 4, rows: 3, pairs: 6,  label: 'EASY'   },
  medium: { cols: 4, rows: 4, pairs: 8,  label: 'MEDIUM' },
  hard:   { cols: 5, rows: 4, pairs: 10, label: 'HARD'   }
};

/* card image count in assets – card1.png … card8.png */
const TOTAL_CARD_IMAGES = 8;

/* ─── GAME STATE ────────────────────────────────────────────────── */
let state = {
  difficulty: 'easy',
  cards: [],       // array of card objects: { id, img, matched, el }
  flipped: [],     // stack, max 2
  moves: 0,
  matchedPairs: 0,
  totalPairs: 0,
  locked: false,   // prevent rapid clicks
  timer: null,
  elapsed: 0
};

/* ─── FISHER-YATES SHUFFLE (O(n)) ───────────────────────────────── */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ─── BUILD CARD DECK ────────────────────────────────────────────── */
function buildDeck(pairs) {
  // Pick `pairs` unique images, cycling if we need more than available
  const imgs = [];
  for (let i = 1; i <= pairs; i++) {
    imgs.push(`assets/card${((i - 1) % TOTAL_CARD_IMAGES) + 1}.png`);
  }
  // Duplicate for pairs
  const deck = [...imgs, ...imgs].map((img, idx) => ({
    id: idx, img, matched: false, el: null
  }));
  return shuffle(deck);
}

/* ─── FORMAT TIME ────────────────────────────────────────────────── */
function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2,'0')}`;
}

/* ─── TIMER ──────────────────────────────────────────────────────── */
function startTimer() {
  clearInterval(state.timer);
  state.elapsed = 0;
  hudTime.textContent = fmt(0);
  state.timer = setInterval(() => {
    state.elapsed++;
    hudTime.textContent = fmt(state.elapsed);
  }, 1000);
}

/* ─── RENDER GRID ────────────────────────────────────────────────── */
function renderGrid() {
  const { cols, rows, pairs, label } = DIFFICULTY[state.difficulty];
  state.totalPairs = pairs;

  // CSS grid
  cardGrid.style.gridTemplateColumns = `repeat(${cols}, var(--card-w))`;
  cardGrid.style.gridTemplateRows    = `repeat(${rows}, var(--card-h))`;

  // Hud
  hudDiff.textContent  = label;
  hudMoves.textContent = '0';
  hudPairs.textContent = '0';
  hudTotal.textContent = pairs;

  // Build & render cards
  state.cards = buildDeck(pairs);
  cardGrid.innerHTML = '';

  state.cards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.index = i;
    el.innerHTML = `
      <div class="card-face card-back"></div>
      <div class="card-face card-front">
        <img src="${card.img}" alt="card"
             onerror="this.src='';this.style.background='#f5c51833'"/>
      </div>`;
    el.addEventListener('click', onCardClick);
    cardGrid.appendChild(el);
    card.el = el;
  });
}

/* ─── CARD CLICK HANDLER ─────────────────────────────────────────── */
function onCardClick(e) {
  const el = e.currentTarget;
  const idx = parseInt(el.dataset.index);
  const card = state.cards[idx];

  if (state.locked) return;
  if (card.matched) return;
  if (state.flipped.length === 1 && state.flipped[0].id === card.id) return;
  if (el.classList.contains('flipped')) return;

  // Flip card
  el.classList.add('flipped');
  state.flipped.push(card);

  if (state.flipped.length === 2) {
    state.locked = true;
    state.moves++;
    hudMoves.textContent = state.moves;
    checkMatch();
  }
}

/* ─── MATCH CHECK (O(1)) ─────────────────────────────────────────── */
function checkMatch() {
  const [a, b] = state.flipped;
  const isMatch = a.img === b.img;

  if (isMatch) {
    playSFX(sndMatch);
    a.matched = b.matched = true;
    a.el.classList.add('matched');
    b.el.classList.add('matched');
    state.matchedPairs++;
    hudPairs.textContent = state.matchedPairs;
    state.flipped = [];
    state.locked = false;

    if (state.matchedPairs === state.totalPairs) {
      setTimeout(showResult, 500);
    }
  } else {
    playSFX(sndWrong);
    setTimeout(() => {
      a.el.classList.add('shake');
      b.el.classList.add('shake');
      setTimeout(() => {
        a.el.classList.remove('flipped','shake');
        b.el.classList.remove('flipped','shake');
        state.flipped = [];
        state.locked = false;
      }, 420);
    }, 600);
  }
}

/* ─── RESULT ─────────────────────────────────────────────────────── */
function showResult() {
  clearInterval(state.timer);
  resTitle.textContent = '🎉 You Win!';
  resStats.textContent = `Moves: ${state.moves}  |  Time: ${fmt(state.elapsed)}`;
  resOverlay.classList.add('show');
}

/* ─── DOOR OPEN (entering game) ──────────────────────────────────── */
function openDoors(cb) {
  doorLeft.classList.remove('open');
  doorRight.classList.remove('open');
  pageGame.classList.add('active');
  pageGame.classList.remove('closing');

  // tiny delay so CSS sees the starting position
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      doorLeft.classList.add('open');
      doorRight.classList.add('open');
      setTimeout(cb, 1150);
    });
  });
}

/* ─── DOOR CLOSE (exiting game) ──────────────────────────────────── */
function closeDoors(cb) {
  pageGame.classList.add('closing');
  setTimeout(() => {
    pageGame.classList.remove('active','closing');
    doorLeft.classList.remove('open');
    doorRight.classList.remove('open');
    if (cb) cb();
  }, 950);
}

/* ─── START GAME ─────────────────────────────────────────────────── */
function startGame(difficulty) {
  state.difficulty = difficulty;
  state.flipped = [];
  state.moves = 0;
  state.matchedPairs = 0;
  state.locked = false;
  clearInterval(state.timer);

  // Hide diff panel
  pageDiff.classList.remove('open');
  pageHome.classList.remove('blurred');

  renderGrid();
  resOverlay.classList.remove('show');

  openDoors(() => {
    playGame();
    startTimer();
  });
}

/* ─── PAGE 1 → PAGE 2 ────────────────────────────────────────────── */
btnStart.addEventListener('click', () => {
  playSFX(sndStart);
  pageHome.classList.add('blurred');
  pageDiff.classList.add('open');

  // Tone down home music
  setVol(sndHome, masterVol * 0.25);
  if (sndHome.paused) sndHome.play().catch(()=>{});
});

/* ─── DIFFICULTY BUTTONS ─────────────────────────────────────────── */
document.querySelectorAll('.diff-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    startGame(btn.dataset.diff);
  });
});

/* ─── RESULT BUTTONS ─────────────────────────────────────────────── */
btnRestart.addEventListener('click', () => {
  resOverlay.classList.remove('show');
  // Close doors → re-open with same difficulty
  closeDoors(() => {
    startGame(state.difficulty);
  });
});

btnChgDiff.addEventListener('click', () => {
  clearInterval(state.timer);
  sndGame.pause(); sndGame.currentTime = 0;
  closeDoors(() => {
    resOverlay.classList.remove('show');
    playHome();
    setVol(sndHome, masterVol * 0.55);
    pageHome.classList.add('blurred');
    pageDiff.classList.add('open');
    setVol(sndHome, masterVol * 0.25);
  });
});

btnExit.addEventListener('click', () => {
  clearInterval(state.timer);
  sndGame.pause(); sndGame.currentTime = 0;
  closeDoors(() => {
    resOverlay.classList.remove('show');
    pageHome.classList.remove('blurred');
    pageDiff.classList.remove('open');
    playHome();
  });
});

/* ─── INIT ────────────────────────────────────────────────────────── */
(function init() {
  applyVolumes();

  // Auto-play home music on first user interaction (browser policy)
  document.addEventListener('click', () => {
    if (sndHome.paused && !pageGame.classList.contains('active')) {
      sndHome.play().catch(()=>{});
    }
  }, { once: true });

  // Attempt immediate play (may be silently ignored until interaction)
  sndHome.play().catch(()=>{});
})();
