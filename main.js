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
const MAX_IMPORT_FILE_SIZE = 1024 * 1024;
const ENDGAME_EXACT_EMPTY_LIMIT = 10;
const TERMINAL_DISC_WEIGHT = 16;
const TERMINAL_WIN_BONUS = 120;
const EXPLAIN_API_URL = null;

let board = [];
let currentPlayer = BLACK;
let gameOver = false;
let mode = "play";
let reviewIndex = 0;
let searchDepth = 4;
let moveHistory = [];
let analysisHistory = [];
let analyzingMoveNumbers = new Set();
let gameMode = "cpu";
let humanPlayer = BLACK;
let cpuPlayer = WHITE;
let isCpuThinking = false;
let cpuLevel = "normal";
let cpuThinkingTimer = null;
let cpuMoveRequestId = 0;
let sideSelectionPending = false;
let currentGameTitle = "棋譜";
let isReviewBatchAnalyzing = false;
let reviewBatchAnalysisId = 0;

const elements = {
  board: document.querySelector("#board"),
  analysisLoadingOverlay: document.querySelector("#analysisLoadingOverlay"),
  sideChoiceOverlay: document.querySelector("#sideChoiceOverlay"),
  chooseBlackButton: document.querySelector("#chooseBlackButton"),
  chooseWhiteButton: document.querySelector("#chooseWhiteButton"),
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
  jsonImportInput: document.querySelector("#jsonImportInput"),
  jsonExportButton: document.querySelector("#jsonExportButton"),
  importExportMessage: document.querySelector("#importExportMessage"),
  cpuLevelSelect: document.querySelector("#cpuLevelSelect"),
  searchDepthField: document.querySelector("#searchDepthField"),
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
  nextBranchButton: document.querySelector("#nextBranchButton"),
  exitReviewButton: document.querySelector("#exitReviewButton"),
  reviewMeta: document.querySelector("#reviewMeta"),
  analysisContent: document.querySelector("#analysisContent"),
  rankingList: document.querySelector("#rankingList"),
  blunderList: document.querySelector("#blunderList"),
  explanationText: document.querySelector("#explanationText"),
  summaryPanel: document.querySelector("#summaryPanel"),
  summaryContent: document.querySelector("#summaryContent"),
};

