const TOTAL_ROUNDS = 10;

let socket = null;

const screens = {
  lobby: document.getElementById("screen-lobby"),
  searching: document.getElementById("screen-searching"),
  game: document.getElementById("screen-game"),
  results: document.getElementById("screen-results"),
};

const findMatchBtn = document.getElementById("find-match-btn");
const cancelMatchBtn = document.getElementById("cancel-match-btn");
const lobbyStatusEl = document.getElementById("lobby-status");
const connectionStatusEl = document.getElementById("connection-status");

let socketConnected = false;

const playerScoreEl = document.getElementById("player-score");
const opponentScoreEl = document.getElementById("opponent-score");
const opponentLabelEl = document.getElementById("opponent-label");
const roundLabelEl = document.getElementById("round-label");
const playerPlayedEl = document.getElementById("player-played");
const opponentPlayedEl = document.getElementById("opponent-played");
const messageEl = document.getElementById("message");
const handEl = document.getElementById("player-hand");

const resultsTitleEl = document.getElementById("results-title");
const resultsMessageEl = document.getElementById("results-message");

let playerHand = [];
let hasPlayedThisRound = false;
let gameActive = false;
let returnLobbyTimer = null;

function showScreen(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== name);
  });
}

function setConnectionStatus(ok, message) {
  socketConnected = ok;
  connectionStatusEl.textContent = message;
  connectionStatusEl.className = "connection-status " + (ok ? "ok" : "error");
  findMatchBtn.disabled = !ok;
}

function resetToLobbyUI(statusText = "") {
  if (returnLobbyTimer) {
    clearTimeout(returnLobbyTimer);
    returnLobbyTimer = null;
  }

  gameActive = false;
  hasPlayedThisRound = false;
  playerHand = [];

  updateScoreboard(0, 0, 1, false);
  clearBattleArea();
  messageEl.className = "message";
  messageEl.textContent = "카드 한 장을 골라서 클릭하세요.";
  opponentLabelEl.textContent = "상대";
  resultsTitleEl.textContent = "게임 종료";
  resultsMessageEl.textContent = "";
  resultsMessageEl.className = "results-message";
  handEl.innerHTML = "";

  // 새로고침·href 없이 URL만 루트로 정리 (Render Not Found 방지)
  if (window.location.pathname !== "/") {
    window.history.replaceState(null, "", "/");
  }

  showScreen("lobby");
  findMatchBtn.disabled = !socketConnected;
  lobbyStatusEl.textContent = statusText;
}

function showLobby(statusText = "") {
  resetToLobbyUI(statusText);
}

function showSearching() {
  showScreen("searching");
}

function showGame() {
  showScreen("game");
  gameActive = true;
}

function showResults(title, message, resultClass) {
  showScreen("results");
  resultsTitleEl.textContent = title;
  resultsMessageEl.textContent = message;
  resultsMessageEl.className = "results-message " + (resultClass || "");
}

function updateScoreboard(yourScore, opponentScore, round, gameOver) {
  playerScoreEl.textContent = yourScore;
  opponentScoreEl.textContent = opponentScore;
  roundLabelEl.textContent = gameOver
    ? "게임 종료"
    : `${round} / ${TOTAL_ROUNDS} 턴`;
}

function setPlayedCard(el, value) {
  if (value === null || value === undefined) {
    el.textContent = "—";
    el.classList.add("empty");
  } else {
    el.textContent = value;
    el.classList.remove("empty");
  }
}

function clearBattleArea() {
  setPlayedCard(playerPlayedEl, null);
  setPlayedCard(opponentPlayedEl, null);
}

function renderHand() {
  handEl.innerHTML = "";

  playerHand.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-btn";
    btn.textContent = card;
    btn.disabled = !gameActive || hasPlayedThisRound;
    btn.addEventListener("click", () => {
      if (!gameActive || hasPlayedThisRound || !socket) return;
      socket.emit("playCard", { card });
      hasPlayedThisRound = true;
      renderHand();
    });
    handEl.appendChild(btn);
  });
}

function startRoundUI(round) {
  hasPlayedThisRound = false;
  clearBattleArea();
  updateScoreboard(
    Number(playerScoreEl.textContent),
    Number(opponentScoreEl.textContent),
    round,
    false
  );
  messageEl.className = "message";
  messageEl.textContent = "카드 한 장을 골라서 클릭하세요.";
  renderHand();
}

