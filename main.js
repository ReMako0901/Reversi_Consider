const SIZE = 8;
const BLACK = "black";
const WHITE = "white";
const EMPTY = null;
const DIRECTIONS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const FILE_LABELS = "ABCDEFGH";
const INF = 1_000_000;

let board = [];
let currentPlayer = BLACK;
let gameOver = false;
let mode = "play";
let reviewIndex = 0;
let searchDepth = 4;
let moveHistory = [];
let analysisHistory = [];
let analyzingMoveNumbers = new Set();
let gameMode = "human";
let humanPlayer = BLACK;
let cpuPlayer = WHITE;
let isCpuThinking = false;
let cpuLevel = "normal";
let cpuThinkingTimer = null;
let cpuMoveRequestId = 0;

const elements = {
  board: document.querySelector("#board"),
  modeLabel: document.querySelector("#modeLabel"),
  gameModeLabel: document.querySelector("#gameModeLabel"),
  turnLabel: document.querySelector("#turnLabel"),
  blackCount: document.querySelector("#blackCount"),
  whiteCount: document.querySelector("#whiteCount"),
  message: document.querySelector("#message"),
  humanModeButton: document.querySelector("#humanModeButton"),
  cpuModeButton: document.querySelector("#cpuModeButton"),
  cpuThinkingLabel: document.querySelector("#cpuThinkingLabel"),
  resetButton: document.querySelector("#resetButton"),
  reviewButton: document.querySelector("#reviewButton"),
  cpuLevelSelect: document.querySelector("#cpuLevelSelect"),
  depthSelect: document.querySelector("#depthSelect"),
  reviewControls: document.querySelector("#reviewControls"),
  playControlsPanel: document.querySelector("#playControlsPanel"),
  rankingPanel: document.querySelector("#rankingPanel"),
  blunderPanel: document.querySelector("#blunderPanel"),
  explanationPanel: document.querySelector("#explanationPanel"),
  readmePanel: document.querySelector("#readmePanel"),
  firstButton: document.querySelector("#firstButton"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  lastButton: document.querySelector("#lastButton"),
  exitReviewButton: document.querySelector("#exitReviewButton"),
  reviewMeta: document.querySelector("#reviewMeta"),
  analysisContent: document.querySelector("#analysisContent"),
  rankingList: document.querySelector("#rankingList"),
  blunderList: document.querySelector("#blunderList"),
  explanationText: document.querySelector("#explanationText"),
};

function initGame() {
  clearCpuThinking();
  board = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  board[3][3] = WHITE;
  board[4][4] = WHITE;
  board[3][4] = BLACK;
  board[4][3] = BLACK;

  currentPlayer = BLACK;
  gameOver = false;
  mode = "play";
  reviewIndex = 0;
  moveHistory = [];
  analysisHistory = [];
  analyzingMoveNumbers = new Set();
  renderAll();
  maybeTriggerCpuMove();
}

function renderAll() {
  document.body.classList.toggle("review-mode", mode === "review");
  renderBoard();
  renderStatus();
  renderAnalysisPanel();
  renderMoveRanking();
  renderBlunderList();
}

function renderBoard() {
  const displayBoard = getDisplayBoard();
  const legalMoves = canHumanPlayCurrentTurn() ? getLegalMoves(board, currentPlayer) : [];
  const actualMove = getReviewMove();
  const bestMove = getReviewBestMove();

  elements.board.innerHTML = "";
  displayBoard.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const square = document.createElement("button");
      square.type = "button";
      square.className = "cell";
      square.dataset.row = String(rowIndex);
      square.dataset.col = String(colIndex);
      square.setAttribute("aria-label", `${moveToLabel(rowIndex, colIndex)} ${cell || "空き"}`);
      square.disabled = !canHumanPlayCurrentTurn();

      if (legalMoves.some((move) => sameMove(move, { row: rowIndex, col: colIndex }))) {
        square.classList.add("legal");
      }
      if (actualMove && sameMove(actualMove, { row: rowIndex, col: colIndex })) {
        square.classList.add("actual-move");
      }
      if (bestMove && sameMove(bestMove, { row: rowIndex, col: colIndex })) {
        square.classList.add("best-move");
      }
      if (cell) {
        const disc = document.createElement("span");
        disc.className = `disc ${cell}`;
        square.appendChild(disc);
      }

      square.addEventListener("click", () => handleCellClick(rowIndex, colIndex));
      elements.board.appendChild(square);
    });
  });
}

function renderStatus() {
  const counts = countDiscs(getDisplayBoard());
  elements.modeLabel.textContent = mode === "play" ? "対局" : "検討";
  elements.gameModeLabel.textContent = gameMode === "cpu" ? "CPU対戦" : "2人対戦";
  const reviewRecord = mode === "review" ? moveHistory[reviewIndex] : null;
  elements.turnLabel.textContent = playerLabel(reviewRecord ? reviewRecord.player : currentPlayer);
  elements.blackCount.textContent = counts.black;
  elements.whiteCount.textContent = counts.white;
  elements.reviewControls.classList.toggle("hidden", mode !== "review");
  elements.playControlsPanel.classList.toggle("hidden", mode === "review");
  elements.blunderPanel.classList.toggle("hidden", mode === "review");
  elements.readmePanel.classList.toggle("hidden", mode === "review");
  elements.reviewButton.disabled = moveHistory.length === 0 || isCpuThinking;
  elements.humanModeButton.classList.toggle("active", gameMode === "human");
  elements.cpuModeButton.classList.toggle("active", gameMode === "cpu");
  elements.humanModeButton.disabled = mode === "review" || isCpuThinking;
  elements.cpuModeButton.disabled = mode === "review" || isCpuThinking;
  elements.cpuLevelSelect.disabled = gameMode !== "cpu" || mode === "review" || isCpuThinking;
  elements.cpuThinkingLabel.classList.toggle("hidden", !isCpuThinking);

  if (mode === "review") {
    const record = moveHistory[reviewIndex];
    if (!record) {
      elements.message.textContent = "まだ再生できる棋譜がありません。";
      elements.reviewMeta.textContent = "まだ棋譜がありません。";
      return;
    }
    elements.message.textContent = `${record.moveNumber}手目 ${playerLabel(record.player)} ${record.moveLabel} を表示中です。`;
    const actorLabel = record.actor === "cpu" ? "CPU" : "人間";
    const visiblePosition = getReviewableMoveIndexes().indexOf(reviewIndex) + 1;
    const visibleCount = getReviewableMoveIndexes().length;
    elements.reviewMeta.textContent = `現在: ${visiblePosition}手目 / ${visibleCount}手目、棋譜上: ${record.moveNumber}手目、手番: ${playerLabel(record.player)}、実際の手: ${record.isPass ? "パス" : record.moveLabel}、打ち手: ${actorLabel}`;
    elements.firstButton.disabled = getPreviousReviewableIndex(reviewIndex) === null;
    elements.prevButton.disabled = getPreviousReviewableIndex(reviewIndex) === null;
    elements.nextButton.disabled = getNextReviewableIndex(reviewIndex) === null;
    elements.lastButton.disabled = getNextReviewableIndex(reviewIndex) === null;
    return;
  }

  if (gameOver) {
    const result = getResultText(countDiscs(board));
    elements.message.textContent = `対局終了: ${result}`;
  } else if (isCpuThinking) {
    elements.message.textContent = "CPU思考中...";
  } else if (isCpuTurn()) {
    elements.message.textContent = "CPUの手番です。";
  } else {
    elements.message.textContent = `${playerLabel(currentPlayer)}の手番です。`;
  }
}

