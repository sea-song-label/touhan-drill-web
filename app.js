// 登販ドリル — Web版 一問一答クイズ
// vanilla JS。フレームワークなし・軽量・オフライン不要（初回fetchのみ）

const CHAPTER_NAMES = {
  1: "第1章 医薬品概論",
  2: "第2章 人体の働きと医薬品",
  3: "第3章 主な医薬品とその作用",
  4: "第4章 薬事関連の法規・制度",
  5: "第5章 医薬品の適正使用・安全対策",
};

// アイコン（絵文字ではなくインラインSVGで統一感を出す）
const ICONS = {
  speaker: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`,
  check: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 12.5l2.5 2.5L16 9"></path></svg>`,
  cross: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9 9l6 6M15 9l-6 6"></path></svg>`,
  maru: `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><circle cx="12" cy="12" r="8.5"></circle></svg>`,
  batsu: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>`,
};

const app = document.getElementById("app");

// スクレイピング対策：メールアドレスを分割・組み立てて生の文字列をソースに残さない
const FEEDBACK_EMAIL = ["seasonglabel", "+touhandrill", "@", "gmail.com"].join("");
const FEEDBACK_MAILTO =
  "mailto:" + FEEDBACK_EMAIL + "?subject=" +
  encodeURIComponent("【登販ドリル】アプリ版へのご意見");

function setCompactHeader(compact) {
  const header = document.querySelector(".app-header");
  if (header) header.classList.toggle("compact", compact);
}

// 出題・解答ボタンを画面下部に貼りつける（問題文・解説の長さに関わらず必ずタップできる）
// #appの最後の子要素として配置し position:sticky で追従させる。
// position:fixedはiOS Safariのツールバー表示中に隠れる不具合があるため使わない。
function setStickyActions(html) {
  const existing = document.getElementById("stickyActions");
  if (existing) existing.remove();
  if (html === null) return null;
  const bar = document.createElement("div");
  bar.id = "stickyActions";
  bar.className = "sticky-actions";
  bar.innerHTML = html;
  app.appendChild(bar);
  return bar;
}

const APP_PROMO_HTML = `
  <div class="app-promo">
    <p>スマホアプリ版を準備中です。<br>「こんな機能があれば買う」というご意見、お待ちしています。</p>
    <a href="${FEEDBACK_MAILTO}">ご意見を送る</a>
  </div>
`;

let ALL_QUESTIONS = [];
let session = null; // {questions, index, score, chapterLabel}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- 音声選択：自然に聞こえる声を優先し、macOSのノベルティ音声
// （Grandma/Grandpa/Rocko/Sandy等の変声エフェクト系）を避ける ---
let cachedVoice = null;
let voicesReady = null;

function loadVoices() {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { resolve(v); return; }
    window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 800);
  });
  return voicesReady;
}

const AVOID_VOICE_NAMES = ["grandma", "grandpa", "rocko", "sandy", "eddy", "flo", "reed", "shelley", "albert", "bad news", "bahh", "bells", "boing", "bubbles", "cellos", "wobble", "zarvox", "trinoids"];
const PREFERRED_VOICE_NAMES = ["google 日本語", "kyoko"];

async function pickVoice() {
  if (cachedVoice !== null) return cachedVoice;
  const voices = await loadVoices();
  const ja = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith("ja"));
  for (const pref of PREFERRED_VOICE_NAMES) {
    const found = ja.find((v) => v.name.toLowerCase().includes(pref));
    if (found) { cachedVoice = found; return found; }
  }
  const safe = ja.find((v) => !AVOID_VOICE_NAMES.some((bad) => v.name.toLowerCase().includes(bad)));
  cachedVoice = safe || ja[0] || null;
  return cachedVoice;
}

async function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 1.0;
  u.pitch = 1.0;
  const voice = await pickVoice();
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

// --- 画面: 章選択 ---
function renderChapterSelect() {
  setCompactHeader(false);
  setStickyActions(null);
  session = null;
  const counts = {};
  ALL_QUESTIONS.forEach((q) => { counts[q.chapter] = (counts[q.chapter] || 0) + 1; });

  const cards = Object.keys(CHAPTER_NAMES)
    .map(Number)
    .sort((a, b) => a - b)
    .map(
      (ch) => `
      <button class="chapter-card" data-chapter="${ch}">
        <span class="name">${CHAPTER_NAMES[ch]}</span>
        <span class="count">${counts[ch] || 0}問</span>
      </button>`
    )
    .join("");

  app.innerHTML = `
    <button class="chapter-card all" data-chapter="all">
      <span class="name">全問ランダム</span>
      <span class="count">${ALL_QUESTIONS.length}問</span>
    </button>
    <div class="chapter-grid">${cards}</div>
    ${APP_PROMO_HTML}
  `;

  app.querySelectorAll(".chapter-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ch = btn.dataset.chapter;
      const pool = ch === "all" ? ALL_QUESTIONS : ALL_QUESTIONS.filter((q) => String(q.chapter) === ch);
      startSession(shuffle(pool), ch === "all" ? "全問ランダム" : CHAPTER_NAMES[ch]);
    });
  });
}

function startSession(questions, label) {
  session = { questions, index: 0, score: 0, label, answered: false };
  renderQuestion();
}

// --- 画面: 出題 ---
function renderQuestion() {
  setCompactHeader(true);
  window.speechSynthesis && window.speechSynthesis.cancel();
  const { questions, index } = session;
  const q = questions[index];
  const pct = Math.round((index / questions.length) * 100);

  app.innerHTML = `
    <button class="quiz-back-link" id="quizBackBtn">← 章選択に戻る</button>
    <div class="progress-label">
      <span>${session.label}</span>
      <span>${index + 1} / ${questions.length}問</span>
    </div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>

    <div class="question-card">
      <span class="question-chapter-tag">${CHAPTER_NAMES[q.chapter] || ""}</span>
      <p class="question-text">${q.q}</p>
      <button class="icon-btn" id="speakBtn">${ICONS.speaker}<span>読み上げる</span></button>
    </div>
  `;

  document.getElementById("quizBackBtn").addEventListener("click", renderChapterSelect);

  document.getElementById("speakBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    speak(q.yomi_q || q.q);
    btn.classList.add("speaking");
    setTimeout(() => btn.classList.remove("speaking"), 1500);
  });

  const bar = setStickyActions(`
    <div class="answer-buttons">
      <button class="answer-btn maru" data-choice="true">${ICONS.maru}</button>
      <button class="answer-btn batsu" data-choice="false">${ICONS.batsu}</button>
    </div>
  `);
  bar.querySelectorAll(".answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const choice = btn.dataset.choice === "true";
      handleAnswer(choice);
    });
  });
}

// --- 画面: 解答結果 ---
function handleAnswer(choice) {
  const { questions, index } = session;
  const q = questions[index];
  const correct = choice === q.a;
  if (correct) session.score++;

  app.innerHTML = `
    <button class="quiz-back-link" id="quizBackBtn">← 章選択に戻る</button>
    <div class="progress-label">
      <span>${session.label}</span>
      <span>${index + 1} / ${questions.length}問</span>
    </div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${Math.round(((index + 1) / questions.length) * 100)}%"></div></div>

    <div class="question-card">
      <span class="question-chapter-tag">${CHAPTER_NAMES[q.chapter] || ""}</span>
      <p class="question-text">${q.q}</p>
    </div>

    <div class="result-card ${correct ? "correct" : "wrong"}">
      <p class="result-verdict">${correct ? ICONS.check + "正解！" : ICONS.cross + "不正解"}</p>
      <p class="result-correct-answer">正解：${q.a ? "◯" : "✕"}</p>
      <p class="result-exp">${q.exp}</p>
      <p class="result-cite">出典：${q.cite}</p>
      <button class="icon-btn" id="speakExpBtn">${ICONS.speaker}<span>解説を読み上げる</span></button>
    </div>
  `;

  document.getElementById("quizBackBtn").addEventListener("click", renderChapterSelect);

  document.getElementById("speakExpBtn").addEventListener("click", (e) => {
    const btn = e.currentTarget;
    const verdict = correct ? "正解。" : "不正解。";
    speak(verdict + (q.yomi_exp || q.exp));
    btn.classList.add("speaking");
    setTimeout(() => btn.classList.remove("speaking"), 1500);
  });

  const bar = setStickyActions(
    `<button class="next-btn" id="nextBtn">${index + 1 < questions.length ? "次の問題へ" : "結果を見る"}</button>`
  );
  bar.querySelector("#nextBtn").addEventListener("click", () => {
    session.index++;
    if (session.index < session.questions.length) {
      renderQuestion();
    } else {
      renderResults();
    }
  });
}

// --- 画面: 結果 ---
function renderResults() {
  setCompactHeader(false);
  setStickyActions(null);
  const { score, questions, label } = session;
  const rate = Math.round((score / questions.length) * 100);
  let comment = "この調子で続けましょう！";
  if (rate >= 90) comment = "素晴らしい正答率です。この章はほぼ完璧です。";
  else if (rate >= 70) comment = "良い調子です。間違えた問題を中心に復習しましょう。";
  else if (rate < 50) comment = "焦らずもう一度、解説をじっくり読みながら解いてみましょう。";

  app.innerHTML = `
    <div class="result-summary">
      <div class="score-label">${label}・お疲れさまでした</div>
      <div class="score">${score} / ${questions.length}</div>
      <div class="score-label">正答率 ${rate}%</div>
      <p class="comment">${comment}</p>
      <button class="primary-btn" id="retryBtn">もう一度挑戦する</button>
      <button class="secondary-btn" id="backBtn">章を選び直す</button>
    </div>
    ${APP_PROMO_HTML}
  `;

  document.getElementById("retryBtn").addEventListener("click", () => {
    startSession(shuffle(session.questions), session.label);
  });
  document.getElementById("backBtn").addEventListener("click", renderChapterSelect);
}

// --- ヘッダーロゴ：常に章選択画面へ戻る ---
document.getElementById("homeLink").querySelector("button").addEventListener("click", () => {
  if (ALL_QUESTIONS.length) renderChapterSelect();
});

// --- 初期化 ---
// URLに ?q=<配列index> が付いていれば、その1問だけを直接開く
// （SNS投稿からのリンク先が章選択トップで終わり、答えにたどり着けない問題への対応）
function getDeepLinkIndex() {
  const params = new URLSearchParams(location.search);
  const raw = params.get("q");
  if (raw === null) return null;
  const idx = parseInt(raw, 10);
  return Number.isInteger(idx) ? idx : null;
}

fetch("data/questions.json")
  .then((r) => r.json())
  .then((data) => {
    ALL_QUESTIONS = data;
    const idx = getDeepLinkIndex();
    if (idx !== null && ALL_QUESTIONS[idx]) {
      startSession([ALL_QUESTIONS[idx]], "この問題");
    } else {
      renderChapterSelect();
    }
    loadVoices(); // バックグラウンドで音声リストを先読み
  })
  .catch(() => {
    app.innerHTML = `<p style="text-align:center;color:var(--wrong);padding:40px 16px;">
      問題データの読み込みに失敗しました。ページを再読み込みしてください。</p>`;
  });
