import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

// API & Socket Configurations
const API_URL = 'http://localhost:3001/api';
const SOCKET_URL = 'http://localhost:3001';

interface Player {
  id: string;
  name: string;
  symbol: string;
  color: string;
  wins: number;
  losses: number;
  draws: number;
}


interface RoomState {
  id: string;
  boardSize: number;
  winCondition: number;
  board: (string | null)[];
  turnIndex: number;
  players: Player[];
  winner: Player | null;
  winningCells: number[];
  isDraw: boolean;
}

const PRESET_EMOJIS = ['❌', '⭕', '🚀', '🦄', '⭐', '🔥', '🎮', '🍕', '🦊', '⚡', '👑', '🍀'];
const PRESET_COLORS = ['#ff4b4b', '#4b7bff', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6'];

export default function App() {
  // Navigation / Mode Views
  const [gameMode, setGameMode] = useState<'local' | 'online'>('local');
  const [view, setView] = useState<'lobby' | 'game'>('lobby');

  // Backend Rest API States
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New Player Registration Form State (used for both local and online host/guest setup)
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSymbol, setNewPlayerSymbol] = useState('🚀');
  const [newPlayerColor, setNewPlayerColor] = useState('#10b981');
  const [formError, setFormError] = useState<string | null>(null);

  // --- LOCAL GAME STATE ---
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState(3);
  const [winCondition, setWinCondition] = useState(3);
  const [activePlayers, setActivePlayers] = useState<Player[]>([]);
  const [board, setBoard] = useState<(string | null)[]>([]);
  const [turnIndex, setTurnIndex] = useState(0); 
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningCells, setWinningCells] = useState<number[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [gameSaved, setGameSaved] = useState(false);

  // --- MULTIPLAYER ONLINE STATE ---
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineRoomState, setOnlineRoomState] = useState<RoomState | null>(null);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [onlinePlayer, setOnlinePlayer] = useState<Player | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Parse shareable link on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setGameMode('online');
      setJoinRoomId(roomParam.toUpperCase());
    }
  }, []);

  // Fetch Rest API data for Leaderboard/History
  const fetchData = async () => {
    setError(null);
    try {
      const playersRes = await fetch(`${API_URL}/players`).catch(() => null);
      if (playersRes && playersRes.ok) {
        const playersData = await playersRes.json();
        setAllPlayers(playersData);
        if (playersData.length >= 2 && selectedPlayerIds.length === 0) {
          setSelectedPlayerIds([playersData[0].id, playersData[1].id]);
        }
      } else {
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
    } catch (err) {
      console.error(err);
      setError('An unexpected error occurred while loading server data.');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Ensure winCondition doesn't exceed boardSize
  useEffect(() => {
    if (winCondition > boardSize) {
      setWinCondition(boardSize);
    }
  }, [boardSize]);

  // Clean up socket on component unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // --- LOCAL GAME LOGIC ---
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
      
      const leaderboardRes = await fetch(`${API_URL}/leaderboard`).catch(() => null);
      if (leaderboardRes && leaderboardRes.ok) {
        setLeaderboard(await leaderboardRes.json());
      }
    } catch (err: any) {
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

  const handleTogglePlayer = (id: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
    );
  };

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
    setView('game');
  };

  const checkWinnerLocal = (grid: (string | null)[], size: number, target: number) => {
    const checkLine = (cells: number[]): boolean => {
      if (cells.length < target) return false;
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

    // Horizontal
    for (let r = 0; r < size; r++) {
      const rowCells = [];
      for (let c = 0; c < size; c++) rowCells.push(r * size + c);
      if (checkLine(rowCells)) return true;
    }

    // Vertical
    for (let c = 0; c < size; c++) {
      const colCells = [];
      for (let r = 0; r < size; r++) colCells.push(r * size + c);
      if (checkLine(colCells)) return true;
    }

    // Diagonals
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

    // Anti-diagonals
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

  const handleCellClickLocal = (index: number) => {
    if (board[index] || winner || isDraw) return;

    const currentPlayer = activePlayers[turnIndex];
    const newBoard = [...board];
    newBoard[index] = currentPlayer.symbol;
    setBoard(newBoard);

    if (checkWinnerLocal(newBoard, boardSize, winCondition)) {
      setWinner(currentPlayer);
      saveGameResultLocal(currentPlayer.id, false);
      return;
    }

    if (newBoard.every(cell => cell !== null)) {
      setIsDraw(true);
      saveGameResultLocal(null, true);
      return;
    }

    setTurnIndex((turnIndex + 1) % activePlayers.length);
  };

  const saveGameResultLocal = async (winnerId: string | null, draw: boolean) => {
    if (gameSaved) return;
    setGameSaved(true);

    const playerIds = activePlayers.map(p => p.id);
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
        fetchData();
      }
    } catch (err) {
      console.error('Error saving game record:', err);
      setAllPlayers(prev =>
        prev.map(p => {
          if (playerIds.includes(p.id)) {
            if (draw) p.draws += 1;
            else if (p.id === winnerId) p.wins += 1;
            else p.losses += 1;
          }
          return p;
        })
      );
    }
  };

  // --- MULTIPLAYER ONLINE GAME LOGIC ---

  const initSocketConnection = () => {
    if (socket) return socket;
    const newSocket = io(SOCKET_URL);

    newSocket.on('room-created', ({ roomId, roomState }) => {
      setOnlineRoomState(roomState);
      setOnlinePlayer(roomState.players[0]);
      setOnlineError(null);
      setOpponentDisconnected(false);
      setView('game');
      window.history.pushState({}, '', `?room=${roomId}`);
    });

    newSocket.on('room-joined', ({ roomState }) => {
      setOnlineRoomState(roomState);
      if (roomState.players.length === 2 && !onlinePlayer) {
        setOnlinePlayer(roomState.players[1]);
      }
      setOnlineError(null);
      setOpponentDisconnected(false);
      setView('game');
    });

    newSocket.on('state-update', ({ roomState }) => {
      setOnlineRoomState(roomState);
      if (roomState.winner || roomState.isDraw) {
        fetchData();
      }
    });

    newSocket.on('opponent-disconnected', () => {
      setOpponentDisconnected(true);
    });

    newSocket.on('error', (msg) => {
      setOnlineError(msg);
      newSocket.disconnect();
      setSocket(null);
    });

    setSocket(newSocket);
    return newSocket;
  };

  const handleCreateOnlineRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) {
      setOnlineError('Player name is required to host.');
      return;
    }
    setOnlineError(null);

    const activeSocket = initSocketConnection();
    activeSocket.emit('create-room', {
      boardSize,
      winCondition,
      player: {
        name: newPlayerName.trim(),
        symbol: newPlayerSymbol,
        color: newPlayerColor
      }
    });
  };

  const handleJoinOnlineRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) {
      setOnlineError('Player name is required to join.');
      return;
    }
    if (!joinRoomId.trim()) {
      setOnlineError('Room ID is required.');
      return;
    }
    setOnlineError(null);

    const activeSocket = initSocketConnection();
    activeSocket.emit('join-room', {
      roomId: joinRoomId.trim().toUpperCase(),
      player: {
        name: newPlayerName.trim(),
        symbol: newPlayerSymbol,
        color: newPlayerColor
      }
    });
  };

  const handleCellClickOnline = (index: number) => {
    if (!socket || !onlineRoomState) return;
    const currentPlayer = onlineRoomState.players[onlineRoomState.turnIndex];
    if (onlinePlayer?.id !== currentPlayer.id) return;
    if (onlineRoomState.board[index] || onlineRoomState.winner || onlineRoomState.isDraw) return;

    socket.emit('make-move', {
      roomId: onlineRoomState.id,
      index
    });
  };

  const handleRestartOnlineGame = () => {
    if (!socket || !onlineRoomState) return;
    socket.emit('restart-game', {
      roomId: onlineRoomState.id
    });
  };

  const handleLeaveOnlineRoom = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setOnlineRoomState(null);
    setOnlinePlayer(null);
    setView('lobby');
    setJoinRoomId('');
    window.history.pushState({}, '', window.location.pathname);
  };

  const copyShareLink = () => {
    if (!onlineRoomState) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${onlineRoomState.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  return (
    <div className="fade-in">
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <h1 className="title-gradient" style={{ fontSize: '3rem', margin: '0 0 0.5rem 0' }}>
          Neon Tic-Tac-Toe
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
          Real-time multiplayer match with shareable links
        </p>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '12px',
            color: '#ef4444',
            padding: '0.6rem 1rem',
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
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{
              display: 'flex',
              background: 'rgba(255, 255, 255, 0.03)',
              padding: '4px',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <button
                type="button"
                onClick={() => setGameMode('local')}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  borderRadius: '12px',
                  background: gameMode === 'local' ? 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' : 'transparent',
                  border: 'none',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🎮 Pass & Play Local
              </button>
              <button
                type="button"
                onClick={() => setGameMode('online')}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  borderRadius: '12px',
                  background: gameMode === 'online' ? 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' : 'transparent',
                  border: 'none',
                  color: 'white',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                ⚡ Real-time Online
              </button>
            </div>

            {gameMode === 'local' ? (
              <>
                <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.6rem' }}>🎮 Game Setup</h2>

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

                <button
                  onClick={startNewGame}
                  disabled={selectedPlayerIds.length < 2}
                  className="btn"
                  style={{ width: '100%', padding: '1.1rem', fontSize: '1.1rem' }}
                >
                  Start Tic Tac Toe Match 🚀
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.6rem' }}>⚡ Real-time Matchmaking</h2>

                {onlineError && (
                  <div style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', padding: '0.8rem', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.9rem' }}>
                    ❌ {onlineError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '1.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>1. Customize Your Online Avatar</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                        Your Nickname
                      </label>
                      <input
                        type="text"
                        value={newPlayerName}
                        onChange={(e) => setNewPlayerName(e.target.value)}
                        placeholder="Enter name (e.g. HostGuy)"
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                        Select Symbol
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
                        {PRESET_EMOJIS.slice(0, 12).map(emoji => (
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
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem' }}>
                  <form onSubmit={handleCreateOnlineRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Create a New Room</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.3rem' }}>Grid Size</label>
                        <select value={boardSize} onChange={(e) => setBoardSize(Number(e.target.value))}>
                          {[3, 4, 5, 6, 7].map(s => (
                            <option key={s} value={s}>{s}x{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.3rem' }}>Win Streak</label>
                        <select value={winCondition} onChange={(e) => setWinCondition(Number(e.target.value))}>
                          {Array.from({ length: boardSize - 2 }, (_, idx) => idx + 3).map(w => (
                            <option key={w} value={w}>{w} in a row</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="btn" style={{ width: '100%', marginTop: '0.5rem' }}>
                      Create Room 🏠
                    </button>
                  </form>

                  <form onSubmit={handleJoinOnlineRoom} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.01)', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Join Existing Room</h3>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '0.3rem' }}>Room ID or Link</label>
                      <input
                        type="text"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value)}
                        placeholder="e.g. ABCDEF"
                      />
                    </div>
                    <button type="submit" className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }}>
                      Join Match ⚡
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {gameMode === 'local' && (
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
            )}

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
      ) : gameMode === 'local' ? (
        <div className="glass-panel fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <button onClick={() => setView('lobby')} className="btn btn-secondary">
              ← Lobby Setup
            </button>
            <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)' }}>
              Target: <strong>{winCondition} in a row</strong>
            </div>
          </div>

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
                  onClick={() => handleCellClickLocal(idx)}
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
      ) : (
        <div className="glass-panel fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
          {onlineRoomState && onlineRoomState.players.length < 2 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>⏳</div>
              <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700 }}>Waiting for Player 2...</h2>
              <p style={{ color: 'rgba(255,255,255,0.6)', marginTop: '0.5rem', marginBottom: '2rem' }}>
                Share the link below with your opponent to start the real-time match.
              </p>

              <div style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '1.2rem',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                alignItems: 'center',
                maxWidth: '500px',
                margin: '0 auto 2rem auto'
              }}>
                <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Room ID: <strong style={{ color: '#3b82f6', fontSize: '1rem' }}>{onlineRoomState.id}</strong>
                </div>
                <div style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '0.8rem 1.2rem',
                  borderRadius: '12px',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  wordBreak: 'break-all',
                  color: 'rgba(255,255,255,0.8)'
                }}>
                  {window.location.origin}{window.location.pathname}?room={onlineRoomState.id}
                </div>
                <button onClick={copyShareLink} className="btn" style={{ width: '100%' }}>
                  {linkCopied ? '✓ Link Copied!' : '📋 Copy Share Link'}
                </button>
              </div>

              <button onClick={handleLeaveOnlineRoom} className="btn btn-secondary">
                Cancel & Return to Lobby
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <button onClick={handleLeaveOnlineRoom} className="btn btn-secondary">
                  ← Quit Match
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                    Room Code: <strong style={{ color: '#3b82f6' }}>{onlineRoomState?.id}</strong>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
                    Target: <strong>{onlineRoomState?.winCondition} in a row</strong>
                  </div>
                </div>
              </div>

              {opponentDisconnected && (
                <div style={{
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '16px',
                  color: '#f59e0b',
                  padding: '1rem',
                  marginBottom: '2rem',
                  textAlign: 'center',
                  fontSize: '0.95rem'
                }}>
                  ⚠️ Opponent disconnected! You can wait for them to reconnect, or leave the match.
                </div>
              )}

              <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                {onlineRoomState && !onlineRoomState.winner && !onlineRoomState.isDraw ? (
                  (() => {
                    const currentTurnPlayer = onlineRoomState.players[onlineRoomState.turnIndex];
                    const isOurTurn = onlinePlayer?.id === currentTurnPlayer.id;

                    return (
                      <div
                        className={`player-badge ${isOurTurn ? 'active' : ''}`}
                        style={{
                          display: 'inline-flex',
                          '--player-color': currentTurnPlayer.color,
                          '--player-color-glow': `${currentTurnPlayer.color}25`
                        } as React.CSSProperties}
                      >
                        <span style={{ fontSize: '2rem' }}>{currentTurnPlayer.symbol}</span>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                            {isOurTurn ? '👉 Your Turn' : '⌛ Opponent Turn'}
                          </div>
                          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: currentTurnPlayer.color }}>
                            {currentTurnPlayer.name}
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : onlineRoomState?.winner ? (
                  <div className="fade-in" style={{ display: 'inline-block' }}>
                    <div
                      style={{
                        fontSize: '2.5rem',
                        fontWeight: 800,
                        color: onlineRoomState.winner.color,
                        textShadow: `0 0 20px ${onlineRoomState.winner.color}40`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        marginBottom: '1rem'
                      }}
                    >
                      🎉 {onlineRoomState.winner.symbol} {onlineRoomState.winner.name} Wins!
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                      <button onClick={handleRestartOnlineGame} className="btn">
                        Play Again
                      </button>
                      <button onClick={handleLeaveOnlineRoom} className="btn btn-secondary">
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
                      <button onClick={handleRestartOnlineGame} className="btn">
                        Play Again
                      </button>
                      <button onClick={handleLeaveOnlineRoom} className="btn btn-secondary">
                        Back to Lobby
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {onlineRoomState && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${onlineRoomState.boardSize}, 1fr)`,
                    gap: '8px',
                    maxWidth: '500px',
                    margin: '0 auto',
                    aspectRatio: '1'
                  }}
                >
                  {onlineRoomState.board.map((cell, idx) => {
                    const isWinning = onlineRoomState.winningCells.includes(idx);
                    const symbolOwner = onlineRoomState.players.find(p => p.symbol === cell);
                    const cellColor = symbolOwner?.color || 'transparent';
                    const isOurTurn = onlinePlayer?.id === onlineRoomState.players[onlineRoomState.turnIndex].id;

                    return (
                      <button
                        key={idx}
                        onClick={() => handleCellClickOnline(idx)}
                        className={isWinning ? 'winning-cell' : ''}
                        style={{
                          background: isWinning ? `${cellColor}25` : 'rgba(255, 255, 255, 0.03)',
                          border: '1.5px solid',
                          borderColor: isWinning ? cellColor : 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '12px',
                          fontSize: `${Math.max(1.2, 4 - onlineRoomState.boardSize * 0.3)}rem`,
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: cell || onlineRoomState.winner || onlineRoomState.isDraw || !isOurTurn ? 'not-allowed' : 'pointer',
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