function getDisplayBoard() {
  if (mode === "review" && moveHistory[reviewIndex]) {
    // 検討モードでは「その手を打った後」の局面を表示する指定なので boardAfter を使います。
    return moveHistory[reviewIndex].boardAfter;
  }
  return board;
}

function getOpponent(player) {
  return player === BLACK ? WHITE : BLACK;
}

function getLegalMoves(targetBoard, player) {
  const moves = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (isValidMove(targetBoard, row, col, player)) {
        moves.push({ row, col });
      }
    }
  }
  return moves;
}

function isValidMove(targetBoard, row, col, player) {
  if (!isInside(row, col) || targetBoard[row][col] !== EMPTY) return false;
  return getFlippableDiscs(targetBoard, row, col, player).length > 0;
}

function getFlippableDiscs(targetBoard, row, col, player) {
  const opponent = getOpponent(player);
  const flippable = [];

  // 8方向それぞれで「相手石が1個以上続き、その先に自分の石がある」時だけ反転対象になります。
  for (const [dr, dc] of DIRECTIONS) {
    const line = [];
    let nextRow = row + dr;
    let nextCol = col + dc;

    while (isInside(nextRow, nextCol) && targetBoard[nextRow][nextCol] === opponent) {
      line.push({ row: nextRow, col: nextCol });
      nextRow += dr;
      nextCol += dc;
    }

    if (line.length > 0 && isInside(nextRow, nextCol) && targetBoard[nextRow][nextCol] === player) {
      flippable.push(...line);
    }
  }
  return flippable;
}

function handleCellClick(row, col) {
  if (mode !== "play") return;
  if (gameOver) return;
  if (isCpuThinking) return;
  if (gameMode === "cpu" && currentPlayer === cpuPlayer) return;
  makeMove(row, col);
}

function makeMove(row, col) {
  if (!canHumanPlayCurrentTurn() || !isValidMove(board, row, col, currentPlayer)) return;
  playMove(row, col, currentPlayer);
  switchTurn();
  checkGameOver();
  renderAll();
  maybeTriggerCpuMove();
}

function playMove(row, col, player) {
  const boardBefore = cloneBoard(board);
  const legalMoves = getLegalMoves(board, player);
  const flipped = getFlippableDiscs(board, row, col, player);
  const boardAfter = applyMove(board, row, col, player);

  board = boardAfter;
  recordMove({
    player,
    actor: getMoveActor(player),
    boardBefore,
    boardAfter: cloneBoard(boardAfter),
    move: { row, col },
    flipped,
    legalMoves,
    isPass: false,
  });
}

function applyMove(targetBoard, row, col, player) {
  // AI探索中に元の盤面を壊すと評価が崩れるため、必ずコピー済みの盤面だけを書き換えます。
  const nextBoard = cloneBoard(targetBoard);
  const discs = getFlippableDiscs(nextBoard, row, col, player);
  nextBoard[row][col] = player;
  discs.forEach((disc) => {
    nextBoard[disc.row][disc.col] = player;
  });
  return nextBoard;
}

function switchTurn() {
  const nextPlayer = getOpponent(currentPlayer);
  if (hasAnyLegalMove(board, nextPlayer)) {
    currentPlayer = nextPlayer;
    return;
  }

  // 次のプレイヤーに合法手がない場合は、自動パスを棋譜に1手として記録します。
  handlePass(nextPlayer);
  if (!hasAnyLegalMove(board, currentPlayer)) {
    gameOver = true;
  }
}

function countDiscs(targetBoard) {
  return targetBoard.flat().reduce(
    (counts, cell) => {
      if (cell === BLACK) counts.black += 1;
      if (cell === WHITE) counts.white += 1;
      return counts;
    },
    { black: 0, white: 0 },
  );
}

function checkGameOver() {
  const noEmpty = getEmptyCount(board) === 0;
  const bothPass = getLegalMoves(board, BLACK).length === 0 && getLegalMoves(board, WHITE).length === 0;
  if (noEmpty || bothPass) {
    gameOver = true;
  }
}

function resetGame() {
  clearCpuThinking();
  initGame();
}

function setGameMode(nextMode) {
  if (!["human", "cpu"].includes(nextMode)) return;
  if (gameMode === nextMode && mode === "play") return;
  gameMode = nextMode;
  humanPlayer = BLACK;
  cpuPlayer = WHITE;
  resetGame();
}

function setCpuLevel(level) {
  if (!["easy", "normal", "hard"].includes(level)) return;
  cpuLevel = level;
}

