const express = require("express");
const http = require("http");
const path = require("path");
const os = require("os");
let Server;
try {
  ({ Server } = require("socket.io"));
} catch (error) {
  console.error("");
  console.error("  [오류] socket.io 가 설치되지 않았습니다.");
  console.error("  이 폴더에서 아래 명령을 실행한 뒤 다시 시작하세요:");
  console.error("");
  console.error("    npm.cmd install");
  console.error("    npm.cmd start");
  console.error("");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const TOTAL_ROUNDS = 10;
const ALL_CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RESULT_DELAY_MS = 5000;
const PUBLIC_DIR = path.resolve(__dirname, "public");

app.use(express.static(PUBLIC_DIR, { index: "index.html" }));

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// 새로고침·잘못된 경로 접근 시에도 SPA index 반환 (Not Found 방지)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/socket.io")) {
    return next();
  }
  res.sendFile(path.join(PUBLIC_DIR, "index.html"), (err) => {
    if (err) next(err);
  });
});

const waitingQueue = [];
const games = new Map();
const socketToGame = new Map();

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function removeFromQueue(socketId) {
  const index = waitingQueue.indexOf(socketId);
  if (index !== -1) {
    waitingQueue.splice(index, 1);
  }
}

function createGame(playerA, playerB) {
  const gameId = `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const game = {
    id: gameId,
    players: [playerA, playerB],
    hands: [ALL_CARDS.slice(), ALL_CARDS.slice()],
    scores: [0, 0],
    round: 1,
    plays: [null, null],
    phase: "playing",
  };

  games.set(gameId, game);
  socketToGame.set(playerA, gameId);
  socketToGame.set(playerB, gameId);
  return game;
}

function getPlayerIndex(game, socketId) {
  return game.players.indexOf(socketId);
}

function emitToPlayer(socketId, event, payload) {
  io.to(socketId).emit(event, payload);
}

function startGameForBoth(game) {
  game.players.forEach((socketId, index) => {
    emitToPlayer(socketId, "gameStart", {
      yourIndex: index,
      totalRounds: TOTAL_ROUNDS,
      opponentLabel: index === 0 ? "플레이어 2" : "플레이어 1",
    });
  });
}

function resolveRound(game) {
  const [card0, card1] = game.plays;
  let roundWinner = null;

  if (card0 > card1) {
    game.scores[0] += 1;
    roundWinner = 0;
  } else if (card1 > card0) {
    game.scores[1] += 1;
    roundWinner = 1;
  }

  game.players.forEach((socketId, index) => {
    const opponentIndex = 1 - index;
    const yourCard = game.plays[index];
    const opponentCard = game.plays[opponentIndex];
    let roundMessage;

    if (roundWinner === null) {
      roundMessage = `무승부! (둘 다 ${yourCard})`;
    } else if (roundWinner === index) {
      roundMessage = `이번 턴 승리! (나 ${yourCard} > 상대 ${opponentCard})`;
    } else {
      roundMessage = `이번 턴 패배… (나 ${yourCard} < 상대 ${opponentCard})`;
    }

    emitToPlayer(socketId, "roundResult", {
      round: game.round,
      totalRounds: TOTAL_ROUNDS,
      yourCard,
      opponentCard,
      yourScore: game.scores[index],
      opponentScore: game.scores[opponentIndex],
      roundMessage,
      isLastRound: game.round >= TOTAL_ROUNDS,
    });
  });

  game.plays = [null, null];

  if (game.round >= TOTAL_ROUNDS) {
    endGame(game);
  } else {
    game.round += 1;
    game.phase = "playing";
  }
}

function endGame(game) {
  game.phase = "ended";

  game.players.forEach((socketId, index) => {
    const opponentIndex = 1 - index;
    const yourScore = game.scores[index];
    const opponentScore = game.scores[opponentIndex];
    let result;
    let finalMessage;

    if (yourScore > opponentScore) {
      result = "win";
      finalMessage = `최종 승리! (${yourScore} : ${opponentScore})`;
    } else if (yourScore < opponentScore) {
      result = "lose";
      finalMessage = `최종 패배… (${yourScore} : ${opponentScore})`;
    } else {
      result = "draw";
      finalMessage = `최종 무승부! (${yourScore} : ${opponentScore})`;
    }

    emitToPlayer(socketId, "gameOver", {
      yourScore,
      opponentScore,
      result,
      finalMessage,
    });
  });

  setTimeout(() => {
    game.players.forEach((socketId) => {
      emitToPlayer(socketId, "returnToLobby", {
        message: "다시 매칭할 수 있습니다.",
      });
    });
    cleanupGame(game.id);
  }, RESULT_DELAY_MS);
}

function cleanupGame(gameId) {
  const game = games.get(gameId);
  if (!game) return;

  game.players.forEach((socketId) => {
    socketToGame.delete(socketId);
  });
  games.delete(gameId);
}

function leaveActiveGame(socketId, reason) {
  const gameId = socketToGame.get(socketId);
  if (!gameId) return;

  const game = games.get(gameId);
  if (!game) return;

  const opponentId = game.players.find((id) => id !== socketId);
  if (opponentId) {
    emitToPlayer(opponentId, "opponentLeft", {
      message: reason || "상대가 나갔습니다. 매칭 화면으로 돌아갑니다.",
    });
  }

  cleanupGame(gameId);
}

io.on("connection", (socket) => {
  socket.emit("connected", { message: "서버에 연결되었습니다." });

  socket.on("findMatch", () => {
    leaveActiveGame(socket.id, "이전 게임이 종료되었습니다.");
    removeFromQueue(socket.id);

    if (waitingQueue.length > 0) {
      const opponentId = waitingQueue.shift();
      const opponentSocket = io.sockets.sockets.get(opponentId);

      if (!opponentSocket) {
        waitingQueue.push(socket.id);
        socket.emit("searching", { message: "매칭 찾는중..." });
        return;
      }

      const game = createGame(opponentId, socket.id);
      emitToPlayer(opponentId, "matched", { message: "상대를 찾았습니다! 게임을 시작합니다." });
      socket.emit("matched", { message: "상대를 찾았습니다! 게임을 시작합니다." });
      startGameForBoth(game);
      return;
    }

    waitingQueue.push(socket.id);
    socket.emit("searching", { message: "매칭 찾는중..." });
  });

  socket.on("cancelMatch", () => {
    removeFromQueue(socket.id);
    socket.emit("returnToLobby", { message: "매칭을 취소했습니다." });
  });

  socket.on("playCard", ({ card }) => {
    const gameId = socketToGame.get(socket.id);
    if (!gameId) return;

    const game = games.get(gameId);
    if (!game || game.phase !== "playing") return;

    const playerIndex = getPlayerIndex(game, socket.id);
    if (playerIndex === -1) return;
    if (game.plays[playerIndex] !== null) return;

    const cardNumber = Number(card);
    if (!ALL_CARDS.includes(cardNumber)) return;

    const handIndex = game.hands[playerIndex].indexOf(cardNumber);
    if (handIndex === -1) return;

    game.hands[playerIndex].splice(handIndex, 1);
    game.plays[playerIndex] = cardNumber;

    const opponentIndex = 1 - playerIndex;
    emitToPlayer(game.players[opponentIndex], "opponentPlayed", {
      message: "상대가 카드를 냈습니다. 당신도 카드를 내주세요.",
    });

    if (game.plays[opponentIndex] === null) {
      socket.emit("waitingForOpponent", {
        message: "카드를 냈습니다. 상대를 기다리는 중…",
      });
      return;
    }

    game.phase = "resolving";
    resolveRound(game);
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    leaveActiveGame(socket.id, "상대 연결이 끊어졌습니다.");
  });
});

server.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log("");
  console.log("  숫자 카드 게임 서버가 켜졌습니다!");
  console.log("");
  console.log(`  이 컴퓨터:     http://localhost:${PORT}`);
  if (localIp) {
    console.log(`  같은 Wi-Fi 친구: http://${localIp}:${PORT}`);
  }
  console.log("");
  console.log("  종료: Ctrl + C");
  console.log("");
});
