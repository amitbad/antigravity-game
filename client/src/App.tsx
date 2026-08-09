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

  // Customization States
  const [theme, setTheme] = useState<'neon' | 'cyberpunk' | 'forest' | 'retro' | 'pastel' | 'glass'>('neon');
  const [isCustomizationOpen, setIsCustomizationOpen] = useState(false);

  // Backend Rest API States
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  // New Player Form State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSymbol, setNewPlayerSymbol] = useState('🚀');
  const [newPlayerColor, setNewPlayerColor] = useState('#10b981');
  const [formError, setFormError] = useState<string | null>(null);

  // Local Player Profile State
  const [profile, setProfile] = useState<{
    name: string;
    avatar: string;
    wins: number;
    losses: number;
    draws: number;
  }>(() => {
    const saved = localStorage.getItem('tic_tac_toe_user_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return {
      name: 'Player 1',
      avatar: '🚀',
      wins: 0,
      losses: 0,
      draws: 0
    };
  });

  const displayedPlayers = [
    {
      id: 'local-profile',
      name: profile.name || 'Player 1',
      symbol: profile.avatar,
      color: '#3b82f6',
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws
    },
    ...allPlayers.filter(p => p.id !== 'local-profile')
  ];

  // Lobby Configuration State
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [boardSize, setBoardSize] = useState(3);
  const [winCondition, setWinCondition] = useState(3);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [turnLimitSeconds, setTurnLimitSeconds] = useState(15);

  // Active Local Game State
  const [activePlayers, setActivePlayers] = useState<Player[]>([]);
  const [board, setBoard] = useState<(string | null)[]>([]);
  const [turnIndex, setTurnIndex] = useState(0); 
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningCells, setWinningCells] = useState<number[]>([]);
  const [isDraw, setIsDraw] = useState(false);
  const [gameSaved, setGameSaved] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [forfeitMessage, setForfeitMessage] = useState<string | null>(null);

  // Local History and Replay State
  const [moves, setMoves] = useState<number[]>([]);
  const [localHistory, setLocalHistory] = useState<any[]>([]);
  const [activeReplayGame, setActiveReplayGame] = useState<any | null>(null);
  const [replayStep, setReplayStep] = useState<number>(-1);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);
  const [showHistorySidebar, setShowHistorySidebar] = useState<boolean>(false);

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

  // Fetch Rest API data for Leaderboard
  const fetchData = async () => {
    setError(null);
    try {
      const playersRes = await fetch(`${API_URL}/players`).catch(() => null);
      if (playersRes && playersRes.ok) {
        const playersData = await playersRes.json();
        setAllPlayers(playersData);
        if (selectedPlayerIds.length === 0) {
          setSelectedPlayerIds(['local-profile', playersData[0]?.id].filter(Boolean));
        }
      } else {
        const localPlayers = [
          { id: '1', name: 'Alice', symbol: '❌', color: '#ff4b4b', wins: 3, losses: 1, draws: 1 },
          { id: '2', name: 'Bob', symbol: '⭕', color: '#4b7bff', wins: 1, losses: 3, draws: 1 }
        ];
        setAllPlayers(localPlayers);
        if (selectedPlayerIds.length === 0) {
          setSelectedPlayerIds(['local-profile', '1']);
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

  // Ensure winCondition doesn't exceed boardSize
  useEffect(() => {
    if (winCondition > boardSize) {
      setWinCondition(boardSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardSize]);

  // Turn Timer countdown effect
  useEffect(() => {
    if (!timerEnabled || view !== 'game' || winner || isDraw || gameMode === 'online') return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          const activePlayer = activePlayers[turnIndex];
          setForfeitMessage(`⚠️ Time's up! ${activePlayer ? activePlayer.name : 'Player'}'s turn was forfeited.`);
          setTurnIndex(current => (current + 1) % activePlayers.length);
          return turnLimitSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerEnabled, view, turnIndex, winner, isDraw, activePlayers, turnLimitSeconds, gameMode]);

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
    const playersToPlay = displayedPlayers.filter(p => selectedPlayerIds.includes(p.id));
    if (playersToPlay.length < 2) return;

    setActivePlayers(playersToPlay);
    setBoard(Array(boardSize * boardSize).fill(null));
    setTurnIndex(0);
    setWinner(null);
    setWinningCells([]);
    setIsDraw(false);
    setGameSaved(false);
    setMoves([]);
    setTimeLeft(turnLimitSeconds);
    setForfeitMessage(null);
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

    const newMoves = [...moves, index];
    setMoves(newMoves);

    if (checkWinnerLocal(newBoard, boardSize, winCondition)) {
      setWinner(currentPlayer);
      saveGameResultLocal(currentPlayer.id, false, newMoves);
      return;
    }

    if (newBoard.every(cell => cell !== null)) {
      setIsDraw(true);
      saveGameResultLocal(null, true, newMoves);
      return;
    }

    setTimeLeft(turnLimitSeconds);
    setForfeitMessage(null);
    setTurnIndex((turnIndex + 1) % activePlayers.length);
  };

  const saveGameResultLocal = async (winnerId: string | null, draw: boolean, finalMoves = moves) => {
    if (gameSaved) return;
    setGameSaved(true);

    const playerIds = activePlayers.map(p => p.id);

    // Save to local storage profile if local profile is in the game
    const hasLocalProfile = playerIds.includes('local-profile');
    if (hasLocalProfile) {
      setProfile(prev => {
        let newWins = prev.wins;
        let newLosses = prev.losses;
        let newDraws = prev.draws;

        if (draw) {
          newDraws += 1;
        } else if (winnerId === 'local-profile') {
          newWins += 1;
        } else {
          newLosses += 1;
        }

        const updated = { ...prev, wins: newWins, losses: newLosses, draws: newDraws };
        localStorage.setItem('tic_tac_toe_user_profile', JSON.stringify(updated));
        return updated;
      });
    }

    // Save to LocalStorage history
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
          winCondition,
          moveCount: finalMoves.length,
          moves: finalMoves
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

  const handleUpdatePlayer = async (id: string, name: string, symbol: string, color: string) => {
    try {
      const response = await fetch(`${API_URL}/players/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol, color })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to update player.');
      }
      const updated = await response.json();
      setAllPlayers(prev => prev.map(p => p.id === id ? updated : p));
      
      const leaderboardRes = await fetch(`${API_URL}/leaderboard`).catch(() => null);
      if (leaderboardRes && leaderboardRes.ok) {
        setLeaderboard(await leaderboardRes.json());
      }
    } catch (err: any) {
      setAllPlayers(prev => prev.map(p => p.id === id ? { ...p, name, symbol, color } : p));
    }
  };

  const handleStartReplay = (game: any) => {
    setActiveReplayGame(game);
    setReplayStep(-1); 
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
    <div className="theme-container" data-theme={theme}>
      <div style={{ width: '100%', maxWidth: '1200px' }}>
        <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 className="title-gradient" style={{ fontSize: '3rem', margin: '0 0 0.5rem 0' }}>
            Neon Tic-Tac-Toe
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', margin: 0 }}>
            Real-time multiplayer match with customization & statistics
          </p>
          {view === 'lobby' && (
            <div style={{ marginTop: '1.2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button 
                className="btn btn-secondary animate-hover" 
                onClick={() => setShowHistorySidebar(true)}
                style={{ fontSize: '0.9rem', padding: '0.6rem 1.2rem' }}
              >
                🕒 Match History ({localHistory.length})
              </button>
            </div>
          )}
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
              {/* Game Mode Switcher */}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontWeight: 700, fontSize: '1.6rem' }}>🎮 Game Setup</h2>
                    <button
                      onClick={() => setIsCustomizationOpen(true)}
                      className="btn btn-secondary"
                      style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                    >
                      🎨 Theme & Customization
                    </button>
                  </div>

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

                  {/* Timer configs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
                    <div className="timer-toggle-wrapper">
                      <input
                        id="timer-toggle"
                        type="checkbox"
                        checked={timerEnabled}
                        onChange={(e) => setTimerEnabled(e.target.checked)}
                        style={{ width: 'auto', cursor: 'pointer' }}
                      />
                      <label htmlFor="timer-toggle">Enable Turn Timer</label>
                    </div>

                    {timerEnabled && (
                      <div>
                        <label style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.5rem' }}>
                          Timer Duration
                        </label>
                        <select value={turnLimitSeconds} onChange={(e) => setTurnLimitSeconds(Number(e.target.value))}>
                          {[5, 10, 15, 30, 60].map(sec => (
                            <option key={sec} value={sec}>{sec} seconds</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Selected Players list */}
                  <div>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.2rem' }}>
                      Select Active Players ({selectedPlayerIds.length} Selected)
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.8rem' }}>
                      {displayedPlayers.map(p => {
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
                          placeholder="Enter name (e.g. Player)"
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
                        <div className="color-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {PRESET_COLORS.map(color => (
                            <div
                              key={color}
                              onClick={() => setNewPlayerColor(color)}
                              className={`color-dot ${newPlayerColor === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color, width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', border: newPlayerColor === color ? '2px solid white' : 'none' }}
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

            {/* Right Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {gameMode === 'local' && (
                <>
                  {/* Player Profile Section */}
                  <div className="glass-panel" style={{ padding: '2rem' }}>
                    <h2 style={{ marginTop: 0, fontWeight: 700, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      👤 My Profile
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                      <div>
                        <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                          Profile Name
                        </label>
                        <input
                          type="text"
                          value={profile.name}
                          onChange={(e) => {
                            const newName = e.target.value;
                            setProfile(prev => {
                              const updated = { ...prev, name: newName };
                              localStorage.setItem('tic_tac_toe_user_profile', JSON.stringify(updated));
                              return updated;
                            });
                          }}
                          placeholder="Enter your name"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', display: 'block', marginBottom: '0.4rem' }}>
                          Choose Avatar
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.4rem' }}>
                          {PRESET_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => {
                                setProfile(prev => {
                                  const updated = { ...prev, avatar: emoji };
                                  localStorage.setItem('tic_tac_toe_user_profile', JSON.stringify(updated));
                                  return updated;
                                });
                              }}
                              style={{
                                background: profile.avatar === emoji ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.03)',
                                border: '1.5px solid',
                                borderColor: profile.avatar === emoji ? '#3b82f6' : 'rgba(255,255,255,0.08)',
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

                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '16px',
                        padding: '1rem',
                        marginTop: '0.5rem'
                      }}>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem', textAlign: 'center' }}>
                          🏆 Lifetime Stats (Stored Locally)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
                          <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{profile.wins}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Wins</div>
                          </div>
                          <div style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>{profile.losses}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Losses</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f59e0b' }}>{profile.draws}</div>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>Draws</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

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
                        <div className="color-picker" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {PRESET_COLORS.map(color => (
                            <div
                              key={color}
                              onClick={() => setNewPlayerColor(color)}
                              className={`color-dot ${newPlayerColor === color ? 'selected' : ''}`}
                              style={{ backgroundColor: color, width: '24px', height: '24px', borderRadius: '50%', cursor: 'pointer', border: newPlayerColor === color ? '2px solid white' : 'none' }}
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
                        Add to Directory
                      </button>
                    </form>
                  </div>
                </>
              )}

              {/* Leaderboard / Global Ranks */}
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

            {/* Forfeit Notification Banner */}
            {forfeitMessage && (
              <div className="forfeit-banner">
                {forfeitMessage}
              </div>
            )}

            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              {!winner && !isDraw ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    className="player-badge active"
                    style={{
                      display: 'inline-flex',
                      '--player-color': activePlayers[turnIndex]?.color,
                      '--player-color-glow': `${activePlayers[turnIndex]?.color}25`
                    } as React.CSSProperties}
                  >
                    <span style={{ fontSize: '2rem' }}>{activePlayers[turnIndex]?.symbol}</span>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Current Turn</div>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: activePlayers[turnIndex]?.color }}>
                        {activePlayers[turnIndex]?.name}
                      </div>
                    </div>
                  </div>

                  {/* Turn Timer Visual Indicator */}
                  {timerEnabled && (
                    <div className="timer-container">
                      <div className="timer-bar-bg">
                        <div
                          className={`timer-bar-fill ${timeLeft <= 3 ? 'danger' : timeLeft <= 6 ? 'warning' : ''}`}
                          style={{ width: `${(timeLeft / turnLimitSeconds) * 100}%` }}
                        />
                      </div>
                      <div className={`timer-text ${timeLeft <= 3 ? 'danger' : ''}`}>
                        {timeLeft}s
                      </div>
                    </div>
                  )}
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
                      const isOurTurn = onlinePlayer?.id === currentTurnPlayer?.id;

                      return (
                        <div
                          className={`player-badge ${isOurTurn ? 'active' : ''}`}
                          style={{
                            display: 'inline-flex',
                            '--player-color': currentTurnPlayer?.color,
                            '--player-color-glow': `${currentTurnPlayer?.color}25`
                          } as React.CSSProperties}
                        >
                          <span style={{ fontSize: '2rem' }}>{currentTurnPlayer?.symbol}</span>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                              {isOurTurn ? '👉 Your Turn' : '⌛ Opponent Turn'}
                            </div>
                            <div style={{ fontSize: '1.3rem', fontWeight: 700, color: currentTurnPlayer?.color }}>
                              {currentTurnPlayer?.name}
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
                      const isOurTurn = onlinePlayer?.id === onlineRoomState.players[onlineRoomState.turnIndex]?.id;

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

        {/* Customization Modal */}
        {isCustomizationOpen && (
          <div className="modal-overlay" onClick={() => setIsCustomizationOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>🎨 Match Customization</h2>
                <button className="close-btn" onClick={() => setIsCustomizationOpen(false)}>×</button>
              </div>

              <h3 style={{ marginTop: 0, marginBottom: '0.8rem' }}>Select Board Theme</h3>
              <div className="themes-grid">
                {[
                  { id: 'neon', name: 'Neon Classic', bg: 'radial-gradient(circle, #1e3a8a, #0b0f19)', text: '#00c6ff', border: '#0072ff' },
                  { id: 'cyberpunk', name: 'Cyberpunk Grid', bg: 'linear-gradient(135deg, #0d0116, #120221)', text: '#00ffff', border: '#ff007f' },
                  { id: 'forest', name: 'Forest Emerald', bg: '#091a10', text: '#ecfdf5', border: '#10b981' },
                  { id: 'retro', name: 'Retro Terminal', bg: '#000000', text: '#33ff33', border: '#33ff33' },
                  { id: 'pastel', name: 'Pastel Dream', bg: '#fef2f2', text: '#1e1b4b', border: '#6366f1' },
                  { id: 'glass', name: 'Glass Slate', bg: 'rgba(255,255,255,0.03)', text: '#f9fafb', border: 'rgba(255,255,255,0.15)' }
                ].map(t => (
                  <div
                    key={t.id}
                    className={`theme-card ${theme === t.id ? 'active' : ''}`}
                    onClick={() => setTheme(t.id as any)}
                  >
                    <div className="theme-preview-box" style={{ background: t.bg, color: t.text, border: `1px solid ${t.border}` }}>
                      {t.id === 'retro' ? 'SYS> X / O' : '🏆 PLAY'}
                    </div>
                    <span className="theme-card-title">{t.name}</span>
                  </div>
                ))}
              </div>

              <h3 style={{ marginBottom: '0.8rem' }}>Customize Active Players</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <PlayerEditSubform
                  player={allPlayers.find(p => p.id === selectedPlayerIds[0]) || allPlayers[0]}
                  otherPlayer={allPlayers.find(p => p.id === selectedPlayerIds[1]) || allPlayers[1]}
                  onUpdate={handleUpdatePlayer}
                  label="Player 1"
                />
                <PlayerEditSubform
                  player={allPlayers.find(p => p.id === selectedPlayerIds[1]) || allPlayers[1]}
                  otherPlayer={allPlayers.find(p => p.id === selectedPlayerIds[0]) || allPlayers[0]}
                  onUpdate={handleUpdatePlayer}
                  label="Player 2"
                />
              </div>

              <button className="btn" style={{ width: '100%', padding: '1rem' }} onClick={() => setIsCustomizationOpen(false)}>
                Save & Apply Configuration ✓
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Sub-component for editing individual player configurations in the modal
interface PlayerEditSubformProps {
  player?: Player;
  otherPlayer?: Player;
  onUpdate: (id: string, name: string, symbol: string, color: string) => void;
  label: string;
}

function PlayerEditSubform({ player, otherPlayer, onUpdate, label }: PlayerEditSubformProps) {
  if (!player) return null;

  const [name, setName] = useState(player.name);
  const [symbol, setSymbol] = useState(player.symbol);
  const [color, setColor] = useState(player.color);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(player.name);
    setSymbol(player.symbol);
    setColor(player.color);
  }, [player]);

  const handleChangeName = (val: string) => {
    setName(val);
    setError(null);
    if (otherPlayer && val.trim().toLowerCase() === otherPlayer.name.toLowerCase()) {
      setError('Cannot have the same name as the other player.');
      return;
    }
    onUpdate(player.id, val.trim(), symbol, color);
  };

  const handleChangeSymbol = (emoji: string) => {
    setSymbol(emoji);
    setError(null);
    if (otherPlayer && emoji === otherPlayer.symbol) {
      setError('Symbol already selected by the other player.');
      return;
    }
    onUpdate(player.id, name, emoji, color);
  };

  const handleChangeColor = (col: string) => {
    setColor(col);
    onUpdate(player.id, name, symbol, col);
  };

  const ALL_CUSTOM_EMOJIS = ['❌', '⭕', '🚀', '🦄', '⭐', '🔥', '🎮', '🍕', '🦊', '⚡', '👑', '🍀', '💀', '👻', '👽', '👾', '🍩', '🥑', '🎈', '💎', '💡', '🔮', '🐱', '🐶', '🦖', '🍎', '🛹', '🎨', '🌈'];

  return (
    <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.05)', padding: '1.2rem', borderRadius: '16px' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.8rem', color: color, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
        {label} Config
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.8rem', opacity: 0.7, display: 'block', marginBottom: '0.3rem' }}>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => handleChangeName(e.target.value)}
          placeholder="Player Name"
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.8rem', opacity: 0.7, display: 'block', marginBottom: '0.3rem' }}>Choose Icon/Emoji</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.3rem', maxHeight: '100px', overflowY: 'auto', padding: '0.2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
          {ALL_CUSTOM_EMOJIS.map(emoji => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleChangeSymbol(emoji)}
              style={{
                background: symbol === emoji ? `${color}30` : 'transparent',
                border: '1px solid',
                borderColor: symbol === emoji ? color : 'transparent',
                borderRadius: '6px',
                padding: '0.3rem',
                fontSize: '1.2rem',
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
        <label style={{ fontSize: '0.8rem', opacity: 0.7, display: 'block', marginBottom: '0.3rem' }}>Color Theme</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {PRESET_COLORS.map(col => (
            <div
              key={col}
              onClick={() => handleChangeColor(col)}
              className={`color-dot ${color === col ? 'selected' : ''}`}
              style={{ backgroundColor: col, width: '24px', height: '24px' }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.5rem' }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