function isCpuTurn() {
  return mode === "play" && gameMode === "cpu" && currentPlayer === cpuPlayer;
}

function canHumanPlayCurrentTurn() {
  if (mode !== "play") return false;
  if (gameOver) return false;
  if (isCpuThinking) return false;
  if (gameMode === "cpu" && currentPlayer === cpuPlayer) return false;
  return true;
}

function recordMove({ player, actor = getMoveActor(player), boardBefore, boardAfter, move, flipped, legalMoves, isPass }) {
  const counts = countDiscs(boardAfter);
  moveHistory.push({
    moveNumber: moveHistory.length + 1,
    player,
    actor,
    gameMode,
    boardBefore: cloneBoard(boardBefore),
    boardAfter: cloneBoard(boardAfter),
    move,
    moveLabel: isPass ? "PASS" : moveToLabel(move.row, move.col),
    flipped: flipped.map((disc) => ({ ...disc })),
    legalMoves: legalMoves.map((legalMove) => ({ ...legalMove })),
    blackCount: counts.black,
    whiteCount: counts.white,
    isPass,
  });
}

function recordPass(player) {
  const snapshot = cloneBoard(board);
  recordMove({
    player,
    actor: getMoveActor(player),
    boardBefore: snapshot,
    boardAfter: snapshot,
    move: null,
    flipped: [],
    legalMoves: [],
    isPass: true,
  });
}

function handlePass(player) {
  recordPass(player);
}

function getMoveActor(player) {
  return gameMode === "cpu" && player === cpuPlayer ? "cpu" : "human";
}

function shouldSkipReviewAnalysis(moveRecord) {
  return moveRecord && moveRecord.gameMode === "cpu" && (moveRecord.actor === "cpu" || moveRecord.player === cpuPlayer);
}

function isReviewableMove(moveRecord) {
  return moveRecord && !shouldSkipReviewAnalysis(moveRecord);
}

function getReviewableMoveIndexes() {
  return moveHistory.reduce((indexes, moveRecord, index) => {
    if (isReviewableMove(moveRecord)) indexes.push(index);
    return indexes;
  }, []);
}

function hasAnyLegalMove(targetBoard, player) {
  return getLegalMoves(targetBoard, player).length > 0;
}

function maybeTriggerCpuMove() {
  if (mode !== "play") return;
  if (gameMode !== "cpu") return;
  if (currentPlayer !== cpuPlayer) return;
  if (gameOver) return;
  if (isCpuThinking) return;

  isCpuThinking = true;
  const requestId = ++cpuMoveRequestId;
  renderAll();

  cpuThinkingTimer = setTimeout(() => {
    if (requestId !== cpuMoveRequestId) return;
    makeCpuMove();
  }, 500);
}

function makeCpuMove() {
  if (!isCpuTurn() || gameOver) {
    clearCpuThinking();
    renderAll();
    return;
  }

  const cpuMove = chooseCpuMove(board, currentPlayer);
  if (!cpuMove) {
    handlePass(currentPlayer);
    const nextPlayer = getOpponent(currentPlayer);
    if (hasAnyLegalMove(board, nextPlayer)) {
      currentPlayer = nextPlayer;
    } else {
      gameOver = true;
    }
  } else {
    playMove(cpuMove.row, cpuMove.col, currentPlayer);
    switchTurn();
    checkGameOver();
  }

  clearCpuThinking();
  renderAll();
  maybeTriggerCpuMove();
}

function chooseCpuMove(targetBoard, player) {
  if (cpuLevel === "easy") return chooseRandomMove(targetBoard, player);
  if (cpuLevel === "hard") return chooseSearchMove(targetBoard, player);
  return chooseHeuristicMove(targetBoard, player);
}