findMatchBtn.addEventListener("click", () => {
  if (!socketConnected || !socket) return;
  findMatchBtn.disabled = true;
  lobbyStatusEl.textContent = "";
  socket.emit("findMatch");
});

cancelMatchBtn.addEventListener("click", () => {
  if (!socket) return;
  socket.emit("cancelMatch");
});

function setupSocket() {
  if (typeof io === "undefined") {
    setConnectionStatus(
      false,
      "실시간 연결 파일 로드 실패. npm.cmd install 후 npm.cmd start로 서버를 켠 뒤, 이 사이트 주소로 다시 접속하세요."
    );
    showLobby();
    return;
  }

  // 주소를 비우면 현재 접속한 도메인(로컬·Render 배포 주소)에 자동 연결됩니다.
  socket = io();

socket.on("connect", () => {
  setConnectionStatus(true, "서버 연결됨 — Find match를 누르세요.");
  const onResultsScreen = !screens.results.classList.contains("hidden");
  if (!onResultsScreen && !gameActive) {
    resetToLobbyUI();
  }
});

socket.on("connect_error", () => {
  setConnectionStatus(
    false,
    "서버 연결 실패. install-and-start.bat 실행 또는 npm.cmd install 후 npm.cmd start 를 실행했는지 확인하세요."
  );
  showLobby("연결이 안 되어 매칭할 수 없습니다.");
});

socket.on("connected", () => {
  // 화면 전환 없음 (게임 중 로비로 튕기는 것 방지)
});

socket.on("searching", () => {
  showSearching();
});

socket.on("matched", ({ message }) => {
  messageEl.textContent = message;
});

socket.on("gameStart", ({ opponentLabel }) => {
  playerHand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  opponentLabelEl.textContent = opponentLabel || "상대";
  updateScoreboard(0, 0, 1, false);
  showGame();
  startRoundUI(1);
});

socket.on("waitingForOpponent", ({ message }) => {
  messageEl.className = "message";
  messageEl.textContent = message;
});

socket.on("opponentPlayed", ({ message }) => {
  if (!hasPlayedThisRound) {
    messageEl.className = "message";
    messageEl.textContent = message;
  }
});

socket.on("roundResult", (data) => {
  const {
    round,
    yourCard,
    opponentCard,
    yourScore,
    opponentScore,
    roundMessage,
    isLastRound,
  } = data;

  setPlayedCard(playerPlayedEl, yourCard);
  setPlayedCard(opponentPlayedEl, opponentCard);
  updateScoreboard(yourScore, opponentScore, round, isLastRound);

  messageEl.className = "message";
  if (roundMessage.includes("승리")) {
    messageEl.classList.add("win");
  } else if (roundMessage.includes("패배")) {
    messageEl.classList.add("lose");
  } else {
    messageEl.classList.add("draw");
  }

  if (isLastRound) {
    messageEl.textContent = roundMessage;
    handEl.innerHTML = "";
    gameActive = false;
  } else {
    messageEl.textContent = roundMessage + " — 다음 카드를 고르세요.";
    playerHand = playerHand.filter((c) => c !== yourCard);
    setTimeout(() => startRoundUI(round + 1), 1200);
  }
});

socket.on("gameOver", ({ result, finalMessage, yourScore, opponentScore }) => {
  gameActive = false;
  handEl.innerHTML = "";
  updateScoreboard(yourScore, opponentScore, TOTAL_ROUNDS, true);

  let title = "게임 종료";
  let resultClass = "draw";

  if (result === "win") {
    title = "승리!";
    resultClass = "win";
  } else if (result === "lose") {
    title = "패배…";
    resultClass = "lose";
  } else {
    title = "무승부";
  }

  showResults(title, finalMessage, resultClass);

  if (returnLobbyTimer) clearTimeout(returnLobbyTimer);
  returnLobbyTimer = setTimeout(() => {
    returnLobbyTimer = null;
    resetToLobbyUI("다시 매칭할 수 있습니다.");
  }, 5000);
});

socket.on("returnToLobby", ({ message }) => {
  resetToLobbyUI(message || "다시 매칭할 수 있습니다.");
});

socket.on("opponentLeft", ({ message }) => {
  resetToLobbyUI(message || "상대가 나갔습니다. 매칭 화면으로 돌아갑니다.");
});

  setConnectionStatus(false, "서버 연결 확인 중…");
  showLobby();
}

setupSocket();
