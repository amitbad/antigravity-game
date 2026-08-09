import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'database.db');

// Initialize database
const dbConn = new Database(DB_PATH);

// Enable foreign keys
dbConn.pragma('foreign_keys = ON');

// Initialize schema
dbConn.exec(`
  CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    color TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    winner_id TEXT,
    is_draw INTEGER DEFAULT 0,
    board_size INTEGER NOT NULL,
    win_condition INTEGER NOT NULL,
    move_count INTEGER DEFAULT 0,
    moves TEXT,
    date TEXT NOT NULL,
    FOREIGN KEY(winner_id) REFERENCES players(id)
  );

  CREATE TABLE IF NOT EXISTS game_players (
    game_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    PRIMARY KEY (game_id, player_id),
    FOREIGN KEY(game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY(player_id) REFERENCES players(id)
  );
`);

// Insert default players if none exist
const stmtCount = dbConn.prepare('SELECT COUNT(*) as count FROM players');
const { count } = stmtCount.get();
if (count === 0) {
  const insertPlayer = dbConn.prepare(
    'INSERT INTO players (id, name, symbol, color, wins, losses, draws) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  insertPlayer.run('1', 'Alice', '❌', '#ff4b4b', 0, 0, 0);
  insertPlayer.run('2', 'Bob', '⭕', '#4b7bff', 0, 0, 0);
}

// Queries implementation
export function getPlayers() {
  return dbConn.prepare('SELECT * FROM players').all();
}

export function addPlayer(name, symbol, color) {
  // Check if name (case-insensitive) or symbol already exists
  const duplicateName = dbConn.prepare('SELECT id FROM players WHERE LOWER(name) = LOWER(?)').get(name);
  if (duplicateName) {
    throw new Error('A player with this name already exists.');
  }

  const duplicateSymbol = dbConn.prepare('SELECT id FROM players WHERE symbol = ?').get(symbol);
  if (duplicateSymbol) {
    throw new Error('This symbol is already taken.');
  }

  const id = Date.now().toString();
  dbConn.prepare('INSERT INTO players (id, name, symbol, color) VALUES (?, ?, ?, ?)').run(id, name, symbol, color);

  return {
    id,
    name,
    symbol,
    color,
    wins: 0,
    losses: 0,
    draws: 0
  };
}

export function addGame(winnerId, playerIds, isDraw, boardSize, winCondition, moveCount = 0, moves = []) {
  const id = Date.now().toString();
  const date = new Date().toISOString();

  // SQLite boolean mapping: isDraw -> 1 or 0
  const isDrawVal = isDraw ? 1 : 0;
  const movesStr = JSON.stringify(moves);

  const insertGame = dbConn.prepare(
    'INSERT INTO games (id, winner_id, is_draw, board_size, win_condition, move_count, moves, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertGamePlayer = dbConn.prepare('INSERT INTO game_players (game_id, player_id) VALUES (?, ?)');

  const updatePlayerStats = dbConn.transaction(() => {
    insertGame.run(id, winnerId, isDrawVal, boardSize, winCondition, moveCount, movesStr, date);
    for (const pId of playerIds) {
      insertGamePlayer.run(id, pId);

      // Update stats
      if (isDraw) {
        dbConn.prepare('UPDATE players SET draws = draws + 1 WHERE id = ?').run(pId);
      } else if (pId === winnerId) {
        dbConn.prepare('UPDATE players SET wins = wins + 1 WHERE id = ?').run(pId);
      } else {
        dbConn.prepare('UPDATE players SET losses = losses + 1 WHERE id = ?').run(pId);
      }
    }
  });

  updatePlayerStats();

  return {
    id,
    winnerId,
    playerIds,
    isDraw,
    boardSize,
    winCondition,
    moveCount,
    moves,
    date
  };
}

export function getGames() {
  const games = dbConn.prepare('SELECT * FROM games').all();
  const gamePlayers = dbConn.prepare('SELECT * FROM game_players').all();

  // Group player IDs by game ID
  const playersByGame = {};
  for (const gp of gamePlayers) {
    if (!playersByGame[gp.game_id]) {
      playersByGame[gp.game_id] = [];
    }
    playersByGame[gp.game_id].push(gp.player_id);
  }

  return games.map(g => {
    let movesParsed = [];
    try {
      movesParsed = g.moves ? JSON.parse(g.moves) : [];
    } catch (e) {
      console.error(e);
    }
    return {
      id: g.id,
      winnerId: g.winner_id,
      playerIds: playersByGame[g.id] || [],
      isDraw: g.is_draw === 1,
      boardSize: g.board_size,
      winCondition: g.win_condition,
      moveCount: g.move_count || 0,
      moves: movesParsed,
      date: g.date
    };
  });
}

export function getLeaderboard() {
  const players = getPlayers();
  return players.map(p => {
    const totalGames = p.wins + p.losses + p.draws;
    const winRate = totalGames > 0 ? Math.round((p.wins / totalGames) * 100) : 0;
    return {
      ...p,
      totalGames,
      winRate
    };
  }).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);
}

export function updatePlayer(id, name, symbol, color) {
  // Check if another player has the same name or symbol
  const duplicateName = dbConn.prepare('SELECT id FROM players WHERE id != ? AND LOWER(name) = LOWER(?)').get(id, name);
  if (duplicateName) {
    throw new Error('A player with this name already exists.');
  }

  const duplicateSymbol = dbConn.prepare('SELECT id FROM players WHERE id != ? AND symbol = ?').get(id, symbol);
  if (duplicateSymbol) {
    throw new Error('This symbol is already taken.');
  }

  dbConn.prepare('UPDATE players SET name = ?, symbol = ?, color = ? WHERE id = ?').run(name, symbol, color, id);
  return dbConn.prepare('SELECT * FROM players WHERE id = ?').get(id);
}

// Export the db object compatible with existing interface
export const db = {
  getPlayers,
  addPlayer,
  updatePlayer,
  addGame,
  getGames,
  getLeaderboard
};