function chooseRandomMove(targetBoard, player) {
  const legalMoves = getLegalMoves(targetBoard, player);
  if (legalMoves.length === 0) return null;
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

function chooseHeuristicMove(targetBoard, player) {
  const legalMoves = getLegalMoves(targetBoard, player);
  if (legalMoves.length === 0) return null;
  const scoredMoves = legalMoves.map((move) => ({
    move,
    score: scoreCpuMove(targetBoard, player, move),
  }));
  const bestScore = Math.max(...scoredMoves.map((item) => item.score));
  const bestMoves = scoredMoves.filter((item) => item.score === bestScore);
  return bestMoves[Math.floor(Math.random() * bestMoves.length)].move;
}

function chooseSearchMove(targetBoard, player) {
  if (typeof analyzePosition === "function") {
    const analysis = analyzePosition(targetBoard, player);
    if (analysis && analysis.bestMove) return analysis.bestMove;
  }
  return chooseHeuristicMove(targetBoard, player);
}

function scoreCpuMove(targetBoard, player, move) {
  const opponent = getOpponent(player);
  const nextBoard = applyMove(targetBoard, move.row, move.col, player);
  const emptyCount = getEmptyCount(targetBoard);
  const flippedCount = getFlippableDiscs(targetBoard, move.row, move.col, player).length;
  let score = 0;

  if (isCorner(move.row, move.col)) score += 1000;
  if (isXSquare(move.row, move.col)) score -= 300;
  if (isCSquare(move.row, move.col)) score -= 150;
  if (wouldGiveCorner(targetBoard, player, move)) score -= 800;
  if (isEdge(move.row, move.col)) score += 40;

  const playerMobilityAfter = getLegalMoves(nextBoard, player).length;
  const opponentMobilityAfter = getLegalMoves(nextBoard, opponent).length;
  score += playerMobilityAfter * 20;
  score -= opponentMobilityAfter * 25;

  if (emptyCount <= 14) {
    const counts = countDiscs(nextBoard);
    score += (counts[player] - counts[opponent]) * 10;
    score += flippedCount * 8;
  } else {
    score -= Math.max(0, flippedCount - 3) * 12;
  }

  score += stableGainAfterMove(targetBoard, player, move) * 60;
  return score;
}

function clearCpuThinking() {
  cpuMoveRequestId += 1;
  if (cpuThinkingTimer !== null) {
    clearTimeout(cpuThinkingTimer);
    cpuThinkingTimer = null;
  }
  isCpuThinking = false;
}

function moveToLabel(row, col) {
  return `${FILE_LABELS[col]}${row + 1}`;
}

function cloneBoard(targetBoard) {
  // 2次元配列を参照共有しないよう、各行もコピーします。
  return targetBoard.map((row) => row.slice());
}

function enterReviewMode() {
  if (moveHistory.length === 0) return;
  const reviewableIndexes = getReviewableMoveIndexes();
  if (reviewableIndexes.length === 0) return;
  mode = "review";
  reviewIndex = reviewableIndexes[0];
  renderReviewPosition();
  analyzeAllMoves();
}

function exitReviewMode() {
  mode = "play";
  renderAll();
}

function renderReviewPosition() {
  if (!isReviewableMove(moveHistory[reviewIndex])) {
    const nextIndex = getNextReviewableIndex(reviewIndex) ?? getPreviousReviewableIndex(reviewIndex) ?? getReviewableMoveIndexes()[0];
    if (nextIndex !== undefined) reviewIndex = nextIndex;
  }
  renderAll();
  if (moveHistory[reviewIndex]) {
    ensureAnalysisForReviewIndex(reviewIndex);
  }
}

function goToFirstMove() {
  const firstIndex = getReviewableMoveIndexes()[0];
  if (firstIndex !== undefined) goToReviewIndex(firstIndex);
}

function goToPreviousMove() {
  const previousIndex = getPreviousReviewableIndex(reviewIndex);
  if (previousIndex !== null) goToReviewIndex(previousIndex);
}

function goToNextMove() {
  const nextIndex = getNextReviewableIndex(reviewIndex);
  if (nextIndex !== null) goToReviewIndex(nextIndex);
}

function goToLastMove() {
  const reviewableIndexes = getReviewableMoveIndexes();
  const lastIndex = reviewableIndexes[reviewableIndexes.length - 1];
  if (lastIndex !== undefined) goToReviewIndex(lastIndex);
}

function goToReviewIndex(index) {
  if (moveHistory.length === 0) return;
  const clampedIndex = clamp(index, 0, moveHistory.length - 1);
  reviewIndex = isReviewableMove(moveHistory[clampedIndex])
    ? clampedIndex
    : (getNextReviewableIndex(clampedIndex) ?? getPreviousReviewableIndex(clampedIndex) ?? clampedIndex);
  renderReviewPosition();
}

function getPreviousReviewableIndex(index) {
  const reviewableIndexes = getReviewableMoveIndexes();
  for (let i = reviewableIndexes.length - 1; i >= 0; i -= 1) {
    if (reviewableIndexes[i] < index) return reviewableIndexes[i];
  }
  return null;
}

function getNextReviewableIndex(index) {
  return getReviewableMoveIndexes().find((reviewableIndex) => reviewableIndex > index) ?? null;
}

function analyzePosition(targetBoard, player) {
  const moves = getSortedMoves(targetBoard, player);
  const emptyCount = getEmptyCount(targetBoard);
  const depth = emptyCount <= 14 ? emptyCount : searchDepth;

  if (moves.length === 0) {
    const score = isTerminalPosition(targetBoard)
      ? getTerminalScore(targetBoard, player)
      : -negamax(targetBoard, getOpponent(player), depth, -INF, INF);
    return {
      bestMove: null,
      bestScore: score,
      moveEvaluations: [],
    };
  }

  const moveEvaluations = moves
    .map((move) => ({
      move,
      label: moveToLabel(move.row, move.col),
      score: evaluateMove(targetBoard, move, player, depth),
      rank: 0,
      reasonTags: [],
    }))
    .sort((a, b) => b.score - a.score);

  moveEvaluations.forEach((item, index) => {
    item.rank = index + 1;
    item.reasonTags = generateReasonTags(targetBoard, player, item.move, item.score);
  });

  return {
    bestMove: moveEvaluations[0].move,
    bestScore: moveEvaluations[0].score,
    moveEvaluations,
  };
}

function evaluateMove(targetBoard, move, player, depth) {
  const nextBoard = applyMove(targetBoard, move.row, move.col, player);
  return -negamax(nextBoard, getOpponent(player), Math.max(0, depth - 1), -INF, INF);
}

function negamax(targetBoard, player, depth, alpha, beta) {
  // 戻り値は常に「今手番の player から見た評価値」に揃えます。
  if (isTerminalPosition(targetBoard)) return getTerminalScore(targetBoard, player);
  if (depth <= 0) return evaluateBoard(targetBoard, player);

  const moves = getSortedMoves(targetBoard, player);
  if (moves.length === 0) {
    return -negamax(targetBoard, getOpponent(player), depth, -beta, -alpha);
  }

  let bestScore = -INF;
  for (const move of moves) {
    const nextBoard = applyMove(targetBoard, move.row, move.col, player);
    const score = -negamax(nextBoard, getOpponent(player), depth - 1, -beta, -alpha);
    bestScore = Math.max(bestScore, score);
    alpha = Math.max(alpha, score);
    if (alpha >= beta) break;
  }
  return bestScore;
}

function evaluateBoard(targetBoard, player) {
  const opponent = getOpponent(player);
  const emptyCount = getEmptyCount(targetBoard);
  let score = 0;

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const cell = targetBoard[row][col];
      if (!cell) continue;
      const value = getPositionWeight(targetBoard, row, col, cell);
      score += cell === player ? value : -value;
    }
  }

  const playerMobility = getLegalMoves(targetBoard, player).length;
  const opponentMobility = getLegalMoves(targetBoard, opponent).length;
  score += (playerMobility - opponentMobility) * 8;

  const counts = countDiscs(targetBoard);
  const discDiff = counts[player] - counts[opponent];
  score += discDiff * (emptyCount <= 14 ? 10 : 1);

  score += (countStableEdgeDiscs(targetBoard, player) - countStableEdgeDiscs(targetBoard, opponent)) * 12;
  return Math.round(score);
}

