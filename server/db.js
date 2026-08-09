import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'database.json');

const defaultDb = {
  players: [
    { id: '1', name: 'Alice', symbol: '❌', color: '#ff4b4b', wins: 0, losses: 0, draws: 0 },
    { id: '2', name: 'Bob', symbol: '⭕', color: '#4b7bff', wins: 0, losses: 0, draws: 0 }
  ],
  games: []
};

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
      return defaultDb;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading DB:', error);
    return defaultDb;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing DB:', error);
  }
}

export const db = {
  getPlayers() {
    const data = readDb();
    return data.players || [];
  },

  addPlayer(name, symbol, color) {
    const data = readDb();
    
    // Check if name or symbol already exists
    const duplicateName = data.players.find(p => p.name.toLowerCase() === name.toLowerCase());
    const duplicateSymbol = data.players.find(p => p.symbol === symbol);
    
    if (duplicateName) throw new Error('A player with this name already exists.');
    if (duplicateSymbol) throw new Error('This symbol is already taken.');

    const newPlayer = {
      id: Date.now().toString(),
      name,
      symbol,
      color,
      wins: 0,
      losses: 0,
      draws: 0
    };

    data.players.push(newPlayer);
    writeDb(data);
    return newPlayer;
  },

  addGame(winnerId, playerIds, isDraw, boardSize, winCondition) {
    const data = readDb();
    const game = {
      id: Date.now().toString(),
      winnerId, // null if draw
      playerIds,
      isDraw,
      boardSize,
      winCondition,
      date: new Date().toISOString()
    };

    data.games.push(game);

    // Update player stats
    data.players = data.players.map(player => {
      if (playerIds.includes(player.id)) {
        if (isDraw) {
          player.draws += 1;
        } else if (player.id === winnerId) {
          player.wins += 1;
        } else {
          player.losses += 1;
        }
      }
      return player;
    });

    writeDb(data);
    return game;
  },

  getGames() {
    const data = readDb();
    return data.games || [];
  },

  getLeaderboard() {
    const players = this.getPlayers();
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
};
