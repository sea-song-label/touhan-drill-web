// 登販ドリル — Web版 一問一答クイズ
// vanilla JS。フレームワークなし・軽量・オフライン不要（初回fetchのみ）

const CHAPTER_NAMES = {
  1: "第1章 医薬品概論",
  2: "第2章 人体の働きと医薬品",
  3: "第3章 主な医薬品とその作用",
  4: "第4章 薬事関連の法規・制度",
  5: "第5章 医薬品の適正使用・安全対策",
};

const app = document.getElementById("app");

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

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

// --- 画面: 章選択 ---
function renderChapterSelect() {
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
  window.speechSynthesis && window.speechSynthesis.cancel();
  const { questions, index } = session;
  const q = questions[index];
  const pct = Math.round((index / questions.length) * 100);

  app.innerHTML = `
    <div class="progress-label">
      <span>${session.label}</span>
      <span>${index + 1} / ${questions.length}問</span>
    </div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%"></div></div>

    <div class="question-card">
      <span class="question-chapter-tag">${CHAPTER_NAMES[q.chapter] || ""}</span>
      <p class="question-text">${q.q}</p>
      <button class="speak-btn" id="speakBtn">🔊 読み上げる</button>
    </div>

    <div class="answer-buttons">
      <button class="answer-btn maru" data-choice="true">◯</button>
      <button class="answer-btn batsu" data-choice="false">✕</button>
    </div>
  `;

  document.getElementById("speakBtn").addEventListener("click", (e) => {
    speak(q.yomi_q || q.q);
    e.target.classList.add("speaking");
    setTimeout(() => e.target.classList.remove("speaking"), 1500);
  });

  app.querySelectorAll(".answer-btn").forEach((btn) => {
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
      <p class="result-verdict">${correct ? "✅ 正解！" : "❌ 不正解"}</p>
      <p class="result-correct-answer">正解：${q.a ? "◯" : "✕"}</p>
      <p class="result-exp">${q.exp}</p>
      <p class="result-cite">出典：${q.cite}</p>
      <button class="speak-btn" id="speakExpBtn">🔊 解説を読み上げる</button>
    </div>

    <button class="next-btn" id="nextBtn">${index + 1 < questions.length ? "次の問題へ" : "結果を見る"}</button>
  `;

  document.getElementById("speakExpBtn").addEventListener("click", (e) => {
    const verdict = correct ? "正解。" : "不正解。";
    speak(verdict + (q.yomi_exp || q.exp));
    e.target.classList.add("speaking");
    setTimeout(() => e.target.classList.remove("speaking"), 1500);
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
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
  `;

  document.getElementById("retryBtn").addEventListener("click", () => {
    startSession(shuffle(session.questions), session.label);
  });
  document.getElementById("backBtn").addEventListener("click", renderChapterSelect);
}

// --- 初期化 ---
fetch("data/questions.json")
  .then((r) => r.json())
  .then((data) => {
    ALL_QUESTIONS = data;
    renderChapterSelect();
  })
  .catch(() => {
    app.innerHTML = `<p style="text-align:center;color:var(--wrong);padding:40px 16px;">
      問題データの読み込みに失敗しました。ページを再読み込みしてください。</p>`;
  });