function getPositionWeight(targetBoard, row, col, owner) {
  const baseWeights = [
    [100, -25, 10, 8, 8, 10, -25, 100],
    [-25, -50, -4, -3, -3, -4, -50, -25],
    [10, -4, 5, 2, 2, 5, -4, 10],
    [8, -3, 2, 1, 1, 2, -3, 8],
    [8, -3, 2, 1, 1, 2, -3, 8],
    [10, -4, 5, 2, 2, 5, -4, 10],
    [-25, -50, -4, -3, -3, -4, -50, -25],
    [100, -25, 10, 8, 8, 10, -25, 100],
  ];
  let weight = baseWeights[row][col];

  // 角をすでに自分が持っている場合、その角周辺のX/Cマスの危険度を弱めます。
  for (const corner of getAdjacentCorners(row, col)) {
    if (targetBoard[corner.row][corner.col] === owner && (isXSquare(row, col) || isCSquare(row, col))) {
      weight = Math.max(weight, 4);
    }
  }
  return weight;
}

function getEmptyCount(targetBoard) {
  return targetBoard.flat().filter((cell) => cell === EMPTY).length;
}

function isTerminalPosition(targetBoard) {
  return (
    getEmptyCount(targetBoard) === 0 ||
    (getLegalMoves(targetBoard, BLACK).length === 0 && getLegalMoves(targetBoard, WHITE).length === 0)
  );
}

function getSortedMoves(targetBoard, player) {
  return getLegalMoves(targetBoard, player).sort((a, b) => moveSortScore(targetBoard, b, player) - moveSortScore(targetBoard, a, player));
}

function moveSortScore(targetBoard, move, player) {
  let score = getPositionWeight(targetBoard, move.row, move.col, player);
  if (isCorner(move.row, move.col)) score += 1000;
  if (wouldGiveCorner(targetBoard, player, move)) score -= 500;
  return score;
}

function getTerminalScore(targetBoard, player) {
  const counts = countDiscs(targetBoard);
  const diff = counts[player] - counts[getOpponent(player)];
  return diff * 1000;
}

function evaluateChosenMove(moveRecord, analysis) {
  if (moveRecord.isPass) {
    return {
      chosenMove: null,
      chosenLabel: "PASS",
      chosenScore: analysis.bestScore,
      bestMove: analysis.bestMove,
      bestLabel: analysis.bestMove ? moveToLabel(analysis.bestMove.row, analysis.bestMove.col) : "PASS",
      bestScore: analysis.bestScore,
      scoreLoss: 0,
      accuracy: 100,
      judgement: "最善級",
      reasonTags: ["safe_move"],
    };
  }

  const chosenEvaluation = analysis.moveEvaluations.find((item) => sameMove(item.move, moveRecord.move));
  const chosenScore = chosenEvaluation ? chosenEvaluation.score : null;
  const bestScore = analysis.bestScore;
  const scoreLoss = chosenScore === null ? 0 : Math.max(0, bestScore - chosenScore);
  const reasonTags = chosenEvaluation
    ? chosenEvaluation.reasonTags
    : generateReasonTags(moveRecord.boardBefore, moveRecord.player, moveRecord.move, chosenScore || 0);

  return {
    chosenMove: moveRecord.move,
    chosenLabel: moveRecord.moveLabel,
    chosenScore,
    bestMove: analysis.bestMove,
    bestLabel: analysis.bestMove ? moveToLabel(analysis.bestMove.row, analysis.bestMove.col) : "PASS",
    bestScore,
    scoreLoss,
    accuracy: calculateAccuracy(scoreLoss),
    judgement: getJudgement(scoreLoss),
    reasonTags,
  };
}

function getJudgement(scoreLoss) {
  if (scoreLoss <= 5) return "最善級";
  if (scoreLoss <= 15) return "ほぼ問題なし";
  if (scoreLoss <= 35) return "疑問手";
  if (scoreLoss <= 70) return "悪手";
  return "大悪手";
}

function calculateAccuracy(scoreLoss) {
  return clamp(Math.round(100 - scoreLoss), 0, 100);
}

function generateReasonTags(targetBoard, player, move, score) {
  const tags = new Set();
  const emptyCount = getEmptyCount(targetBoard);
  const flippedCount = getFlippableDiscs(targetBoard, move.row, move.col, player).length;
  const mobility = countMobilityAfterMove(targetBoard, player, move);

  if (isCorner(move.row, move.col)) tags.add("corner_taken");
  if (isXSquare(move.row, move.col)) tags.add("x_square");
  if (isCSquare(move.row, move.col)) tags.add("c_square");
  if (wouldGiveCorner(targetBoard, player, move)) tags.add("corner_given");
  if (mobility.playerLegalMovesAfter < mobility.playerLegalMovesBefore) tags.add("mobility_down");
  if (mobility.opponentLegalMovesAfter > mobility.opponentLegalMovesBefore) tags.add("opponent_mobility_up");
  if (emptyCount > 20 && flippedCount >= 5) tags.add("too_many_flips");
  if (stableGainAfterMove(targetBoard, player, move) > 0) tags.add("stable_discs_gain");
  if (emptyCount <= 14 && score < -20) tags.add("endgame_loss");
  if (tags.size === 0) tags.add("safe_move");

  return [...tags];
}

function isCorner(row, col) {
  return (row === 0 || row === SIZE - 1) && (col === 0 || col === SIZE - 1);
}

function isEdge(row, col) {
  return row === 0 || row === SIZE - 1 || col === 0 || col === SIZE - 1;
}

function isXSquare(row, col) {
  return (
    (row === 1 && col === 1) ||
    (row === 1 && col === 6) ||
    (row === 6 && col === 1) ||
    (row === 6 && col === 6)
  );
}

function isCSquare(row, col) {
  return (
    (row === 0 && (col === 1 || col === 6)) ||
    (row === 1 && (col === 0 || col === 7)) ||
    (row === 6 && (col === 0 || col === 7)) ||
    (row === 7 && (col === 1 || col === 6))
  );
}

