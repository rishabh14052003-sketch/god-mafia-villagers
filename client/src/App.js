import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io('http://localhost:3001');

function App() {
  const [gameState, setGameState] = useState('home'); // home, lobby, game
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [players, setPlayers] = useState([]);
  const [role, setRole] = useState(null);
  const [gamePhase, setGamePhase] = useState('waiting');
  const [round, setRound] = useState(0);
  const [votes, setVotes] = useState({});
  const [timerEnd, setTimerEnd] = useState(null);
  const [killedPlayer, setKilledPlayer] = useState(null);
  const [eliminatedPlayer, setEliminatedPlayer] = useState(null);
  const [winner, setWinner] = useState(null);
  const [allPlayers, setAllPlayers] = useState([]);
  const [mafiaPlayers, setMafiaPlayers] = useState([]);
  const [godPlayers, setGodPlayers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    socket.on('roomCreated', ({ roomId, players }) => {
      setRoomId(roomId);
      setPlayers(players);
      setGameState('lobby');
    });

    socket.on('playerJoined', (players) => {
      setPlayers(players);
    });

    socket.on('playerLeft', (players) => {
      setPlayers(players);
    });

    socket.on('gameStarted', ({ role, mafiaPlayers, godPlayers, allPlayers }) => {
      setRole(role);
      setMafiaPlayers(mafiaPlayers);
      setGodPlayers(godPlayers);
      setAllPlayers(allPlayers);
      setGameState('game');
    });

    socket.on('gamePhaseChanged', ({ phase, round, timerEnd, killedPlayer, winner }) => {
      setGamePhase(phase);
      setRound(round);
      if (timerEnd) setTimerEnd(timerEnd);
      if (killedPlayer) setKilledPlayer(killedPlayer);
      if (winner) setWinner(winner);
    });

    socket.on('voteCast', ({ votes }) => {
      setVotes(votes);
    });

    socket.on('votingResult', ({ eliminatedPlayer, voteCounts, alivePlayers }) => {
      setEliminatedPlayer(eliminatedPlayer);
      setAllPlayers(alivePlayers);
    });

    socket.on('newRound', ({ round, allPlayers }) => {
      setRound(round);
      setAllPlayers(allPlayers);
      setKilledPlayer(null);
      setEliminatedPlayer(null);
      setVotes({});
    });

    socket.on('gameOver', ({ winner, allPlayers, yourRole }) => {
      setWinner(winner);
      setAllPlayers(allPlayers);
      setGamePhase('gameover');
    });

    socket.on('error', (errorMessage) => {
      setError(errorMessage);
      setTimeout(() => setError(''), 3000);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const createRoom = () => {
    if (playerName.trim()) {
      socket.emit('createRoom', playerName);
    }
  };

  const joinRoom = () => {
    if (playerName.trim() && roomId.trim()) {
      socket.emit('joinRoom', { roomId, playerName });
    }
  };

  const startGame = () => {
    socket.emit('startGame', roomId);
  };

  const handleMafiaKill = (targetId) => {
    socket.emit('mafiaKill', { roomId, targetId });
  };

  const handleVote = (targetId) => {
    socket.emit('vote', { roomId, targetId });
  };

  const isAdmin = players.length > 0 && players[0]?.isAdmin;

  if (gameState === 'home') {
    return (
      <div className="App">
        <div className="container">
          <h1 className="title">🎭 God Mafia and Villagers</h1>
          <p className="subtitle">A multiplayer social deduction game</p>
          
          {error && <div className="error">{error}</div>}
          
          <div className="form">
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              className="input"
            />
            
            <div className="tabs">
              <button 
                className={`tab ${!roomId ? 'active' : ''}`}
                onClick={() => setRoomId('')}
              >
                Create Room
              </button>
              <button 
                className={`tab ${roomId ? 'active' : ''}`}
                onClick={() => setRoomId('')}
              >
                Join Room
              </button>
            </div>
            
            {!roomId ? (
              <button onClick={createRoom} className="button primary">
                Create New Room
              </button>
            ) : (
              <>
                <input
                  type="text"
                  placeholder="Enter Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="input"
                />
                <button onClick={joinRoom} className="button primary">
                  Join Room
                </button>
              </>
            )}
          </div>
          
          <div className="rules">
            <h3>📜 Game Rules</h3>
            <ul>
              <li><strong>Mafia</strong>: Kill villagers at night. Only revealed to God.</li>
              <li><strong>God</strong>: Knows who the Mafia is. Guide villagers to victory.</li>
              <li><strong>Villagers</strong>: Vote to eliminate the Mafia during the day.</li>
              <li><strong>Voting</strong>: 90 seconds to vote. Most votes gets eliminated.</li>
              <li><strong>Win</strong>: Villagers win if Mafia is eliminated. Mafia wins if they equal or outnumber villagers.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'lobby') {
    return (
      <div className="App">
        <div className="container">
          <h1 className="title">🎭 Game Lobby</h1>
          <p className="room-info">Room ID: <strong>{roomId}</strong></p>
          
          <div className="players-list">
            <h3>Players ({players.length})</h3>
            {players.map((player, index) => (
              <div key={player.id} className="player-card">
                <span>{index + 1}. {player.name}</span>
                {player.isAdmin && <span className="badge admin">Admin</span>}
              </div>
            ))}
          </div>
          
          {isAdmin && players.length >= 3 && (
            <button onClick={startGame} className="button primary">
              Start Game
            </button>
          )}
          
          {!isAdmin && players.length < 3 && (
            <p className="waiting">Waiting for more players... (minimum 3)</p>
          )}
          
          {isAdmin && players.length < 3 && (
            <p className="waiting">Need at least 3 players to start</p>
          )}
        </div>
      </div>
    );
  }

  if (gameState === 'game') {
    return (
      <GameScreen
        role={role}
        gamePhase={gamePhase}
        round={round}
        allPlayers={allPlayers}
        mafiaPlayers={mafiaPlayers}
        godPlayers={godPlayers}
        votes={votes}
        timerEnd={timerEnd}
        killedPlayer={killedPlayer}
        eliminatedPlayer={eliminatedPlayer}
        winner={winner}
        onMafiaKill={handleMafiaKill}
        onVote={handleVote}
      />
    );
  }

  return null;
}

function GameScreen({ role, gamePhase, round, allPlayers, mafiaPlayers, godPlayers, votes, timerEnd, killedPlayer, eliminatedPlayer, winner, onMafiaKill, onVote }) {
  const [timeLeft, setTimeLeft] = useState(90);

  useEffect(() => {
    if (timerEnd && gamePhase === 'voting') {
      const interval = setInterval(() => {
        const remaining = Math.ceil((timerEnd - Date.now()) / 1000);
        setTimeLeft(Math.max(0, remaining));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timerEnd, gamePhase]);

  const getRoleEmoji = (r) => {
    switch (r) {
      case 'mafia': return '🔪';
      case 'god': return '👼';
      case 'villager': return '👤';
      default: return '❓';
    }
  };

  const getRoleColor = (r) => {
    switch (r) {
      case 'mafia': return '#ef4444';
      case 'god': return '#fbbf24';
      case 'villager': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  if (gamePhase === 'gameover') {
    return (
      <div className="App">
        <div className="container">
          <h1 className="title">Game Over!</h1>
          <div className={`result ${winner}`}>
            <h2>{winner === 'villagers' ? '🎉 Villagers Win!' : '💀 Mafia Wins!'}</h2>
          </div>
          
          <div className="players-list">
            <h3>Final Results</h3>
            {allPlayers.map((player, index) => (
              <div key={player.id} className="player-card revealed">
                <span>{index + 1}. {player.name}</span>
                <span className="role-badge" style={{ backgroundColor: getRoleColor(player.role) }}>
                  {getRoleEmoji(player.role)} {player.role.toUpperCase()}
                </span>
                {!player.isAlive && <span className="badge dead">DEAD</span>}
              </div>
            ))}
          </div>
          
          <button onClick={() => window.location.reload()} className="button primary">
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="App game">
      <div className="game-header">
        <div className="role-display">
          Your Role: <span style={{ color: getRoleColor(role) }}>
            {getRoleEmoji(role)} {role?.toUpperCase()}
          </span>
        </div>
        <div className="round-info">Round {round}</div>
        <div className="phase-display">{gamePhase.toUpperCase()}</div>
      </div>

      {gamePhase === 'night' && (
        <div className="phase-content night">
          <h2>🌙 Night Phase</h2>
          {role === 'mafia' && (
            <div className="mafia-action">
              <h3>Choose a victim to kill:</h3>
              <div className="players-grid">
                {allPlayers.filter(p => p.isAlive && p.role !== 'mafia').map(player => (
                  <button
                    key={player.id}
                    onClick={() => onMafiaKill(player.id)}
                    className="player-button kill"
                  >
                    {player.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {role === 'god' && mafiaPlayers.length > 0 && (
            <div className="god-info">
              <h3>👼 You know the Mafia:</h3>
              {mafiaPlayers.map(p => (
                <div key={p.id} className="mafia-revealed">
                  🔪 {p.name}
                </div>
              ))}
              <p>Guide the villagers to eliminate the Mafia!</p>
            </div>
          )}
          {role === 'villager' && (
            <div className="villager-waiting">
              <p>😴 Night has fallen. Wait for the morning...</p>
            </div>
          )}
        </div>
      )}

      {gamePhase === 'voting' && (
        <div className="phase-content voting">
          <h2>☀️ Voting Phase</h2>
          <div className="timer">Time remaining: {timeLeft}s</div>
          
          {killedPlayer && (
            <div className="killed-announcement">
              <p>💀 {killedPlayer.name} was killed last night!</p>
            </div>
          )}
          
          <h3>Vote to eliminate a suspect:</h3>
          <div className="players-grid">
            {allPlayers.filter(p => p.isAlive).map(player => {
              const voteCount = Object.values(votes).filter(v => v === player.id).length;
              return (
                <div key={player.id} className="player-vote-card">
                  <button
                    onClick={() => onVote(player.id)}
                    className="player-button vote"
                  >
                    {player.name}
                  </button>
                  <div className="vote-count">{voteCount} votes</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {gamePhase === 'results' && eliminatedPlayer && (
        <div className="phase-content results">
          <h2>📊 Voting Results</h2>
          <div className="eliminated">
            <p>{eliminatedPlayer.name} was eliminated!</p>
            <p className="role-reveal">They were a {eliminatedPlayer.role.toUpperCase()}</p>
          </div>
          <p>Next round starting soon...</p>
        </div>
      )}

      <div className="players-list game-players">
        <h3>Players</h3>
        {allPlayers.map((player, index) => (
          <div key={player.id} className="player-card">
            <span>{index + 1}. {player.name}</span>
            {!player.isAlive && <span className="badge dead">DEAD</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
