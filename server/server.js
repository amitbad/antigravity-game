import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
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
    const { winnerId, playerIds, isDraw, boardSize, winCondition } = req.body;
    if (!playerIds || !Array.isArray(playerIds) || playerIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 players are required for a game.' });
    }
    if (boardSize === undefined || winCondition === undefined) {
      return res.status(400).json({ error: 'Board size and win condition are required.' });
    }
    const game = db.addGame(winnerId, playerIds, isDraw, boardSize, winCondition);
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

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