function wouldGiveCorner(targetBoard, player, move) {
  const nextBoard = applyMove(targetBoard, move.row, move.col, player);
  return getLegalMoves(nextBoard, getOpponent(player)).some((candidate) => isCorner(candidate.row, candidate.col));
}

function countMobilityAfterMove(targetBoard, player, move) {
  const opponent = getOpponent(player);
  const nextBoard = applyMove(targetBoard, move.row, move.col, player);
  return {
    playerLegalMovesBefore: getLegalMoves(targetBoard, player).length,
    opponentLegalMovesBefore: getLegalMoves(targetBoard, opponent).length,
    playerLegalMovesAfter: getLegalMoves(nextBoard, player).length,
    opponentLegalMovesAfter: getLegalMoves(nextBoard, opponent).length,
  };
}

function renderAnalysisPanel() {
  if (mode !== "review") {
    elements.analysisContent.innerHTML = '<p class="muted">検討モードで手を選ぶと評価を表示します。</p>';
    elements.explanationText.textContent = "検討モードで解析すると、ルールベースの簡易解説を表示します。";
    return;
  }

  const record = moveHistory[reviewIndex];
  if (!record) {
    elements.analysisContent.innerHTML = '<p class="muted">まだ棋譜がありません。</p>';
    return;
  }

  if (shouldSkipReviewAnalysis(record)) {
    elements.analysisContent.innerHTML = `
      <div class="skip-analysis">
        <strong>CPUの手は評価対象外です</strong>
        <p>CPU対戦の白番はアプリ側が選んだ手なので、accuracy や悪手度の採点は行いません。</p>
      </div>
    `;
    elements.explanationText.textContent = "この手はCPUが打った手です。検討では人間の判断を振り返るため、評価と解説生成をスキップしています。";
    return;
  }

  const saved = getAnalysisForMove(record.moveNumber);
  if (!saved) {
    elements.analysisContent.innerHTML = '<p class="muted">解析中...</p>';
    elements.explanationText.textContent = "解析中...";
    return;
  }

  const evaluated = saved.evaluatedMove;
  const judgementClass = evaluated.scoreLoss <= 15 ? "good" : evaluated.scoreLoss <= 35 ? "warn" : "bad";
  const bestText = sameMove(evaluated.chosenMove, evaluated.bestMove) ? "最善手です" : evaluated.bestLabel;

  elements.analysisContent.innerHTML = `
    <div class="analysis-summary">
      <div class="metric"><span>実際の手</span><strong>${evaluated.chosenLabel}</strong></div>
      <div class="metric"><span>AI推奨手</span><strong>${bestText}</strong></div>
      <div class="metric"><span>accuracy</span><strong>${evaluated.accuracy} / 100</strong></div>
      <div class="metric"><span>悪手度 scoreLoss</span><strong>${evaluated.scoreLoss}</strong></div>
    </div>
    <p><span class="judgement ${judgementClass}">${evaluated.judgement}</span></p>
    <p>${evaluated.reasonTags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</p>
  `;
  elements.explanationText.textContent = saved.explanation || "解説を生成中です。";
}

function renderMoveRanking() {
  elements.rankingList.innerHTML = "";
  if (mode !== "review") return;

  const record = moveHistory[reviewIndex];
  const saved = record ? getAnalysisForMove(record.moveNumber) : null;
  if (record && shouldSkipReviewAnalysis(record)) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "CPUの手は候補手ランキングを表示しません。";
    elements.rankingList.appendChild(item);
    return;
  }
  if (!record || !saved) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "解析中...";
    elements.rankingList.appendChild(item);
    return;
  }

  const ranking = saved.analysis.moveEvaluations;
  if (ranking.length === 0) {
    const item = document.createElement("li");
    item.textContent = "候補手はありません。パスの局面です。";
    elements.rankingList.appendChild(item);
    return;
  }

  ranking.slice(0, 3).forEach((candidate) => {
    const item = document.createElement("li");
    const isBest = sameMove(candidate.move, saved.analysis.bestMove);
    const isActual = sameMove(candidate.move, record.move);
    item.innerHTML = `
      <strong>${candidate.rank}位 ${candidate.label} ${formatScore(candidate.score)}点
        ${isBest ? '<span class="badge">AI推奨</span>' : ""}
        ${isActual ? '<span class="badge actual">実際の手</span>' : ""}
      </strong>
      <span>${candidate.reasonTags.map((tag) => `<span class="tag">${tag}</span>`).join("")}</span>
    `;
    elements.rankingList.appendChild(item);
  });
}

function highlightActualMove() {
  renderBoard();
}

function highlightBestMove() {
  renderBoard();
}

async function analyzeAllMoves() {
  for (let index = 0; index < moveHistory.length; index += 1) {
    if (shouldSkipReviewAnalysis(moveHistory[index])) continue;
    await ensureAnalysisForReviewIndex(index);
    renderBlunderList();
  }
}

function renderBlunderList() {
  const blunders = analysisHistory
    .filter((entry) => !entry.skipped && entry.evaluatedMove && entry.evaluatedMove.scoreLoss >= 36)
    .sort((a, b) => a.moveNumber - b.moveNumber);

  elements.blunderList.innerHTML = "";
  if (blunders.length === 0) {
    elements.blunderList.textContent = mode === "review" ? "今のところ悪手以上の手は見つかっていません。" : "scoreLoss が36以上の手を表示します。";
    elements.blunderList.classList.add("muted");
    return;
  }

  elements.blunderList.classList.remove("muted");
  blunders.forEach((entry) => {
    const record = moveHistory.find((move) => move.moveNumber === entry.moveNumber);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "blunder-item";
    button.innerHTML = `
      <strong>${entry.moveNumber}手目 ${playerLabel(record.player)} ${entry.evaluatedMove.chosenLabel}</strong>
      ${entry.evaluatedMove.judgement} / 悪手度 ${entry.evaluatedMove.scoreLoss}<br>
      ${getShortReasonText(entry.evaluatedMove.reasonTags)}
    `;
    button.addEventListener("click", () => {
      mode = "review";
      goToReviewIndex(entry.moveNumber - 1);
    });
    elements.blunderList.appendChild(button);
  });
}