function initGame() {
  clearCpuThinking();
  cancelReviewBatchAnalysis();
  board = createInitialBoard();

  currentPlayer = BLACK;
  gameOver = false;
  mode = "play";
  reviewIndex = 0;
  sideSelectionPending = gameMode === "cpu";
  currentGameTitle = "棋譜";
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
  renderGameSummary();
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
  document.body.classList.toggle("cpu-mode", gameMode === "cpu");
  elements.modeLabel.textContent = mode === "play" ? "対局" : "検討";
  elements.gameModeLabel.textContent = gameMode === "cpu" ? "CPU対戦" : "2人対戦";
  const reviewRecord = mode === "review" ? moveHistory[reviewIndex] : null;
  elements.turnLabel.textContent = sideSelectionPending ? "選択中" : playerLabel(reviewRecord ? reviewRecord.player : currentPlayer);
  elements.blackCount.textContent = counts.black;
  elements.whiteCount.textContent = counts.white;
  elements.reviewControls.classList.toggle("hidden", mode !== "review");
  elements.playControlsPanel.classList.toggle("hidden", mode === "review");
  elements.rankingPanel.classList.toggle("hidden", mode !== "review");
  elements.blunderPanel.classList.toggle("hidden", mode !== "review");
  elements.explanationPanel.classList.toggle("hidden", mode !== "review");
  elements.summaryPanel.classList.toggle("hidden", mode !== "review");
  elements.analysisContent.closest(".panel").classList.toggle("hidden", mode !== "review");
  elements.readmePanel?.classList.toggle("hidden", mode === "review");
  elements.reviewButton.disabled = getReviewableMoveIndexes().length === 0 || isCpuThinking;
  elements.jsonExportButton.disabled = moveHistory.filter((record) => !record.isPass).length === 0 || isCpuThinking;
  elements.humanModeButton.classList.toggle("active", gameMode === "human");
  elements.cpuModeButton.classList.toggle("active", gameMode === "cpu");
  elements.humanModeButton.disabled = mode === "review" || isCpuThinking;
  elements.cpuModeButton.disabled = mode === "review" || isCpuThinking;
  elements.cpuLevelSelect.disabled = gameMode !== "cpu" || mode === "review" || isCpuThinking;
  elements.searchDepthField.classList.toggle("hidden", mode !== "play" || gameMode !== "cpu" || cpuLevel !== "hard");
  elements.depthSelect.disabled = gameMode !== "cpu" || cpuLevel !== "hard" || mode === "review" || isCpuThinking;
  elements.nextBranchButton.disabled = mode !== "review" || getNextBranchIndex(reviewIndex) === null || isReviewBatchAnalyzing;
  elements.cpuThinkingLabel.classList.toggle("hidden", !isCpuThinking);
  elements.sideChoiceOverlay.classList.toggle("hidden", mode !== "play" || gameMode !== "cpu" || !sideSelectionPending);
  elements.analysisLoadingOverlay.classList.toggle("hidden", !isReviewBatchAnalyzing);

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
    elements.reviewMeta.textContent = `検討 ${visiblePosition} / ${visibleCount} ・ 棋譜${record.moveNumber}手目 ・ ${playerLabel(record.player)} ${record.isPass ? "パス" : record.moveLabel}（${actorLabel}）`;
    elements.firstButton.disabled = getPreviousReviewableIndex(reviewIndex) === null;
    elements.prevButton.disabled = getPreviousReviewableIndex(reviewIndex) === null;
    elements.nextButton.disabled = getNextReviewableIndex(reviewIndex) === null;
    elements.lastButton.disabled = getNextReviewableIndex(reviewIndex) === null;
    return;
  }

  if (gameOver) {
    const result = getResultText(countDiscs(board));
    elements.message.textContent = `対局終了: ${result}`;
  } else if (sideSelectionPending) {
    elements.message.textContent = "CPU対戦で使う色を選んでください。";
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

function createInitialBoard() {
  const initialBoard = Array.from({ length: SIZE }, () => Array(SIZE).fill(EMPTY));
  initialBoard[3][3] = WHITE;
  initialBoard[4][4] = WHITE;
  initialBoard[3][4] = BLACK;
  initialBoard[4][3] = BLACK;
  return initialBoard;
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
  if (sideSelectionPending) return;
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

function chooseHumanSide(player) {
  if (gameMode !== "cpu" || mode !== "play" || !sideSelectionPending) return;
  humanPlayer = player;
  cpuPlayer = getOpponent(player);
  currentPlayer = BLACK;
  sideSelectionPending = false;
  renderAll();
  maybeTriggerCpuMove();
}

function setCpuLevel(level) {
  if (!["easy", "normal", "hard"].includes(level)) return;
  cpuLevel = level;
  renderStatus();
}

function isCpuTurn() {
  return mode === "play" && gameMode === "cpu" && !sideSelectionPending && currentPlayer === cpuPlayer;
}

function canHumanPlayCurrentTurn() {
  if (mode !== "play") return false;
  if (gameOver) return false;
  if (sideSelectionPending) return false;
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
  return moveRecord && moveRecord.gameMode === "cpu" && moveRecord.actor === "cpu";
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
  if (sideSelectionPending) return;
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

function setReviewAnalysisLoading(isLoading) {
  isReviewBatchAnalyzing = isLoading;
  elements.analysisLoadingOverlay.classList.toggle("hidden", !isLoading);
}

function cancelReviewBatchAnalysis() {
  reviewBatchAnalysisId += 1;
  setReviewAnalysisLoading(false);
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
  setReviewAnalysisLoading(true);
  renderReviewPosition();
  analyzeAllMoves();
}

function exitReviewMode() {
  cancelReviewBatchAnalysis();
  mode = "play";
  renderAll();
}

function renderReviewPosition() {
  if (!isReviewableMove(moveHistory[reviewIndex])) {
    const nextIndex = getNextReviewableIndex(reviewIndex) ?? getPreviousReviewableIndex(reviewIndex) ?? getReviewableMoveIndexes()[0];
    if (nextIndex !== undefined) reviewIndex = nextIndex;
  }
  renderAll();
  if (moveHistory[reviewIndex] && !isReviewBatchAnalyzing) {
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

function goToNextBranch() {
  const nextBranchIndex = getNextBranchIndex(reviewIndex);
  if (nextBranchIndex === null) return;
  goToReviewIndex(nextBranchIndex);
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

function getNextBranchIndex(index) {
  return getReviewableMoveIndexes().find((reviewableIndex) => {
    if (reviewableIndex <= index) return false;
    const record = moveHistory[reviewableIndex];
    const saved = record ? getAnalysisForMove(record.moveNumber) : null;
    return isDivergentMoveAnalysis(saved);
  }) ?? null;
}

function isDivergentMoveAnalysis(saved) {
  return Boolean(saved?.evaluatedMove && !sameMove(saved.evaluatedMove.chosenMove, saved.evaluatedMove.bestMove));
}

function analyzePosition(targetBoard, player) {
  const moves = getSortedMoves(targetBoard, player);
  const emptyCount = getEmptyCount(targetBoard);
  const depth = emptyCount <= ENDGAME_EXACT_EMPTY_LIMIT ? emptyCount : searchDepth;

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
  if (diff === 0) return 0;
  return diff * TERMINAL_DISC_WEIGHT + Math.sign(diff) * TERMINAL_WIN_BONUS;
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
    <p>${evaluated.reasonTags.map((tag) => `<span class="tag">${formatTagLabel(tag)}</span>`).join("")}</p>
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
      <span>${candidate.reasonTags.map((tag) => `<span class="tag">${formatTagLabel(tag)}</span>`).join("")}</span>
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
  const batchId = ++reviewBatchAnalysisId;
  setReviewAnalysisLoading(true);
  await waitForPaint();

  try {
    for (let index = 0; index < moveHistory.length; index += 1) {
      if (batchId !== reviewBatchAnalysisId || mode !== "review") break;
      if (shouldSkipReviewAnalysis(moveHistory[index])) continue;
      await ensureAnalysisForReviewIndex(index);
      renderBlunderList();
    }
  } finally {
    if (batchId === reviewBatchAnalysisId) {
      setReviewAnalysisLoading(false);
      renderAll();
    }
  }
}

function renderBlunderList() {
  const blunders = analysisHistory
    .filter((entry) => !entry.skipped && entry.evaluatedMove && entry.evaluatedMove.scoreLoss >= 36)
    .sort((a, b) => a.moveNumber - b.moveNumber);

  elements.blunderList.innerHTML = "";
  if (blunders.length === 0) {
    elements.blunderList.textContent = mode === "review" ? "今のところ悪手以上の手は見つかっていません。" : "評価損の大きかった手を自動で一覧にします。";
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

// reasonTags の内部キーを画面表示用の短い日本語ラベルへ変換します。
// 固定辞書の値のみを innerHTML に渡すため、外部入力が混ざらないようにしています。
const TAG_LABELS = {
  corner_taken: "角を確保",
  corner_given: "角を献上",
  x_square: "Xマス",
  c_square: "Cマス",
  mobility_down: "自分の手数減",
  opponent_mobility_up: "相手の手数増",
  too_many_flips: "返しすぎ",
  stable_discs_gain: "安定石が増加",
  endgame_loss: "終盤で損",
  safe_move: "安全な手",
};

function formatTagLabel(tag) {
  return TAG_LABELS[tag] || tag;
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

// ===== ローカル解説生成 =====
// 盤面情報から「この局面で何が大事か」を1つ選び、それを軸に2〜4文の解説を組み立てます。
// 文章は moveNumber を種にしたバリエーション選択で、手ごとに言い回しが変わるようにしています。

function pickVariant(seed, variants) {
  return variants[Math.abs(seed) % variants.length];
}

function buildExplanationContext(moveRecord, evaluatedMove, analysis) {
  const boardBefore = moveRecord.boardBefore;
  const player = moveRecord.player;
  const opponent = getOpponent(player);
  const chosenMove = moveRecord.move;
  const bestMove = analysis.bestMove;
  const chosenResult = chosenMove
    ? summarizeMoveResult(boardBefore, player, chosenMove)
    : summarizePassResult(boardBefore, player);
  const bestResult = bestMove
    ? summarizeMoveResult(boardBefore, player, bestMove)
    : summarizePassResult(boardBefore, player);
  const chosenEvaluation = chosenMove
    ? analysis.moveEvaluations.find((item) => sameMove(item.move, chosenMove))
    : null;
  const cornersGiven = chosenMove
    ? getLegalMoves(applyMove(boardBefore, chosenMove.row, chosenMove.col, player), opponent)
        .filter((move) => isCorner(move.row, move.col))
        .map((move) => moveToLabel(move.row, move.col))
    : [];

  return {
    moveNumber: moveRecord.moveNumber,
    phase: getPhase(boardBefore),
    emptyCount: getEmptyCount(boardBefore),
    isPass: moveRecord.isPass,
    playerName: playerLabel(player),
    chosenLabel: evaluatedMove.chosenLabel,
    bestLabel: evaluatedMove.bestLabel,
    isBestChoice: Boolean(chosenMove && bestMove && sameMove(chosenMove, bestMove)),
    scoreLoss: evaluatedMove.scoreLoss,
    judgement: evaluatedMove.judgement,
    reasonTags: evaluatedMove.reasonTags,
    flippedCount: moveRecord.flipped.length,
    chosenRank: chosenEvaluation ? chosenEvaluation.rank : null,
    candidateCount: analysis.moveEvaluations.length,
    mobility: chosenMove ? countMobilityAfterMove(boardBefore, player, chosenMove) : null,
    opponentMovesAfterChosen: chosenResult.opponentLegalMovesAfter,
    opponentMovesAfterBest: bestResult.opponentLegalMovesAfter,
    playerMovesAfterChosen: chosenResult.playerLegalMovesAfter,
    chosenIsCorner: Boolean(chosenMove && isCorner(chosenMove.row, chosenMove.col)),
    chosenIsX: Boolean(chosenMove && isXSquare(chosenMove.row, chosenMove.col)),
    chosenIsC: Boolean(chosenMove && isCSquare(chosenMove.row, chosenMove.col)),
    chosenIsEdge: Boolean(chosenMove && isEdge(chosenMove.row, chosenMove.col)),
    bestIsCorner: Boolean(bestMove && isCorner(bestMove.row, bestMove.col)),
    givesCorner: cornersGiven.length > 0,
    cornersGiven,
    bestGivesCorner: Boolean(bestMove && wouldGiveCorner(boardBefore, player, bestMove)),
    ownsAdjacentCorner: Boolean(
      chosenMove &&
        getAdjacentCorners(chosenMove.row, chosenMove.col).some(
          (corner) => boardBefore[corner.row][corner.col] === player,
        ),
    ),
    stableGain: chosenMove ? stableGainAfterMove(boardBefore, player, chosenMove) : 0,
  };
}

function generateLocalExplanation(context) {
  if (context.isPass) return describePassPosition(context);

  const sentences = [describeJudgementIntro(context), describeMainFactor(context)];
  const alternative = describeBestAlternative(context);
  if (alternative) sentences.push(alternative);
  const tip = getLearningTip(context);
  if (tip) sentences.push(tip);

  return sentences.filter(Boolean).join("");
}

function describePassPosition(context) {
  const base = `打てる場所がなかったため、${context.playerName}はパスです。`;
  if (context.phase === "endgame") {
    return `${base}終盤のパスは相手に連続で打たれる分、石数勝負で不利になりやすい形です。`;
  }
  return `${base}合法手が尽きるのは選択肢を失っている合図なので、その前の数手で手を広げられなかったか振り返ってみましょう。`;
}

function describeJudgementIntro(context) {
  const seed = context.moveNumber;

  if (context.isBestChoice) {
    if (context.phase === "endgame") {
      return pickVariant(seed, [
        `${context.chosenLabel}はこの終盤で最善の一手です。`,
        `終盤の大事な場面で、最善手${context.chosenLabel}を選べています。`,
      ]);
    }
    return pickVariant(seed, [
      `この局面では${context.chosenLabel}が最善手です。`,
      `${context.chosenLabel}はAIの第一候補と一致する好手です。`,
      `${context.chosenLabel}は候補の中で最も評価の高い手です。`,
    ]);
  }
  if (context.scoreLoss <= 15) {
    return pickVariant(seed, [
      `${context.chosenLabel}は大きな問題のない手です。AI推奨は${context.bestLabel}でしたが、評価の差はわずかです。`,
      `悪くない選択です。最善は${context.bestLabel}でしたが、${context.chosenLabel}との差は小さめです。`,
    ]);
  }
  if (context.scoreLoss <= 35) {
    return pickVariant(seed, [
      `${context.chosenLabel}はやや疑問の残る手です。AI推奨は${context.bestLabel}でした。`,
      `ここは少しもったいない選択でした。実際の手は${context.chosenLabel}、AIの推奨は${context.bestLabel}です。`,
    ]);
  }
  const endgameNote = context.phase === "endgame" ? "終盤は1手の損がそのまま石数に響くため、" : "";
  return pickVariant(seed, [
    `${context.chosenLabel}は明確な悪手です。${endgameNote}AI推奨の${context.bestLabel}と比べて大きな損が出ています。`,
    `この${context.chosenLabel}は形勢を悪くした手です。${endgameNote}AIは${context.bestLabel}を推しています。`,
  ]);
}

function selectMainFactor(context) {
  const tags = context.reasonTags;
  if (context.chosenIsCorner || tags.includes("corner_taken")) return "corner_taken";
  if (context.givesCorner || tags.includes("corner_given")) return "corner_given";
  if (context.phase === "endgame" && context.scoreLoss >= 16) return "endgame_loss";
  if (context.chosenIsX || tags.includes("x_square")) return "x_square";
  if (context.chosenIsC || tags.includes("c_square")) return "c_square";
  if (tags.includes("opponent_mobility_up") || tags.includes("mobility_down")) return "mobility";
  if (tags.includes("too_many_flips")) return "too_many_flips";
  if (context.stableGain > 0 || tags.includes("stable_discs_gain")) return "stable_discs_gain";
  return "safe";
}

function describeMainFactor(context) {
  const seed = context.moveNumber;

  switch (selectMainFactor(context)) {
    case "corner_taken":
      if (context.scoreLoss >= 16) {
        return `角を確保できた点は悪くありませんが、この局面ではさらに価値の高い手が残っており、取るタイミングとしては損が出ています。`;
      }
      return pickVariant(seed, [
        `角は一度取れば返されない拠点になり、周りの石も順に安定していきます。${context.stableGain > 0 ? `この手で安定石が${context.stableGain}枚増えました。` : ""}`,
        `角の確保は盤面全体の主導権につながる大きなプラスです。`,
      ]);
    case "corner_given":
      return describeCornerRisk(context);
    case "endgame_loss":
      return pickVariant(seed, [
        `残り${context.emptyCount}マスの終盤では、この損がほぼそのまま最終石数の差になって返ってきます。`,
        `終盤は取り返す機会が残っていないため、ここでの評価差は勝敗に直結しやすい損です。`,
      ]);
    case "x_square":
      if (context.ownsAdjacentCorner) {
        return `${context.chosenLabel}は角の斜め隣（Xマス）ですが、隣の角はすでに自分の石なので、通常ほどの危険はありません。`;
      }
      return pickVariant(seed, [
        `${context.chosenLabel}は角の斜め隣（Xマス）で、ここに置くと相手に角を取られるきっかけを与えやすい形です。`,
        `Xマス（角の斜め隣）は、相手が角を狙う足がかりになりやすい危険なマスです。`,
      ]);
    case "c_square":
      if (context.ownsAdjacentCorner) {
        return `${context.chosenLabel}は角の横（Cマス）ですが、隣の角をすでに確保しているため、危険度は下がっています。`;
      }
      return pickVariant(seed, [
        `${context.chosenLabel}は角の横（Cマス）で、角をめぐる攻防で相手に先手を取られやすい位置です。`,
        `Cマス（角の横）は、辺の攻防から角を取られる展開につながりやすいマスです。`,
      ]);
    case "mobility":
      return describeMobilityChange(context);
    case "too_many_flips":
      return `一度に${context.flippedCount}枚返す派手な手ですが、${context.phase === "opening" ? "序盤" : "中盤"}に多く返しすぎると、かえって相手の打てる場所を広げてしまいがちです。`;
    case "stable_discs_gain":
      return `返されることのない安定石を${context.stableGain}枚増やせており、着実なプラスです。`;
    default:
      // 目立つ危険要因がないのに評価損が大きい手は、位置取りの効率の問題として説明します。
      if (context.scoreLoss >= 16) {
        return pickVariant(seed, [
          `目立つ危険マスや角の失点はありませんが、石の並びや位置取りの効率で最善に及ばない手です。`,
          `一見自然な手ですが、AIの評価では盤面の形の面でより得な手が残っていました。`,
        ]);
      }
      return describeSafeMove(context);
  }
}

function describeCornerRisk(context) {
  const cornerText = context.cornersGiven.length > 0 ? `角（${context.cornersGiven.join("・")}）` : "角";
  // 最善級・軽微な手で角が絡む場合は、避けにくい変化なので警告ではなく注意喚起にとどめます。
  if (context.scoreLoss <= 15) {
    return `この手の後、相手が${cornerText}に打てるようになる点は要注意ですが、この局面では他の候補でも避けにくく、評価上は許容範囲です。`;
  }
  return pickVariant(context.moveNumber, [
    `この手の後、相手は${cornerText}に打てるようになります。角を取られると周りの石がまとめて安定し、取り返すのが難しくなります。`,
    `${cornerText}への道を相手に開けてしまった点が問題です。角を渡すと、そこを起点に辺まで固められやすくなります。`,
  ]);
}

function describeMobilityChange(context) {
  const mobility = context.mobility;
  const parts = [];
  if (mobility.opponentLegalMovesAfter > mobility.opponentLegalMovesBefore) {
    parts.push(`相手の打てる場所が${mobility.opponentLegalMovesBefore}手から${mobility.opponentLegalMovesAfter}手に増え`);
  }
  if (mobility.playerLegalMovesAfter < mobility.playerLegalMovesBefore) {
    parts.push(`自分の打てる場所が${mobility.playerLegalMovesBefore}手から${mobility.playerLegalMovesAfter}手に減り`);
  }
  if (parts.length === 0) return describeSafeMove(context);
  // 良い手の場合、合法手数の増減は避けにくい変化なので、警告口調にしないようにします。
  if (context.scoreLoss <= 15) {
    return `この手で${parts.join("、")}ますが、この局面では他の候補も似た傾向で、評価上は許容範囲です。`;
  }
  return `この手で${parts.join("、")}、主導権を相手に渡しやすい形になりました。`;
}

function describeSafeMove(context) {
  const seed = context.moveNumber;
  if (context.phase === "endgame") {
    return pickVariant(seed, [
      `石数の損得を崩さない進行で、残り${context.emptyCount - 1}マスに向けて堅実です。`,
      `終盤の計算上も損のない手で、最終盤の石数勝負に備えられています。`,
    ]);
  }
  const variants = [
    `相手に角を渡す形にならず、自分の打てる場所も${context.playerMovesAfterChosen}手残せています。`,
    `相手の選択肢を${context.opponentMovesAfterChosen}手にとどめつつ、角周辺の危険マスも避けられた手です。`,
  ];
  if (context.phase === "opening") {
    variants.push(`序盤らしく返しすぎを避け、中央寄りで手堅い形を保てています。`);
  }
  return pickVariant(seed, variants);
}

function describeBestAlternative(context) {
  if (context.isBestChoice || context.scoreLoss < 16 || context.bestLabel === "PASS") return "";

  if (context.bestIsCorner) {
    return `代わりにAI推奨の${context.bestLabel}なら、自分から角を確保できました。`;
  }
  if (context.givesCorner && !context.bestGivesCorner) {
    return `AI推奨の${context.bestLabel}なら、角を渡さずに局面を保てました。`;
  }
  if (context.opponentMovesAfterBest < context.opponentMovesAfterChosen) {
    return `AI推奨の${context.bestLabel}なら相手の選択肢を${context.opponentMovesAfterBest}手に絞れていました（実際の手では${context.opponentMovesAfterChosen}手）。`;
  }
  if (context.phase === "endgame") {
    return `${context.bestLabel}のほうが、最終的に残せる石数で勝る計算です。`;
  }
  return `AI推奨の${context.bestLabel}は、危険マスを避けつつ自分の選択肢を保てるバランスの良い手でした。`;
}

function getLearningTip(context) {
  if (context.scoreLoss < 16) return "";
  const seed = context.moveNumber;

  switch (selectMainFactor(context)) {
    case "corner_given":
      return pickVariant(seed, [
        `次からは打つ前に「この手で相手が角に届くようにならないか」をひと呼吸置いて確認しましょう。`,
        `角を渡す手は一気に形勢が傾きます。次からは角への通り道を開けていないか、先に見る習慣をつけましょう。`,
      ]);
    case "x_square":
    case "c_square":
      return pickVariant(seed, [
        `次からは角の周り（X・Cマス）は、角を確保できる見通しが立つまで我慢することを意識しましょう。`,
        `X・Cマスは角を失うきっかけになりがちです。次からは他に安全な手がないか先に探してみましょう。`,
      ]);
    case "mobility":
    case "too_many_flips":
      return pickVariant(seed, [
        `次からは返す枚数よりも「打った後にお互い何手打てるか」を数える意識を持ちましょう。`,
        `序盤・中盤は石数より選択肢の多さが力になります。次からは相手の打てる場所を増やさない手を優先しましょう。`,
      ]);
    case "endgame_loss":
      return pickVariant(seed, [
        `終盤は残りのマスを数えて、1手ごとの石数の増減を確かめてから打ちましょう。`,
        `次からは終盤に入ったら、候補手ごとの最終石数の差を意識して選びましょう。`,
      ]);
    default:
      return `次からは角・危険マス・お互いの打てる場所の3点を、順に確認してから打ちましょう。`;
  }
}

// ===== 対局全体の総評生成 =====
// 解析済みの手（analysisHistory）から悪手・角の献上・モビリティ悪化・終盤損を集計し、
// 「どこで勝敗が分かれたか」を選び出して文章化します。表示は DOM API + textContent のみ。

function renderGameSummary() {
  const container = elements.summaryContent;
  container.textContent = "";
  container.classList.add("muted");

  if (mode !== "review") {
    container.textContent = "検討モードで全体解析が終わると、1局の総評を表示します。";
    return;
  }
  if (isReviewBatchAnalyzing) {
    container.textContent = "総評を作成中...";
    return;
  }
  if (moveHistory.length === 0) {
    container.textContent = "まだ棋譜がありません。";
    return;
  }

  const context = buildGameSummaryContext();
  if (context.moves.length === 0) {
    container.textContent = "採点対象の手がないため、総評を表示できません。";
    return;
  }

  container.classList.remove("muted");
  generateGameSummarySections(context).forEach((section) => {
    const block = document.createElement("div");
    block.className = section.heading ? "summary-section" : "summary-section summary-note";
    if (section.heading) {
      const heading = document.createElement("h3");
      heading.textContent = section.heading;
      block.appendChild(heading);
    }
    const body = document.createElement("p");
    body.textContent = section.text;
    block.appendChild(body);
    if (section.jumpMoveNumber) {
      const jump = document.createElement("button");
      jump.type = "button";
      jump.className = "summary-jump";
      jump.textContent = `${section.jumpMoveNumber}手目を盤面で見る`;
      jump.addEventListener("click", () => goToReviewIndex(section.jumpMoveNumber - 1));
      block.appendChild(jump);
    }
    container.appendChild(block);
  });
}

function buildGameSummaryContext() {
  const lastRecord = moveHistory[moveHistory.length - 1];
  const finalCounts = { black: lastRecord.blackCount, white: lastRecord.whiteCount };
  const isCpuGame = moveHistory.some((record) => record.actor === "cpu");
  const humanSide = isCpuGame ? (moveHistory.find((record) => record.actor === "human")?.player ?? BLACK) : null;

  const moves = moveHistory
    .map((record) => ({ record, saved: getAnalysisForMove(record.moveNumber) }))
    .filter((item) => item.saved && !item.saved.skipped && item.saved.evaluatedMove)
    .map(({ record, saved }) => {
      const evaluated = saved.evaluatedMove;
      const mobility = record.move ? countMobilityAfterMove(record.boardBefore, record.player, record.move) : null;
      return {
        moveNumber: record.moveNumber,
        player: record.player,
        label: evaluated.chosenLabel,
        bestLabel: evaluated.bestLabel,
        scoreLoss: evaluated.scoreLoss,
        tags: evaluated.reasonTags,
        phase: getPhase(record.boardBefore),
        isPass: record.isPass,
        opponentMobilityGain: mobility ? mobility.opponentLegalMovesAfter - mobility.opponentLegalMovesBefore : 0,
        playerMobilityDrop: mobility ? mobility.playerLegalMovesBefore - mobility.playerLegalMovesAfter : 0,
      };
    });

  const cornersByPlayer = { [BLACK]: 0, [WHITE]: 0 };
  moveHistory.forEach((record) => {
    if (record.move && isCorner(record.move.row, record.move.col)) cornersByPlayer[record.player] += 1;
  });

  return {
    finalCounts,
    finished: gameOver,
    isCpuGame,
    humanSide,
    cpuSide: humanSide ? getOpponent(humanSide) : null,
    winner: finalCounts.black === finalCounts.white ? null : finalCounts.black > finalCounts.white ? BLACK : WHITE,
    moves,
    cornersByPlayer,
    expectedCount: getReviewableMoveIndexes().length,
  };
}

function generateGameSummarySections(context) {
  const sections = [];
  const simple = context.expectedCount < 10;

  if (context.moves.length < context.expectedCount) {
    sections.push({ text: "未解析の手があるため、分かる範囲での総評です。" });
  }
  if (simple) {
    sections.push({ text: "手数が少ないため、総評は簡易表示です。" });
  }

  sections.push({ heading: "対局結果", text: getFinalResultSummary(context) });

  if (!simple) {
    sections.push({ heading: "全体の流れ", text: describeGameFlow(context) });
  }

  const focusSide = getSummaryFocusSide(context);
  const turningPoint = focusSide ? findTurningPoint(context, focusSide) : null;
  if (turningPoint) {
    const isWinnerSide = context.finished && context.winner === turningPoint.player;
    sections.push({
      heading: isWinnerSide ? "危なかった手" : "勝敗を分けた手",
      text: describeTurningPoint(context, turningPoint),
      jumpMoveNumber: turningPoint.moveNumber,
    });
  }

  if (!simple) {
    const winningFactor = describeWinningFactor(context);
    if (winningFactor) sections.push({ heading: "勝因", text: winningFactor });
  }

  if (focusSide) {
    sections.push({ heading: "次回の改善ポイント", text: describeImprovementAdvice(context, focusSide) });
  }

  return sections;
}

function summarySideName(context, player) {
  if (!context.isCpuGame) return playerLabel(player);
  return player === context.humanSide ? "あなた" : "CPU";
}

function getSummaryFocusSide(context) {
  if (context.isCpuGame) return context.humanSide;
  if (context.finished && context.winner) return getOpponent(context.winner);
  // 引き分け・対局途中は、評価損の合計が大きい側を振り返り対象にします。
  const lossBySide = { [BLACK]: 0, [WHITE]: 0 };
  context.moves.forEach((move) => {
    lossBySide[move.player] += move.scoreLoss;
  });
  return lossBySide[BLACK] >= lossBySide[WHITE] ? BLACK : WHITE;
}

function getFinalResultSummary(context) {
  const { black, white } = context.finalCounts;
  const prefix = context.finished ? "" : "対局はまだ途中です。ここまでの局面では、";

  if (context.isCpuGame) {
    const humanCount = context.humanSide === BLACK ? black : white;
    const cpuCount = context.humanSide === BLACK ? white : black;
    let outcome;
    if (!context.finished) {
      outcome = humanCount === cpuCount ? "石数は互角です。" : humanCount > cpuCount ? "あなたが石数でリードしています。" : "CPUが石数でリードしています。";
    } else if (context.winner === null) {
      outcome = "引き分けです。";
    } else {
      outcome = context.winner === context.humanSide ? "あなたの勝ちです。" : "CPUの勝ちです。";
    }
    return `${prefix}${playerLabel(context.humanSide)}（あなた）は${humanCount}石、${playerLabel(context.cpuSide)}（CPU）は${cpuCount}石。${outcome}`;
  }

  let outcome;
  if (!context.finished) {
    outcome = black === white ? "石数は互角です。" : `${black > white ? "黒" : "白"}がリードしています。`;
  } else {
    outcome = context.winner === null ? "引き分けです。" : `${playerLabel(context.winner)}の勝ちです。`;
  }
  return `${prefix}黒 ${black} - 白 ${white}。${outcome}`;
}

function describeGameFlow(context) {
  const sentences = [];
  const phases = [
    ["opening", "序盤"],
    ["middle", "中盤"],
    ["endgame", "終盤"],
  ];

  phases.forEach(([phase, phaseName]) => {
    const phaseMoves = context.moves.filter((move) => move.phase === phase);
    if (phaseMoves.length === 0) return;
    const blunders = phaseMoves.filter((move) => move.scoreLoss >= 36);
    if (blunders.length === 0) {
      sentences.push(
        context.isCpuGame
          ? `${phaseName}のあなたは大きなミスなく打てていました。`
          : `${phaseName}は互いに大きなミスのない進行でした。`,
      );
      return;
    }
    const bySide = {};
    blunders.forEach((move) => {
      bySide[move.player] = (bySide[move.player] || 0) + 1;
    });
    const parts = Object.entries(bySide).map(([player, count]) => `${summarySideName(context, player)}に${count}回`);
    sentences.push(`${phaseName}は${parts.join("、")}の悪手が出て形勢が動きました。`);
  });

  const cornerParts = [];
  if (context.cornersByPlayer[BLACK] > 0) cornerParts.push(`${summarySideName(context, BLACK)}が${context.cornersByPlayer[BLACK]}つ`);
  if (context.cornersByPlayer[WHITE] > 0) cornerParts.push(`${summarySideName(context, WHITE)}が${context.cornersByPlayer[WHITE]}つ`);
  if (cornerParts.length > 0) {
    sentences.push(`角は${cornerParts.join("、")}確保しました。`);
  }

  return sentences.join("");
}

function findTurningPoint(context, side) {
  const candidates = context.moves.filter((move) => move.player === side && !move.isPass && move.scoreLoss >= 16);
  if (candidates.length === 0) return null;

  // 最大 scoreLoss だけでなく、角の献上・危険マス・モビリティ悪化・終盤の損に重みを付けて選びます。
  const weight = (move) =>
    move.scoreLoss +
    (move.tags.includes("corner_given") ? 80 : 0) +
    (move.tags.includes("x_square") || move.tags.includes("c_square") ? 40 : 0) +
    (move.phase === "endgame" ? 30 : 0) +
    (move.opponentMobilityGain >= 3 ? 20 : 0);

  return candidates.reduce((best, move) => (weight(move) > weight(best) ? move : best));
}

function findBlunderStreak(context, side) {
  const sideMoves = context.moves.filter((move) => move.player === side);
  let best = null;
  let run = [];
  sideMoves.forEach((move) => {
    if (move.scoreLoss >= 36) {
      run.push(move);
      if (run.length >= 2 && (!best || run.length > best.length)) best = [...run];
    } else {
      run = [];
    }
  });
  return best ? { from: best[0].moveNumber, to: best[best.length - 1].moveNumber, count: best.length } : null;
}

function describeTurningPoint(context, turningPoint) {
  const name = summarySideName(context, turningPoint.player);
  const possessive = name === "あなた" ? "あなたの" : `${name}の`;
  const isWinnerSide = context.finished && context.winner === turningPoint.player;

  let cause;
  if (turningPoint.tags.includes("corner_given")) {
    cause = "この手で相手に角を取るチャンスを与え、以降は相手が角と辺を固めやすい流れになりました";
  } else if (turningPoint.tags.includes("x_square") || turningPoint.tags.includes("c_square")) {
    cause = "角の危険地帯（X・Cマス）に踏み込み、角をめぐる攻防で主導権を失うきっかけになりました";
  } else if (turningPoint.phase === "endgame") {
    cause = "終盤の石数計算で大きく損をし、その差を取り返す手が残っていませんでした";
  } else if (turningPoint.opponentMobilityGain >= 3) {
    cause = `相手の打てる場所を一気に${turningPoint.opponentMobilityGain}手増やし、主導権を渡す形になりました`;
  } else {
    cause = `AI推奨の${turningPoint.bestLabel}との評価差が最も大きかった手です`;
  }

  const intro = isWinnerSide
    ? `勝ちはしたものの、一番危なかったのは${turningPoint.moveNumber}手目の${possessive}${turningPoint.label}です。`
    : `流れが大きく傾いたのは${turningPoint.moveNumber}手目の${possessive}${turningPoint.label}です。`;
  let text = `${intro}${cause}。`;

  const streak = findBlunderStreak(context, turningPoint.player);
  if (!isWinnerSide && streak && streak.to !== streak.from) {
    text += `また、${streak.from}手目から${streak.to}手目にかけて悪手が続いた区間も形勢に響いています。`;
  }
  return text;
}

function describeWinningFactor(context) {
  if (!context.finished || !context.winner) return "";
  // CPUが勝った場合、CPUの手は採点対象外なので勝因は語らず、人間側の振り返りに任せます。
  if (context.isCpuGame && context.winner !== context.humanSide) return "";

  const winner = context.winner;
  const winnerMoves = context.moves.filter((move) => move.player === winner);
  if (winnerMoves.length === 0) return "";

  const factors = [];
  if (context.cornersByPlayer[winner] > 0) {
    factors.push(`角を${context.cornersByPlayer[winner]}つ確保して返されない拠点を築いたこと`);
  }
  const blunderCount = winnerMoves.filter((move) => move.scoreLoss >= 36).length;
  if (blunderCount === 0) {
    factors.push("大きな悪手を打たずに崩れなかったこと");
  }
  const mobilityGainTotal = winnerMoves.reduce((sum, move) => sum + move.opponentMobilityGain, 0);
  if (winnerMoves.length > 0 && mobilityGainTotal / winnerMoves.length <= 0) {
    factors.push("相手の打てる場所を増やさない手を選び続けたこと");
  }
  const loser = getOpponent(winner);
  const loserBlunders = context.moves.filter((move) => move.player === loser && move.scoreLoss >= 36).length;
  if (!context.isCpuGame && loserBlunders >= 2 && factors.length < 2) {
    factors.push(`${summarySideName(context, loser)}のミスを確実に活かしたこと`);
  }

  if (factors.length === 0) return "";
  const name = summarySideName(context, winner);
  return `${name}の勝因は、${factors.slice(0, 2).join("と、")}です。`;
}

function describeImprovementAdvice(context, side) {
  const name = summarySideName(context, side);
  const riskyMoves = context.moves.filter((move) => move.player === side && move.scoreLoss >= 16);

  if (riskyMoves.length === 0) {
    return `${name}に大きな改善点は見当たりません。角とお互いの選択肢を意識した、この打ち回しを続けましょう。`;
  }

  const categoryCounts = {
    corner: riskyMoves.filter((move) => move.tags.includes("corner_given")).length,
    xc: riskyMoves.filter((move) => move.tags.includes("x_square") || move.tags.includes("c_square")).length,
    mobility: riskyMoves.filter(
      (move) =>
        move.tags.includes("opponent_mobility_up") ||
        move.tags.includes("mobility_down") ||
        move.tags.includes("too_many_flips"),
    ).length,
    endgame: riskyMoves.filter((move) => move.phase === "endgame").length,
  };
  const adviceTexts = {
    corner: "角の周りに打つ前に「この手で相手が角へ届かないか」を確認すること",
    xc: "X・Cマスには、角を取れる見通しが立つまで打たないこと",
    mobility: "返す枚数よりも、打った後に自分の選択肢が残るかを優先すること",
    endgame: "終盤は残りのマスを数えて、1手ごとの石数の増減を確かめること",
  };

  const ranked = Object.entries(categoryCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([category]) => adviceTexts[category]);

  if (ranked.length === 0) {
    return `${name}が次回意識したいのは、角・危険マス・お互いの打てる場所の3点を順に確認してから打つことです。`;
  }
  return `${name}が次回意識したいのは、${ranked.join("と、")}です。`;
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
  if (!EXPLAIN_API_URL) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(EXPLAIN_API_URL, {
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
    explanation: generateLocalExplanation(buildExplanationContext(moveRecord, evaluatedMove, analysis)),
    source: "local",
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

async function importGameJson(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".json")) {
    showImportExportMessage("拡張子が .json のファイルを選んでください。", "error");
    alert("拡張子が .json のファイルを選んでください。");
    return;
  }
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    showImportExportMessage("JSONファイルが大きすぎます。1MB以下にしてください。", "error");
    alert("JSONファイルが大きすぎます。1MB以下にしてください。");
    return;
  }

  let parsedData;
  try {
    parsedData = JSON.parse(await file.text());
  } catch {
    showImportExportMessage("JSONの形式が壊れています。", "error");
    alert("JSONの形式が壊れています");
    return;
  }

  const validation = validateImportedGameData(parsedData);
  if (!validation.valid) {
    showImportExportMessage(validation.message, "error");
    alert(validation.message);
    return;
  }

  const normalizedData = normalizeGameData(parsedData);
  const result = applyImportedMoves(normalizedData);
  if (!result.valid) {
    showImportExportMessage(result.message, "error");
    alert(result.message);
    return;
  }

  currentGameTitle = normalizedData.title;
  showImportExportMessage(`JSONを読み込みました: ${currentGameTitle}`, "success");
  if (moveHistory.length > 0) {
    enterReviewMode();
  }
}

function exportGameJson() {
  const moves = moveHistory
    .filter((record) => !record.isPass && record.move)
    .map((record) => record.moveLabel.toLowerCase());

  if (moves.length === 0) {
    showImportExportMessage("書き出せる棋譜がありません。", "error");
    return;
  }

  const counts = countDiscs(board);
  const data = {
    version: 1,
    app: "Reversi_Consider",
    title: currentGameTitle || "棋譜",
    createdAt: new Date().toISOString(),
    moves,
    gameMode,
    humanPlayer,
    cpuPlayer,
    result: gameOver ? getResultText(counts) : null,
    moveRecords: moveHistory.map((record) => ({
      moveNumber: record.moveNumber,
      player: record.player,
      actor: record.actor,
      move: record.moveLabel.toLowerCase(),
      isPass: record.isPass,
      blackCount: record.blackCount,
      whiteCount: record.whiteCount,
    })),
    analysisHistory: analysisHistory
      .filter((entry) => entry.evaluatedMove)
      .map((entry) => ({
        moveNumber: entry.moveNumber,
        chosenLabel: entry.evaluatedMove.chosenLabel,
        bestLabel: entry.evaluatedMove.bestLabel,
        scoreLoss: entry.evaluatedMove.scoreLoss,
        accuracy: entry.evaluatedMove.accuracy,
        judgement: entry.evaluatedMove.judgement,
        reasonTags: entry.evaluatedMove.reasonTags,
        explanationSource: entry.explanationSource,
      })),
  };

  downloadJson(data, `reversi-record-${formatTimestampForFilename(new Date())}.json`);
  showImportExportMessage("JSONを書き出しました。", "success");
}

function validateImportedGameData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, message: "JSONの一番外側はオブジェクトにしてください。" };
  }
  if (!Object.prototype.hasOwnProperty.call(data, "moves")) {
    return { valid: false, message: "moves 配列が見つかりません。" };
  }
  if (!Array.isArray(data.moves)) {
    return { valid: false, message: "moves は配列にしてください。" };
  }
  if (data.moves.length < 1 || data.moves.length > 60) {
    return { valid: false, message: "moves の手数は1以上60以下にしてください。" };
  }

  const normalizedMoves = [];
  for (let index = 0; index < data.moves.length; index += 1) {
    const move = data.moves[index];
    const moveNumber = index + 1;
    if (typeof move !== "string") {
      return { valid: false, message: `${moveNumber}手目は文字列にしてください。` };
    }
    const normalizedMove = move.trim().toLowerCase();
    if (!/^[a-h][1-8]$/.test(normalizedMove)) {
      return { valid: false, message: `${moveNumber}手目の形式が不正です。` };
    }
    normalizedMoves.push(normalizedMove);
  }

  const legality = validateMovesAreLegal(normalizedMoves);
  if (!legality.valid) return legality;

  return { valid: true, message: "" };
}

function normalizeGameData(data) {
  const rawTitle = typeof data.title === "string" ? data.title : "棋譜";
  const title = rawTitle.trim().slice(0, 50) || "棋譜";
  const importedGameMode = data.gameMode === "cpu" ? "cpu" : "human";
  const importedHumanPlayer = data.humanPlayer === WHITE ? WHITE : BLACK;
  const importedCpuPlayer = getOpponent(importedHumanPlayer);
  return {
    title,
    moves: data.moves.map((move) => move.trim().toLowerCase()),
    gameMode: importedGameMode,
    humanPlayer: importedGameMode === "cpu" ? importedHumanPlayer : BLACK,
    cpuPlayer: importedGameMode === "cpu" ? importedCpuPlayer : WHITE,
  };
}

function validateMovesAreLegal(moves) {
  let testBoard = createInitialBoard();
  let testPlayer = BLACK;

  for (let index = 0; index < moves.length; index += 1) {
    const moveNumber = index + 1;
    const move = labelToMove(moves[index]);

    if (!hasAnyLegalMove(testBoard, testPlayer)) {
      const opponent = getOpponent(testPlayer);
      if (hasAnyLegalMove(testBoard, opponent)) {
        testPlayer = opponent;
      } else {
        return { valid: false, message: `${moveNumber}手目以降は終局後の手です。` };
      }
    }

    if (!isValidMove(testBoard, move.row, move.col, testPlayer)) {
      return { valid: false, message: `${moveNumber}手目 ${moves[index]} はこの局面では置けません。` };
    }

    testBoard = applyMove(testBoard, move.row, move.col, testPlayer);
    const nextPlayer = getOpponent(testPlayer);
    testPlayer = hasAnyLegalMove(testBoard, nextPlayer) || !hasAnyLegalMove(testBoard, testPlayer) ? nextPlayer : testPlayer;
  }

  return { valid: true, message: "" };
}

function applyImportedMoves(gameData) {
  clearCpuThinking();
  const moves = gameData.moves;
  gameMode = gameData.gameMode;
  humanPlayer = gameData.humanPlayer;
  cpuPlayer = gameData.cpuPlayer;
  board = createInitialBoard();
  currentPlayer = BLACK;
  gameOver = false;
  mode = "play";
  reviewIndex = 0;
  sideSelectionPending = false;
  moveHistory = [];
  analysisHistory = [];
  analyzingMoveNumbers = new Set();

  for (let index = 0; index < moves.length; index += 1) {
    const moveNumber = index + 1;
    const move = labelToMove(moves[index]);
    if (!isValidMove(board, move.row, move.col, currentPlayer)) {
      return { valid: false, message: `${moveNumber}手目 ${moves[index]} はこの局面では置けません。` };
    }
    playMove(move.row, move.col, currentPlayer);
    switchTurn();
    checkGameOver();
    if (gameOver && index < moves.length - 1) {
      return { valid: false, message: `${moveNumber + 1}手目以降は終局後の手です。` };
    }
  }

  renderAll();
  return { valid: true, message: "" };
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showImportExportMessage(message, type = "success") {
  elements.importExportMessage.textContent = message;
  elements.importExportMessage.classList.remove("success", "error");
  elements.importExportMessage.classList.add(type);
}

function labelToMove(label) {
  return {
    row: Number(label[1]) - 1,
    col: FILE_LABELS.indexOf(label[0].toUpperCase()),
  };
}

function formatTimestampForFilename(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

elements.resetButton.addEventListener("click", resetGame);
elements.humanModeButton.addEventListener("click", () => setGameMode("human"));
elements.cpuModeButton.addEventListener("click", () => setGameMode("cpu"));
elements.chooseBlackButton.addEventListener("click", () => chooseHumanSide(BLACK));
elements.chooseWhiteButton.addEventListener("click", () => chooseHumanSide(WHITE));
elements.jsonExportButton.addEventListener("click", exportGameJson);
elements.jsonImportInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  importGameJson(file).finally(() => {
    event.target.value = "";
  });
});
elements.reviewButton.addEventListener("click", enterReviewMode);
elements.exitReviewButton.addEventListener("click", exitReviewMode);
elements.firstButton.addEventListener("click", goToFirstMove);
elements.prevButton.addEventListener("click", goToPreviousMove);
elements.nextButton.addEventListener("click", goToNextMove);
elements.lastButton.addEventListener("click", goToLastMove);
elements.nextBranchButton.addEventListener("click", goToNextBranch);
elements.cpuLevelSelect.addEventListener("change", (event) => {
  setCpuLevel(event.target.value);
});
elements.depthSelect.addEventListener("change", (event) => {
  searchDepth = Number(event.target.value);
  analysisHistory = [];
  if (mode === "review") {
    setReviewAnalysisLoading(true);
    renderReviewPosition();
    analyzeAllMoves();
  }
});

// 検討モードのキーボード操作（← → で前後、Home/End で先頭・末尾）
document.addEventListener("keydown", (event) => {
  if (mode !== "review") return;
  const target = event.target;
  if (target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goToPreviousMove();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    goToNextMove();
  } else if (event.key === "Home") {
    event.preventDefault();
    goToFirstMove();
  } else if (event.key === "End") {
    event.preventDefault();
    goToLastMove();
  }
});

initGame();
