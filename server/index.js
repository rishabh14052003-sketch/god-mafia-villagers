const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Store game rooms
const rooms = {};

// Calculate roles based on player count
function calculateRoles(playerCount) {
  let mafiaCount = 1;
  let godCount = 1;

  if (playerCount >= 10 && playerCount <= 20) {
    mafiaCount = 2;
  } else if (playerCount > 20 && playerCount <= 30) {
    mafiaCount = 3;
  } else if (playerCount > 30) {
    mafiaCount = Math.floor(playerCount / 10);
  }

  const villagerCount = playerCount - mafiaCount - godCount;
  return { mafiaCount, godCount, villagerCount };
}

// Shuffle array and assign roles
function assignRoles(players) {
  const { mafiaCount, godCount, villagerCount } = calculateRoles(players.length);
  
  const roles = [];
  for (let i = 0; i < mafiaCount; i++) roles.push('mafia');
  for (let i = 0; i < godCount; i++) roles.push('god');
  for (let i = 0; i < villagerCount; i++) roles.push('villager');
  
  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  
  // Assign roles to players
  return players.map((player, index) => ({
    ...player,
    role: roles[index],
    isAlive: true
  }));
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new room
  socket.on('createRoom', (playerName) => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: [{
        id: socket.id,
        name: playerName,
        isAdmin: true,
        role: null,
        isAlive: true
      }],
      gamePhase: 'waiting', // waiting, night, voting, results, gameover
      votes: {},
      mafiaTarget: null,
      round: 0,
      timer: null,
      timerEnd: null
    };
    
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, players: rooms[roomId].players });
    io.to(roomId).emit('playerJoined', rooms[roomId].players);
  });

  // Join an existing room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms[roomId];
    
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }
    
    if (room.gamePhase !== 'waiting') {
      socket.emit('error', 'Game already in progress');
      return;
    }
    
    const newPlayer = {
      id: socket.id,
      name: playerName,
      isAdmin: false,
      role: null,
      isAlive: true
    };
    
    room.players.push(newPlayer);
    socket.join(roomId);
    
    io.to(roomId).emit('playerJoined', room.players);
  });

  // Start the game
  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    
    if (!room || room.gamePhase !== 'waiting') {
      return;
    }
    
    // Assign roles
    room.players = assignRoles(room.players);
    room.gamePhase = 'night';
    room.round = 1;
    
    // Send role information to each player
    room.players.forEach(player => {
      const mafiaPlayers = room.players.filter(p => p.role === 'mafia');
      const godPlayers = room.players.filter(p => p.role === 'god');
      
      io.to(player.id).emit('gameStarted', {
        role: player.role,
        mafiaPlayers: player.role === 'god' ? mafiaPlayers : [],
        godPlayers: player.role === 'mafia' ? godPlayers : [],
        allPlayers: room.players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
      });
    });
    
    io.to(roomId).emit('gamePhaseChanged', { phase: 'night', round: room.round });
  });

  // Mafia selects target to kill
  socket.on('mafiaKill', ({ roomId, targetId }) => {
    const room = rooms[roomId];
    
    if (!room || room.gamePhase !== 'night') {
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (player.role !== 'mafia') {
      return;
    }
    
    room.mafiaTarget = targetId;
    
    // Check if all mafia have voted (simplified - first mafia to vote decides)
    // Start voting phase after mafia kill
    setTimeout(() => {
      if (room.mafiaTarget) {
        const target = room.players.find(p => p.id === room.mafiaTarget);
        if (target) {
          target.isAlive = false;
        }
      }
      
      room.gamePhase = 'voting';
      room.votes = {};
      room.timerEnd = Date.now() + 90000; // 90 seconds
      
      io.to(roomId).emit('gamePhaseChanged', { 
        phase: 'voting', 
        round: room.round,
        timerEnd: room.timerEnd,
        killedPlayer: room.mafiaTarget ? room.players.find(p => p.id === room.mafiaTarget) : null
      });
      
      // Auto-end voting after 90 seconds
      room.timer = setTimeout(() => {
        endVoting(roomId);
      }, 90000);
      
    }, 3000); // 3 second delay for dramatic effect
  });

  // Player votes during voting phase
  socket.on('vote', ({ roomId, targetId }) => {
    const room = rooms[roomId];
    
    if (!room || room.gamePhase !== 'voting') {
      return;
    }
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.isAlive) {
      return;
    }
    
    room.votes[socket.id] = targetId;
    
    io.to(roomId).emit('voteCast', {
      voterId: socket.id,
      targetId: targetId,
      votes: room.votes
    });
    
    // Check if all alive players have voted
    const alivePlayers = room.players.filter(p => p.isAlive);
    if (Object.keys(room.votes).length === alivePlayers.length) {
      clearTimeout(room.timer);
      endVoting(roomId);
    }
  });

  // End voting and calculate results
  function endVoting(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    
    // Count votes
    const voteCounts = {};
    Object.values(room.votes).forEach(targetId => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });
    
    // Find player with max votes
    let maxVotes = 0;
    let eliminatedId = null;
    
    Object.entries(voteCounts).forEach(([targetId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = targetId;
      }
    });
    
    let eliminatedPlayer = null;
    let gameOver = false;
    let winner = null;
    
    if (eliminatedId) {
      eliminatedPlayer = room.players.find(p => p.id === eliminatedId);
      if (eliminatedPlayer) {
        eliminatedPlayer.isAlive = false;
        
        // Check if mafia was eliminated
        if (eliminatedPlayer.role === 'mafia') {
          gameOver = true;
          winner = 'villagers';
        }
      }
    }
    
    // Check if mafia won (mafia count >= villager count)
    const aliveMafia = room.players.filter(p => p.isAlive && p.role === 'mafia').length;
    const aliveVillagers = room.players.filter(p => p.isAlive && p.role !== 'mafia').length;
    
    if (!gameOver && aliveMafia >= aliveVillagers) {
      gameOver = true;
      winner = 'mafia';
    }
    
    if (gameOver) {
      room.gamePhase = 'gameover';
      
      // Reveal all roles
      room.players.forEach(player => {
        io.to(player.id).emit('gameOver', {
          winner,
          allPlayers: room.players,
          yourRole: player.role
        });
      });
      
      io.to(roomId).emit('gamePhaseChanged', { phase: 'gameover', winner });
    } else {
      room.gamePhase = 'results';
      
      io.to(roomId).emit('votingResult', {
        eliminatedPlayer,
        voteCounts,
        alivePlayers: room.players.filter(p => p.isAlive)
      });
      
      // Start next round after delay
      setTimeout(() => {
        if (rooms[roomId]) {
          room.gamePhase = 'night';
          room.round++;
          room.mafiaTarget = null;
          room.votes = {};
          
          room.players.forEach(player => {
            if (player.isAlive) {
              io.to(player.id).emit('newRound', {
                round: room.round,
                allPlayers: room.players.map(p => ({ id: p.id, name: p.name, isAlive: p.isAlive }))
              });
            }
          });
          
          io.to(roomId).emit('gamePhaseChanged', { phase: 'night', round: room.round });
        }
      }, 5000);
    }
  }

  // Player disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove player from all rooms
    Object.keys(rooms).forEach(roomId => {
      const room = rooms[roomId];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('playerLeft', room.players);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