function getShortReasonText(reasonTags) {
  const dictionary = {
    corner_taken: "角を取れる良い手です。",
    corner_given: "相手に角を渡す危険があります。",
    x_square: "Xマスに置いています。",
    c_square: "Cマスに置いています。",
    mobility_down: "自分の選択肢が減りやすい手です。",
    opponent_mobility_up: "相手の選択肢を増やしています。",
    too_many_flips: "序盤・中盤で返しすぎの傾向があります。",
    stable_discs_gain: "安定石を増やせる手です。",
    endgame_loss: "終盤の石数を大きく損しやすい手です。",
    safe_move: "大きなリスクは少ない手です。",
  };
  return reasonTags.map((tag) => dictionary[tag] || tag).join(" ");
}

function generateTemplateExplanation(evaluatedMove) {
  const parts = [];
  const risky = evaluatedMove.scoreLoss >= 16;

  if (risky) {
    parts.push(`実際の手は${evaluatedMove.chosenLabel}、AI推奨手は${evaluatedMove.bestLabel}でした。`);
  } else if (sameMove(evaluatedMove.chosenMove, evaluatedMove.bestMove)) {
    parts.push(`この局面では${evaluatedMove.chosenLabel}が最善手です。`);
  } else {
    parts.push(`この手は大きな問題が少ない手です。AI推奨は${evaluatedMove.bestLabel}でした。`);
  }

  if (evaluatedMove.reasonTags.includes("corner_taken")) {
    parts.push("角を取れる良い手です。角は返されないため、安定した有利につながります。");
  }
  if (evaluatedMove.reasonTags.includes("x_square")) {
    parts.push("角の斜め隣に置くため、相手に角を取られる危険が高くなりやすい手です。");
  }
  if (evaluatedMove.reasonTags.includes("c_square")) {
    parts.push("角の横隣に置くため、角をめぐる攻防で不利になりやすい点に注意が必要です。");
  }
  if (evaluatedMove.reasonTags.includes("mobility_down")) {
    parts.push("この手の後、自分の打てる場所が少なくなり、次の展開が苦しくなりやすいです。");
  }
  if (evaluatedMove.reasonTags.includes("opponent_mobility_up")) {
    parts.push("相手の選択肢を増やしてしまうため、主導権を渡しやすい手です。");
  }
  if (evaluatedMove.reasonTags.includes("too_many_flips")) {
    parts.push("序盤・中盤で石を多く返しすぎると、相手に動きやすい形を与えることがあります。");
  }
  if (evaluatedMove.reasonTags.includes("endgame_loss")) {
    parts.push("終盤では最終石数に直結しやすく、この局面では損が大きく出ています。");
  }
  if (risky) {
    parts.push("次からは角周辺の危険マスと、打った後に相手の選択肢が増えないかを先に確認しましょう。");
  }

  return parts.join("");
}

function generateExplanationPayload(moveRecord, evaluatedMove, analysis) {
  const chosenResult = moveRecord.move
    ? summarizeMoveResult(moveRecord.boardBefore, moveRecord.player, moveRecord.move)
    : summarizePassResult(moveRecord.boardBefore, moveRecord.player);
  const bestResult = analysis.bestMove
    ? summarizeMoveResult(moveRecord.boardBefore, moveRecord.player, analysis.bestMove)
    : summarizePassResult(moveRecord.boardBefore, moveRecord.player);

  return {
    game: "reversi",
    moveNumber: moveRecord.moveNumber,
    phase: getPhase(moveRecord.boardBefore),
    player: moveRecord.player,
    chosenMove: evaluatedMove.chosenLabel,
    bestMove: evaluatedMove.bestLabel,
    scoreLoss: evaluatedMove.scoreLoss,
    accuracy: evaluatedMove.accuracy,
    judgement: evaluatedMove.judgement,
    reasonTags: evaluatedMove.reasonTags,
    topCandidates: analysis.moveEvaluations.slice(0, 3).map((candidate) => ({
      move: candidate.label,
      score: candidate.score,
      rank: candidate.rank,
    })),
    chosenMoveResult: chosenResult,
    bestMoveResult: bestResult,
  };
}

