import React, { useState, useEffect } from 'react';

// API Configuration
const API_URL = 'http://localhost:3001/api';

interface Player {
  id: string;
  name: string;
  symbol: string;
  color: string;
  wins: number;
  losses: number;
  draws: number;
}

// interface GameRecord {
//   id: string;
//   winnerId: string | null;
//   playerIds: string[];
//   isDraw: boolean;
//   boardSize: number;
//   winCondition: number;
//   date: string;
// }

const PRESET_EMOJIS = ['❌', '⭕', '🚀', '🦄', '⭐', '🔥', '🎮', '🍕', '🦊', '⚡', '👑', '🍀'];
const PRESET_COLORS = ['#ff4b4b', '#4b7bff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6'];

export default function App() {
  // Views: 'lobby' | 'game' | 'leaderboard'
  const [view, setView] = useState<'lobby' | 'game'>('lobby');

  // Backend States
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  // const [games, setGames] = useState<GameRecord[]>([]);
  // const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Player Form State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSymbol, setNewPlayerSymbol] = useState('🚀');
  const [newPlayerColor, setNewPlayerColor] = useState('#10b981');
  const [formError, setFormError] = useState<string | null>(null);

  // Lobby Configuration State
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState(3);
  const [winCondition, setWinCondition] = useState(3);

  // Active Game State
  const [activePlayers, setActivePlayers] = useState<Player[]>([]);
  const [board, setBoard] = useState<(string | null)[]>([]);
  const [turnIndex, setTurnIndex] = useState(0); // Index in activePlayers
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningCells, setWinningCells] = useState<number[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [gameSaved, setGameSaved] = useState(false);

  // Local History and Replay State
  const [moves, setMoves] = useState<number[]>([]);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [activeReplayGame, setActiveReplayGame] = useState<any | null>(null);
  const [replayStep, setReplayStep] = useState<number>(-1);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);
  const [showHistorySidebar, setShowHistorySidebar] = useState<boolean>(true);

  // Load Initial Server Data
  const fetchData = async () => {
    // setLoading(true);
    setError(null);
    try {
      // Try to load from server. Fallback to local memory if server is down.
      const playersRes = await fetch(`${API_URL}/players`).catch(() => null);
      if (playersRes && playersRes.ok) {
        const playersData = await playersRes.json();
        setAllPlayers(playersData);
        // Pre-select first two players if available
        if (playersData.length >= 2 && selectedPlayerIds.length === 0) {
          setSelectedPlayerIds([playersData[0].id, playersData[1].id]);
        }
      } else {
        // Fallback fallback data
        const localPlayers = [
          { id: '1', name: 'Alice', symbol: '❌', color: '#ff4b4b', wins: 3, losses: 1, draws: 1 },
          { id: '2', name: 'Bob', symbol: '⭕', color: '#4b7bff', wins: 1, losses: 3, draws: 1 }
        ];
        setAllPlayers(localPlayers);
        if (selectedPlayerIds.length === 0) {
          setSelectedPlayerIds(['1', '2']);
        }
        setError('Could not connect to backend server. Running in local fallback mode.');
      }

      const leaderboardRes = await fetch(`${API_URL}/leaderboard`).catch(() => null);
      if (leaderboardRes && leaderboardRes.ok) {
        setLeaderboard(await leaderboardRes.json());
      }

      const gamesRes = await fetch(`${API_URL}/games`).catch(() => null);
      if (gamesRes && gamesRes.ok) {
      // const gamesData = await gamesRes.json();
      // setGames(gamesData);
      }
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred while loading server data.');
    } finally {
      // setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Load local history
    const saved = localStorage.getItem('tictactoe_history');
    if (saved) {
      try {
        setLocalHistory(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay Autoplay handler
  useEffect(() => {
    let intervalId: any;
    if (isPlayingReplay && activeReplayGame) {
      intervalId = setInterval(() => {
        setReplayStep(prev => {
          if (prev < activeReplayGame.moves.length - 1) {
            return prev + 1;
          } else {
            setIsPlayingReplay(false);
            return prev;
          }
        });
      }, 1000);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isPlayingReplay, activeReplayGame]);

  // Update Win Condition Max when Board Size changes
  useEffect(() => {
    if (winCondition > boardSize) {
      setWinCondition(boardSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardSize]);

  // Handle Add Player API
  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!newPlayerName.trim()) {
      setFormError('Player name cannot be empty.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPlayerName.trim(),
          symbol: newPlayerSymbol,
          color: newPlayerColor
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to add player.');
      }

      const addedPlayer = await response.json();
      setAllPlayers(prev => [...prev, addedPlayer]);
      setSelectedPlayerIds(prev => [...prev, addedPlayer.id]);
      setNewPlayerName('');
      setFormError(null);
      // Reload leaderboard
      const leaderboardRes = await fetch(`${API_URL}/leaderboard`).catch(() => null);
      if (leaderboardRes && leaderboardRes.ok) {
        setLeaderboard(await leaderboardRes.json());
      }
    } catch (err: any) {
      // Local fallback in case server is disconnected
      if (err.message && err.message.includes('Failed to fetch')) {
        const newLocalPlayer: Player = {
          id: Date.now().toString(),
          name: newPlayerName.trim(),
          symbol: newPlayerSymbol,
          color: newPlayerColor,
          wins: 0,
          losses: 0,
          draws: 0
        };
        setAllPlayers(prev => [...prev, newLocalPlayer]);
        setSelectedPlayerIds(prev => [...prev, newLocalPlayer.id]);
        setNewPlayerName('');
        setFormError(null);
      } else {
        setFormError(err.message || 'Error occurred.');
      }
    }
  };

  // Toggle player selection for the match
  const handleTogglePlayer = (id: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

  // Initialize Game
  const startNewGame = () => {
    const playersToPlay = allPlayers.filter(p => selectedPlayerIds.includes(p.id));
    if (playersToPlay.length < 2) return;

    setActivePlayers(playersToPlay);
    setBoard(Array(boardSize * boardSize).fill(null));
    setTurnIndex(0);
    setWinner(null);
    setWinningCells([]);
    setIsDraw(false);
    setGameSaved(false);
    setMoves([]);
    setView('game');
  };

  // Check Game Over Winner logic
  const checkWinner = (grid: (string | null)[], size: number, target: number) => {
    const checkLine = (cells: number[]): boolean => {
      if (cells.length < target) return false;
      // Slidings run checks
      for (let i = 0; i <= cells.length - target; i++) {
        const segment = cells.slice(i, i + target);
        const firstVal = grid[segment[0]];
        if (firstVal && segment.every(idx => grid[idx] === firstVal)) {
          setWinningCells(segment);
          return true;
        }
      }
      return false;
    };

    // 1. Horizontal Rows
    for (let r = 0; r < size; r++) {
      const rowCells = [];
      for (let c = 0; c < size; c++) {
        rowCells.push(r * size + c);
      }
      if (checkLine(rowCells)) return true;
    }

    // 2. Vertical Columns
    for (let c = 0; c < size; c++) {
      const colCells = [];
      for (let r = 0; r < size; r++) {
        colCells.push(r * size + c);
      }
      if (checkLine(colCells)) return true;
    }

    // 3. Diagonals (Top-Left to Bottom-Right)
    // Starting points can be anywhere in top row or left column
    for (let startCol = 0; startCol <= size - target; startCol++) {
      const diagCells = [];
      let r = 0, c = startCol;
      while (r < size && c < size) {
        diagCells.push(r * size + c);
        r++; c++;
      }
      if (checkLine(diagCells)) return true;
    }
    for (let startRow = 1; startRow <= size - target; startRow++) {
      const diagCells = [];
      let r = startRow, c = 0;
      while (r < size && c < size) {
        diagCells.push(r * size + c);
        r++; c++;
      }
      if (checkLine(diagCells)) return true;
    }

    // 4. Anti-diagonals (Top-Right to Bottom-Left)
    for (let startCol = target - 1; startCol < size; startCol++) {
      const diagCells = [];
      let r = 0, c = startCol;
      while (r < size && c >= 0) {
        diagCells.push(r * size + c);
        r++; c--;
      }
      if (checkLine(diagCells)) return true;
    }
    for (let startRow = 1; startRow <= size - target; startRow++) {
      const diagCells = [];
      let r = startRow, c = size - 1;
      while (r < size && c >= 0) {
        diagCells.push(r * size + c);
        r++; c--;
      }
      if (checkLine(diagCells)) return true;
    }

    return false;
  };

  // Handle Board Cell Click
  const handleCellClick = (index: number) => {
    if (board[index] || winner || isDraw) return;

    const currentPlayer = activePlayers[turnIndex];
    const newBoard = [...board];
    newBoard[index] = currentPlayer.symbol;
    setBoard(newBoard);

    const newMoves = [...moves, index];
    setMoves(newMoves);

    // Check Win
    if (checkWinner(newBoard, boardSize, winCondition)) {
      setWinner(currentPlayer);
      saveGameResult(currentPlayer.id, false, newMoves);
      return;
    }

    // Check Draw
    if (newBoard.every(cell => cell !== null)) {
      setIsDraw(true);
      saveGameResult(null, true, newMoves);
      return;
    }

    // Next player turn
    setTurnIndex((turnIndex + 1) % activePlayers.length);
  };

  // Save game result to Express API and LocalStorage
  const saveGameResult = async (winnerId: string | null, draw: boolean, finalMoves = moves) => {
    if (gameSaved) return;
    setGameSaved(true);

    const playerIds = activePlayers.map(p => p.id);

    // Save to LocalStorage
    const gameRecord = {
      id: Date.now().toString(),
      winnerId,
      playerIds,
      isDraw: draw,
      boardSize,
      winCondition,
      date: new Date().toISOString(),
      players: activePlayers,
      moves: finalMoves
    };

    const updatedHistory = [gameRecord, ...localHistory];
    setLocalHistory(updatedHistory);
    localStorage.setItem('tictactoe_history', JSON.stringify(updatedHistory));

    try {
      const response = await fetch(`${API_URL}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerId,
          playerIds,
          isDraw: draw,
          boardSize,
          winCondition
        })
      });

      if (response.ok) {
        // Refresh local lists to reflect wins
        const playersRes = await fetch(`${API_URL}/players`).catch(() => null);
        if (playersRes && playersRes.ok) setAllPlayers(await playersRes.json());
        
        const leaderboardRes = await fetch(`${API_URL}/leaderboard`).catch(() => null);
        if (leaderboardRes && leaderboardRes.ok) setLeaderboard(await leaderboardRes.json());

        // const gamesRes = await fetch(`${API_URL}/games`).catch(() => null);
        // if (gamesRes && gamesRes.ok) setGames(await gamesRes.json());
      }
    } catch (err) {
      console.error('Error saving game record:', err);
      // Local updates in fallback mode
      setAllPlayers(prev =>
        prev.map(p => {
          if (playerIds.includes(p.id)) {
            if (draw) {
              p.draws += 1;
            } else if (p.id === winnerId) {
              p.wins += 1;
            } else {
              p.losses += 1;
            }
          }
          return p;
        })
      );
    }
  };

  // const getPlayerDetails = (id: string) => {
  //   return allPlayers.find(p => p.id === id);
  // };

  // Replay helpers
  const handleStartReplay = (game: any) => {
    setActiveReplayGame(game);
    setReplayStep(-1); // Start with empty board
    setIsPlayingReplay(false);
  };

  const getReplayBoardState = () => {
    if (!activeReplayGame) return [];
    const size = activeReplayGame.boardSize;
    const grid = Array(size * size).fill(null);
    const { moves, players } = activeReplayGame;

    for (let i = 0; i <= replayStep; i++) {
      const moveIndex = moves[i];
      const playerIndex = i % players.length;
      grid[moveIndex] = players[playerIndex].symbol;
    }
    return grid;
  };

  const getReplayStepDescription = () => {
    if (!activeReplayGame) return '';
    if (replayStep === -1) return 'Game Start - Empty Board';

    const { moves, players, boardSize } = activeReplayGame;
    const moveIndex = moves[replayStep];
    const playerIndex = replayStep % players.length;
    const player = players[playerIndex];
    
    const row = Math.floor(moveIndex / boardSize) + 1;
    const col = (moveIndex % boardSize) + 1;

    return `${player.name} (${player.symbol}) played cell at row ${row}, col ${col}`;
  };

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear your local game history?')) {
      localStorage.removeItem('tictactoe_history');
      setLocalHistory([]);
    }
  };

  return (
    <div className="fade-in">
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 className="title-gradient" style={{ fontSize: '3rem', margin: '0 0 0.5rem 0' }}>
          Neon Tic-Tac-Toe
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Local multi-player game configuration using Express & React
        </p>
        <div style={{ marginTop: '1.2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button 
            className="btn btn-secondary animate-hover" 
            onClick={() => setShowHistorySidebar(true)}
            style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}
          >
            🕒 Match History ({localHistory.length})
          </button>
        </div>
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            color: '#ef4444',
            padding: '0.6rem',
            marginTop: '1rem',
            fontSize: '0.9rem',
            display: 'inline-block'
          }}>
            ⚠️ {error}
          </div>
        )}
      </header>

      {view === 'lobby' ? (
        <div className="app-container">
          {/* Setup / Lobby controls */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.6rem' }}>🎮 Game Setup</h2>

            {/* Board configs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                  Grid Size ({boardSize}x{boardSize})
                </label>
                <select value={boardSize} onChange={(e) => setBoardSize(Number(e.target.value))}>
                  {[3, 4, 5, 6, 7, 8, 9, 10].map(s => (
                    <option key={s} value={s}>{s} x {s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                  Win Streak Goal
                </label>
                <select value={winCondition} onChange={(e) => setWinCondition(Number(e.target.value))}>
                  {Array.from({ length: boardSize - 2 }, (_, idx) => idx + 3).map(w => (
                    <option key={w} value={w}>{w} in a row</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Players list */}
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
                Select Active Players ({selectedPlayerIds.length} Selected)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.8rem' }}>
                {allPlayers.map(p => {
                  const isSelected = selectedPlayerIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleTogglePlayer(p.id)}
                      style={{
                        padding: '1rem',
                        background: isSelected ? `${p.color}15` : 'rgba(255,255,255,0.02)',
                        border: '1.5px solid',
                        borderColor: isSelected ? p.color : 'rgba(255,255,255,0.08)',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'all 0.2s',
                        boxShadow: isSelected ? `0 0 10px ${p.color}20` : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1.4rem' }}>{p.symbol}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{p.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
                            W:{p.wins} L:{p.losses}
                          </div>
                        </div>
                      </div>
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        border: '1.5px solid rgba(255,255,255,0.3)',
                        background: isSelected ? p.color : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '0.7rem'
                      }}>
                        {isSelected && '✓'}
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedPlayerIds.length < 2 && (
                <div style={{ fontSize: '0.85rem', color: '#f59e0b', marginTop: '0.6rem' }}>
                  ⚠️ Select at least 2 players to start a match.
                </div>
              )}
            </div>

            {/* Launch Game Button */}
            <button
              onClick={startNewGame}
              disabled={selectedPlayerIds.length < 2}
              className="btn"
              style={{ width: '100%', padding: '1.1rem', fontSize: '1.1rem' }}
            >
              Start Tic Tac Toe Match 🚀
            </button>
          </div>

          {/* Sidebar: Add User Form + Leaderboard */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Add User */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                👤 Add Player
              </h2>
              <form onSubmit={handleAddPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                    Player Name
                  </label>
                  <input
                    type="text"
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Enter name (e.g. Charlie)"
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                    Select Symbol
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
                    {PRESET_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setNewPlayerSymbol(emoji)}
                        style={{
                          background: newPlayerSymbol === emoji ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                          border: '1.5px solid',
                          borderColor: newPlayerSymbol === emoji ? '#3b82f6' : 'rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          padding: '0.5rem',
                          fontSize: '1.3rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s'
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                    Select Color
                  </label>
                  <div className="color-picker">
                    {PRESET_COLORS.map(color => (
                      <div
                        key={color}
                        onClick={() => setNewPlayerColor(color)}
                        className={`color-dot ${newPlayerColor === color ? 'selected' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                {formError && (
                  <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>
                    ❌ {formError}
                  </div>
                )}

                <button type="submit" className="btn btn-secondary">
                  Add to Active Directory
                </button>
              </form>
            </div>

            {/* Mini Leaderboard */}
            <div className="glass-panel" style={{ padding: '2rem' }}>
              <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.5rem' }}>🏆 Global Ranks</h2>
              {leaderboard.length === 0 ? (
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>No games played yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: '250px', overflowY: 'auto' }}>
                  {leaderboard.map((p, idx) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.8rem',
                        background: 'rgba(255,255,255,0.02)',
                        borderRadius: '12px',
                        borderLeft: `4px solid ${p.color}`
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, width: '20px', color: idx === 0 ? '#f59e0b' : idx === 1 ? '#94a3b8' : 'inherit' }}>
                          #{idx + 1}
                        </span>
                        <span>{p.symbol}</span>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)' }}>
                        <strong>{p.wins}</strong> wins ({p.wins + p.losses + p.draws} games)
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Active Game Arena */
        <div className="glass-panel fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <button onClick={() => setView('lobby')} className="btn btn-secondary">
              ← Lobby Setup
            </button>
            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}>
              Target: <strong>{winCondition} in a row</strong>
            </div>
          </div>

          {/* Turn Indicator / Game status */}
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            {!winner && !isDraw ? (
              <div
                className="player-badge active"
                style={{
                  display: 'inline-flex',
                  '--player-color': activePlayers[turnIndex].color,
                  '--player-color-glow': `${activePlayers[turnIndex].color}25`
                } as React.CSSProperties}
              >
                <span style={{ fontSize: '2rem' }}>{activePlayers[turnIndex].symbol}</span>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Current Turn</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: activePlayers[turnIndex].color }}>
                    {activePlayers[turnIndex].name}
                  </div>
                </div>
              </div>
            ) : winner ? (
              <div className="fade-in" style={{ display: 'inline-block' }}>
                <div
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 800,
                    color: winner.color,
                    textShadow: `0 0 20px ${winner.color}40`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    marginBottom: '1rem'
                  }}
                >
                  🎉 {winner.symbol} {winner.name} Wins!
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={startNewGame} className="btn">
                    Play Again
                  </button>
                  <button onClick={() => setView('lobby')} className="btn btn-secondary">
                    Back to Lobby
                  </button>
                </div>
              </div>
            ) : (
              <div className="fade-in">
                <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#f59e0b', marginBottom: '1rem' }}>
                  🤝 It's a Draw!
                </div>
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                  <button onClick={startNewGame} className="btn">
                    Play Again
                  </button>
                  <button onClick={() => setView('lobby')} className="btn btn-secondary">
                    Back to Lobby
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main Board Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${boardSize}, 1fr)`,
              gap: '8px',
              maxWidth: '500px',
              margin: '0 auto',
              aspectRatio: '1'
            }}
          >
            {board.map((cell, idx) => {
              const isWinning = winningCells.includes(idx);
              const symbolOwner = activePlayers.find(p => p.symbol === cell);
              const cellColor = symbolOwner?.color || 'transparent';

              return (
                <button
                  key={idx}
                  onClick={() => handleCellClick(idx)}
                  className={isWinning ? 'winning-cell' : ''}
                  style={{
                    background: isWinning ? `${cellColor}25` : 'rgba(255, 255, 255, 0.03)',
                    border: '1.5px solid',
                    borderColor: isWinning ? cellColor : 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    fontSize: `${Math.max(1.2, 4 - boardSize * 0.3)}rem`,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: cell || winner || isDraw ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s',
                    '--cell-color': cellColor,
                    '--cell-color-glow': `${cellColor}40`
                  } as React.CSSProperties}
                >
                  {cell}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* History Sidebar */}
      {showHistorySidebar && (
        <div className="sidebar-backdrop" onClick={() => setShowHistorySidebar(false)} />
      )}
      <div className={`history-sidebar ${showHistorySidebar ? 'open' : ''}`}>
        <div className="history-header">
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>🕒 Game History</h3>
          <button 
            className="replay-btn" 
            onClick={() => setShowHistorySidebar(false)}
            style={{ width: '32px', height: '32px', border: 'none', background: 'transparent', fontSize: '1.2rem', padding: 0 }}
          >
            ✕
          </button>
        </div>
        <div className="history-list">
          {localHistory.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', marginTop: '2rem' }}>
              No matches played yet.
            </div>
          ) : (
            localHistory.map((hGame) => {
              const formattedDate = new Date(hGame.date).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const winnerDetails = hGame.winnerId 
                ? hGame.players.find((p: any) => p.id === hGame.winnerId)
                : null;

              return (
                <div key={hGame.id} className="history-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                    <span>{formattedDate}</span>
                    <span>{hGame.boardSize}x{hGame.boardSize} ({hGame.winCondition} in a row)</span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', margin: '0.3rem 0' }}>
                    {hGame.players.map((p: any) => `${p.symbol} ${p.name}`).join(' vs ')}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: winnerDetails ? winnerDetails.color : '#f59e0b', fontWeight: 500 }}>
                    {hGame.isDraw ? '🤝 Draw' : `🎉 Winner: ${winnerDetails?.name}`}
                  </div>
                  <button 
                    onClick={() => {
                      handleStartReplay(hGame);
                      setShowHistorySidebar(false);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', borderRadius: '8px', width: '100%', marginTop: '0.5rem' }}
                  >
                    🔄 Replay Match ({hGame.moves ? hGame.moves.length : 0} moves)
                  </button>
                </div>
              );
            })
          )}
        </div>
        {localHistory.length > 0 && (
          <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button 
              onClick={clearHistory}
              className="btn btn-danger"
              style={{ width: '100%', padding: '0.7rem' }}
            >
              Clear History 🗑️
            </button>
          </div>
        )}
      </div>

      {/* Replay Overlay */}
      {activeReplayGame && (
        <div className="replay-overlay">
          <div className="replay-container fade-in">
            <button 
              onClick={() => {
                setActiveReplayGame(null);
                setIsPlayingReplay(false);
              }}
              style={{
                position: 'absolute',
                top: '1.5rem',
                right: '1.5rem',
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '1.5rem',
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ margin: '0 0 0.5rem 0' }}>🔄 Match Replay</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0, fontSize: '0.9rem' }}>
                {activeReplayGame.boardSize}x{activeReplayGame.boardSize} grid • {activeReplayGame.winCondition} in a row
              </p>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '0.8rem' }}>
                {activeReplayGame.players.map((p: any) => `${p.symbol} ${p.name}`).join(' vs ')}
              </div>
            </div>

            {/* Replay Board */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${activeReplayGame.boardSize}, 1fr)`,
                gap: '8px',
                width: '100%',
                maxWidth: '320px',
                margin: '1rem auto',
                aspectRatio: '1'
              }}
            >
              {getReplayBoardState().map((cell, idx) => {
                const isLastMove = activeReplayGame.moves[replayStep] === idx;
                const symbolOwner = activeReplayGame.players.find((p: any) => p.symbol === cell);
                const cellColor = symbolOwner?.color || 'transparent';

                return (
                  <div
                    key={idx}
                    className={isLastMove ? 'winning-cell' : ''}
                    style={{
                      background: isLastMove ? `${cellColor}25` : 'rgba(255, 255, 255, 0.03)',
                      border: '1.5px solid',
                      borderColor: isLastMove ? cellColor : 'rgba(255, 255, 255, 0.08)',
                      borderRadius: '12px',
                      fontSize: `${Math.max(1.2, 4 - activeReplayGame.boardSize * 0.3)}rem`,
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '1',
                      userSelect: 'none',
                      '--cell-color': cellColor,
                      '--cell-color-glow': `${cellColor}40`
                    } as React.CSSProperties}
                  >
                    {cell}
                  </div>
                );
              })}
            </div>

            {/* Step Description */}
            <div style={{ 
              textAlign: 'center', 
              background: 'rgba(255,255,255,0.03)', 
              padding: '0.8rem', 
              borderRadius: '12px', 
              fontSize: '0.95rem',
              minHeight: '24px',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              {getReplayStepDescription()}
            </div>

            {/* Replay Controls */}
            <div className="replay-controls">
              <button 
                className="replay-btn" 
                onClick={() => {
                  setReplayStep(-1);
                  setIsPlayingReplay(false);
                }} 
                disabled={replayStep === -1}
                title="Start"
              >
                ⏮
              </button>
              <button 
                className="replay-btn" 
                onClick={() => {
                  setReplayStep(prev => prev - 1);
                  setIsPlayingReplay(false);
                }} 
                disabled={replayStep === -1}
                title="Previous Move"
              >
                ◀
              </button>
              <button 
                className={`replay-btn ${isPlayingReplay ? 'active' : ''}`}
                onClick={() => setIsPlayingReplay(!isPlayingReplay)}
                disabled={!activeReplayGame.moves || activeReplayGame.moves.length === 0}
                title={isPlayingReplay ? 'Pause' : 'Auto Play'}
              >
                {isPlayingReplay ? '⏸' : '▶'}
              </button>
              <button 
                className="replay-btn" 
                onClick={() => {
                  setReplayStep(prev => prev + 1);
                  setIsPlayingReplay(false);
                }} 
                disabled={!activeReplayGame.moves || replayStep === activeReplayGame.moves.length - 1}
                title="Next Move"
              >
                ▶️
              </button>
              <button 
                className="replay-btn" 
                onClick={() => {
                  setReplayStep(activeReplayGame.moves.length - 1);
                  setIsPlayingReplay(false);
                }} 
                disabled={!activeReplayGame.moves || replayStep === activeReplayGame.moves.length - 1}
                title="End"
              >
                ⏭
              </button>
            </div>
            
            <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
              Move {replayStep + 1} of {activeReplayGame.moves ? activeReplayGame.moves.length : 0}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
