import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { db } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Get all players
app.get('/api/players', (req, res) => {
  try {
    const players = db.getPlayers();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add player
app.post('/api/players', (req, res) => {
  try {
    const { name, symbol, color } = req.body;
    if (!name || !symbol || !color) {
      return res.status(400).json({ error: 'Name, symbol, and color are required.' });
    }
    const player = db.addPlayer(name, symbol, color);
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update player
app.put('/api/players/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, symbol, color } = req.body;
    if (!name || !symbol || !color) {
      return res.status(400).json({ error: 'Name, symbol, and color are required.' });
    }
    const player = db.updatePlayer(id, name, symbol, color);
    res.json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const leaderboard = db.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record a game
app.post('/api/games', (req, res) => {
  try {
    const { winnerId, playerIds, isDraw, boardSize, winCondition, moveCount, moves } = req.body;
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 players are required for a game.' });
    }
    if (boardSize === undefined || winCondition === undefined) {
      return res.status(400).json({ error: 'Board size and win condition are required.' });
    }
    const game = db.addGame(winnerId, playerIds, isDraw, boardSize, winCondition, moveCount || 0, moves || []);
    res.status(201).json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get game history
app.get('/api/games', (req, res) => {
  try {
    const games = db.getGames();
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Socket.io Multiplayer Room Logic ---

const rooms = new Map(); // roomId -> roomState

function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

function checkWinner(grid, size, target) {
  let winningCells = [];
  const checkLine = (cells) => {
    if (cells.length < target) return false;
    for (let i = 0; i <= cells.length - target; i++) {
      const segment = cells.slice(i, i + target);
      const firstVal = grid[segment[0]];
      if (firstVal && segment.every(idx => grid[idx] === firstVal)) {
        winningCells = segment;
        return true;
      }
    }
    return false;
  };

  // Horizontal
  for (let r = 0; r < size; r++) {
    const rowCells = [];
    for (let c = 0; c < size; c++) rowCells.push(r * size + c);
    if (checkLine(rowCells)) return { won: true, winningCells };
  }

  // Vertical
  for (let c = 0; c < size; c++) {
    const colCells = [];
    for (let r = 0; r < size; r++) colCells.push(r * size + c);
    if (checkLine(colCells)) return { won: true, winningCells };
  }

  // Diagonal
  for (let startCol = 0; startCol <= size - target; startCol++) {
    const diagCells = [];
    let r = 0, c = startCol;
    while (r < size && c < size) {
      diagCells.push(r * size + c);
      r++; c++;
    }
    if (checkLine(diagCells)) return { won: true, winningCells };
  }
  for (let startRow = 1; startRow <= size - target; startRow++) {
    const diagCells = [];
    let r = startRow, c = 0;
    while (r < size && c < size) {
      diagCells.push(r * size + c);
      r++; c++;
    }
    if (checkLine(diagCells)) return { won: true, winningCells };
  }

  // Anti-diagonal
  for (let startCol = target - 1; startCol < size; startCol++) {
    const diagCells = [];
    let r = 0, c = startCol;
    while (r < size && c >= 0) {
      diagCells.push(r * size + c);
      r++; c--;
    }
    if (checkLine(diagCells)) return { won: true, winningCells };
  }
  for (let startRow = 1; startRow <= size - target; startRow++) {
    const diagCells = [];
    let r = startRow, c = size - 1;
    while (r < size && c >= 0) {
      diagCells.push(r * size + c);
      r++; c--;
    }
    if (checkLine(diagCells)) return { won: true, winningCells };
  }

  return { won: false, winningCells: [] };
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Create room
  socket.on('create-room', ({ boardSize, winCondition, player }) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    // Register player to DB if not already exists (simulate auto creation or use incoming data)
    let dbPlayer;
    try {
      dbPlayer = db.addPlayer(player.name, player.symbol, player.color);
    } catch (e) {
      // Find existing
      const existing = db.getPlayers().find(p => p.name.toLowerCase() === player.name.toLowerCase());
      dbPlayer = existing || { id: Date.now().toString(), ...player, wins: 0, losses: 0, draws: 0 };
    }

    const roomState = {
      id: roomId,
      boardSize,
      winCondition,
      board: Array(boardSize * boardSize).fill(null),
      turnIndex: 0,
      players: [dbPlayer],
      winner: null,
      winningCells: [],
      isDraw: false,
      gameSaved: false
    };

    rooms.set(roomId, roomState);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerId = dbPlayer.id;

    socket.emit('room-created', { roomId, roomState });
  });

  // Join room
  socket.on('join-room', ({ roomId, player }) => {
    const roomState = rooms.get(roomId);
    if (!roomState) {
      socket.emit('error', 'Room not found.');
      return;
    }

    if (roomState.players.length >= 2) {
      socket.emit('error', 'Room is full.');
      return;
    }

    // Register player to DB
    let dbPlayer;
    try {
      dbPlayer = db.addPlayer(player.name, player.symbol, player.color);
    } catch (e) {
      const existing = db.getPlayers().find(p => p.name.toLowerCase() === player.name.toLowerCase());
      dbPlayer = existing || { id: Date.now().toString(), ...player, wins: 0, losses: 0, draws: 0 };
    }

    // Resolve symbol conflict
    if (dbPlayer.symbol === roomState.players[0].symbol) {
      const presets = ['🚀', '🦄', '⭐', '🔥', '🎮', '🍕', '🦊', '⚡', '👑', '🍀'];
      const alt = presets.find(p => p !== roomState.players[0].symbol) || '⭕';
      dbPlayer.symbol = alt;
    }

    // Resolve color conflict
    if (dbPlayer.color === roomState.players[0].color) {
      const colors = ['#ff4b4b', '#4b7bff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6'];
      const altColor = colors.find(c => c !== roomState.players[0].color) || '#ff4b4b';
      dbPlayer.color = altColor;
    }

    roomState.players.push(dbPlayer);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerId = dbPlayer.id;

    io.to(roomId).emit('room-joined', { roomState });
  });

  // Make move
  socket.on('make-move', ({ roomId, index }) => {
    const roomState = rooms.get(roomId);
    if (!roomState) return;

    const currentPlayer = roomState.players[roomState.turnIndex];
    // Verify it's this player's turn
    if (socket.playerId !== currentPlayer.id) return;
    if (roomState.board[index] || roomState.winner || roomState.isDraw) return;

    roomState.board[index] = currentPlayer.symbol;

    // Check Win
    const { won, winningCells } = checkWinner(roomState.board, roomState.boardSize, roomState.winCondition);
    if (won) {
      roomState.winner = currentPlayer;
      roomState.winningCells = winningCells;
      if (!roomState.gameSaved) {
        roomState.gameSaved = true;
        try {
          db.addGame(currentPlayer.id, roomState.players.map(p => p.id), false, roomState.boardSize, roomState.winCondition);
        } catch (e) {
          console.error(e);
        }
      }
    } else if (roomState.board.every(cell => cell !== null)) {
      roomState.isDraw = true;
      if (!roomState.gameSaved) {
        roomState.gameSaved = true;
        try {
          db.addGame(null, roomState.players.map(p => p.id), true, roomState.boardSize, roomState.winCondition);
        } catch (e) {
          console.error(e);
        }
      }
    } else {
      roomState.turnIndex = (roomState.turnIndex + 1) % roomState.players.length;
    }

    io.to(roomId).emit('state-update', { roomState });
  });

  // Restart game
  socket.on('restart-game', ({ roomId }) => {
    const roomState = rooms.get(roomId);
    if (!roomState) return;

    roomState.board = Array(roomState.boardSize * roomState.boardSize).fill(null);
    roomState.winner = null;
    roomState.winningCells = [];
    roomState.isDraw = false;
    roomState.gameSaved = false;
    // Swap starting turn for variety
    roomState.turnIndex = Math.floor(Math.random() * roomState.players.length);

    io.to(roomId).emit('state-update', { roomState });
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (socket.roomId) {
      const roomState = rooms.get(socket.roomId);
      if (roomState) {
        // Notify the remaining player
        socket.to(socket.roomId).emit('opponent-disconnected', { playerId: socket.playerId });
        // Clean up room if empty
        const remainingSockets = io.sockets.adapter.rooms.get(socket.roomId);
        if (!remainingSockets || remainingSockets.size === 0) {
          rooms.delete(socket.roomId);
        }
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