async function requestGptExplanation(payload) {
  /*
    サーバー側で使うプロンプト例:
    「あなたはオセロの棋譜検討アシスタントです。以下の解析済みデータをもとに、
    初心者にも分かるように100〜180字の日本語で解説してください。最善手そのものは
    再判断せず、与えられたbestMove、chosenMove、scoreLoss、reasonTagsをもとに説明してください。
    断定しすぎず、『この局面では』『〜しやすい』という表現を使ってください。石数だけでなく、
    角、Xマス、Cマス、合法手数、相手の選択肢を重視してください。」
  */
  if (!location.protocol.startsWith("http")) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch("/api/explain-move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.explanation === "string" ? data.explanation : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getExplanation(moveRecord, evaluatedMove, analysis) {
  const payload = generateExplanationPayload(moveRecord, evaluatedMove, analysis);
  const gptExplanation = await requestGptExplanation(payload);
  if (gptExplanation) {
    return { explanation: gptExplanation, source: "gpt" };
  }
  return {
    explanation: generateTemplateExplanation(evaluatedMove),
    source: "template",
  };
}

function getAnalysisForMove(moveNumber) {
  return analysisHistory.find((entry) => entry.moveNumber === moveNumber) || null;
}

function saveAnalysisForMove(moveNumber, data) {
  const index = analysisHistory.findIndex((entry) => entry.moveNumber === moveNumber);
  const entry = { moveNumber, ...data };
  if (index >= 0) {
    analysisHistory[index] = entry;
  } else {
    analysisHistory.push(entry);
  }
}

async function ensureAnalysisForReviewIndex(index) {
  const moveRecord = moveHistory[index];
  if (!moveRecord || getAnalysisForMove(moveRecord.moveNumber) || analyzingMoveNumbers.has(moveRecord.moveNumber)) {
    return getAnalysisForMove(moveRecord ? moveRecord.moveNumber : -1);
  }

  if (shouldSkipReviewAnalysis(moveRecord)) {
    saveAnalysisForMove(moveRecord.moveNumber, {
      analysis: null,
      evaluatedMove: null,
      explanation: null,
      explanationSource: null,
      skipped: true,
    });
    if (mode === "review" && moveHistory[reviewIndex]?.moveNumber === moveRecord.moveNumber) {
      renderAll();
    }
    return getAnalysisForMove(moveRecord.moveNumber);
  }

  analyzingMoveNumbers.add(moveRecord.moveNumber);
  await waitForPaint();

  const analysis = analyzePosition(moveRecord.boardBefore, moveRecord.player);
  const evaluatedMove = evaluateChosenMove(moveRecord, analysis);
  const explanationResult = await getExplanation(moveRecord, evaluatedMove, analysis);

  saveAnalysisForMove(moveRecord.moveNumber, {
    analysis,
    evaluatedMove,
    explanation: explanationResult.explanation,
    explanationSource: explanationResult.source,
  });
  analyzingMoveNumbers.delete(moveRecord.moveNumber);

  if (mode === "review" && moveHistory[reviewIndex]?.moveNumber === moveRecord.moveNumber) {
    renderAll();
    highlightActualMove();
    highlightBestMove();
  }
  return getAnalysisForMove(moveRecord.moveNumber);
}

function summarizeMoveResult(targetBoard, player, move) {
  const after = applyMove(targetBoard, move.row, move.col, player);
  const counts = countDiscs(after);
  return {
    blackCount: counts.black,
    whiteCount: counts.white,
    playerLegalMovesAfter: getLegalMoves(after, player).length,
    opponentLegalMovesAfter: getLegalMoves(after, getOpponent(player)).length,
  };
}

function summarizePassResult(targetBoard, player) {
  const counts = countDiscs(targetBoard);
  return {
    blackCount: counts.black,
    whiteCount: counts.white,
    playerLegalMovesAfter: getLegalMoves(targetBoard, player).length,
    opponentLegalMovesAfter: getLegalMoves(targetBoard, getOpponent(player)).length,
  };
}

function getPhase(targetBoard) {
  const emptyCount = getEmptyCount(targetBoard);
  if (emptyCount >= 44) return "opening";
  if (emptyCount <= 14) return "endgame";
  return "middle";
}

function getReviewMove() {
  return mode === "review" && moveHistory[reviewIndex] ? moveHistory[reviewIndex].move : null;
}

function getReviewBestMove() {
  if (mode !== "review" || !moveHistory[reviewIndex]) return null;
  if (shouldSkipReviewAnalysis(moveHistory[reviewIndex])) return null;
  const saved = getAnalysisForMove(moveHistory[reviewIndex].moveNumber);
  return saved && saved.evaluatedMove ? saved.evaluatedMove.bestMove : null;
}

function isInside(row, col) {
  return row >= 0 && row < SIZE && col >= 0 && col < SIZE;
}

function sameMove(a, b) {
  if (!a || !b) return a === b;
  return a.row === b.row && a.col === b.col;
}

function playerLabel(player) {
  return player === BLACK ? "黒" : "白";
}

function getResultText(counts) {
  if (counts.black > counts.white) return `黒の勝ち (${counts.black}-${counts.white})`;
  if (counts.white > counts.black) return `白の勝ち (${counts.black}-${counts.white})`;
  return `引き分け (${counts.black}-${counts.white})`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatScore(score) {
  return score > 0 ? `+${score}` : `${score}`;
}

function waitForPaint() {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

function getAdjacentCorners(row, col) {
  return [
    { row: 0, col: 0 },
    { row: 0, col: 7 },
    { row: 7, col: 0 },
    { row: 7, col: 7 },
  ].filter((corner) => Math.abs(corner.row - row) <= 1 && Math.abs(corner.col - col) <= 1);
}

function countStableEdgeDiscs(targetBoard, player) {
  let stable = 0;
  const cornerLines = [
    { corner: [0, 0], lines: [[0, 1], [1, 0]] },
    { corner: [0, 7], lines: [[0, -1], [1, 0]] },
    { corner: [7, 0], lines: [[0, 1], [-1, 0]] },
    { corner: [7, 7], lines: [[0, -1], [-1, 0]] },
  ];

  cornerLines.forEach(({ corner, lines }) => {
    const [cornerRow, cornerCol] = corner;
    if (targetBoard[cornerRow][cornerCol] !== player) return;
    stable += 1;
    lines.forEach(([dr, dc]) => {
      let row = cornerRow + dr;
      let col = cornerCol + dc;
      while (isInside(row, col) && targetBoard[row][col] === player) {
        stable += 1;
        row += dr;
        col += dc;
      }
    });
  });
  return stable;
}

function stableGainAfterMove(targetBoard, player, move) {
  const before = countStableEdgeDiscs(targetBoard, player);
  const after = countStableEdgeDiscs(applyMove(targetBoard, move.row, move.col, player), player);
  return after - before;
}

elements.resetButton.addEventListener("click", resetGame);
elements.humanModeButton.addEventListener("click", () => setGameMode("human"));
elements.cpuModeButton.addEventListener("click", () => setGameMode("cpu"));
elements.reviewButton.addEventListener("click", enterReviewMode);
elements.exitReviewButton.addEventListener("click", exitReviewMode);
elements.firstButton.addEventListener("click", goToFirstMove);
elements.prevButton.addEventListener("click", goToPreviousMove);
elements.nextButton.addEventListener("click", goToNextMove);
elements.lastButton.addEventListener("click", goToLastMove);
elements.cpuLevelSelect.addEventListener("change", (event) => {
  setCpuLevel(event.target.value);
});
elements.depthSelect.addEventListener("change", (event) => {
  searchDepth = Number(event.target.value);
  analysisHistory = [];
  if (mode === "review") {
    renderReviewPosition();
    analyzeAllMoves();
  }
});

initGame();
