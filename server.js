const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = [];
let rooms = {};

const DECK_CARDS = [
    { name: "재빠른 일격", cost: 100, textTemplate: "상대에게 202 피해를 준다. 힘이 8 증가한다." },
    { name: "굳건한 수비", cost: 100, textTemplate: "자신이 다음 상대 턴이 종료할 때 까지 176 보호막을 얻는다. 인내가 9 증가한다." },
    { name: "침착한 판단", cost: 100, textTemplate: "다음 상대 턴이 종료할 때 까지 자신의 받는 피해 감소가 70 증가한다. 집중이 10 증가한다." },
    { name: "신속한 찌르기", cost: 100, textTemplate: "상대에게 120 피해를 2번 준다. 민첩이 7 증가한다." },
    { name: "신비로운 마법", cost: 100, textTemplate: "자신의 패가 이 카드를 제외하고 2장 이상일 때만 이 카드를 사용할 수 있다. 패의 카드를 2장 카드 무덤으로 보낸다. 덱에서 카드를 2장 뽑는다. 마력이 6 증가한다." }
];

const STANDBY_CARDS = [
    { name: "솟구치는 힘", cost: 50, textTemplate: "힘이 17 증가한다." },
    { name: "불굴의 인내심", cost: 50, textTemplate: "인내가 16 증가한다." },
    { name: "정신집중", cost: 50, textTemplate: "집중이 15 증가한다." },
    { name: "전력질주", cost: 50, textTemplate: "민첩이 18 증가한다." },
    { name: "마력 폭주", cost: 50, textTemplate: "마력이 19 증가한다." },
    { name: "묵직한 내려찍기", cost: 200, textTemplate: "상대에게 (151 + 힘 X 5) 의 피해를 준다. 자신이 다음 상대 턴이 종료할 때 까지 (인내 X 4) 보호막을 얻는다." },
    { name: "질풍의 치고 빠지기", cost: 200, textTemplate: "상대에게 (53 + 민첩 X 2) 의 피해를 3번 준다. 다음 상대 턴이 종료할 때 까지 자신의 받는 피해 감소가 (40 + 집중 X 1) 증가한다." },
    { name: "신성한 치유 마법", cost: 200, textTemplate: "자신이 (192 + 마력 X 6) 의 체력을 회복한다." },
    { name: "부드러움은 강함을 이긴다", cost: 150, textTemplate: "상대에게 (200 + 상대 힘 X 4) 피해를 준다." },
    { name: "방패 꿰뚫기", cost: 150, textTemplate: "다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 (100 + 상대 인내 X 3) 증가한다." },
    { name: "방해", cost: 150, textTemplate: "상대에게 (149 + 상대 집중 X 5) 피해를 준다." },
    { name: "탈진", cost: 150, textTemplate: "상대에게 (269 + 상대 민첩 X 3) 피해를 준다." },
    { name: "마력 흡수", cost: 150, textTemplate: "다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 (52 + 상대 마력 X 4) 증가한다." }
];

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function initDeckAndStandby() {
    let deck = []; let standby = []; let idCounter = 1;
    DECK_CARDS.forEach(card => {
        deck.push({ ...card, instanceId: idCounter++ }); deck.push({ ...card, instanceId: idCounter++ }); 
    });
    STANDBY_CARDS.forEach(card => { standby.push({ ...card, instanceId: idCounter++ }); });
    return { deck: shuffle(deck), standby };
}

function drawCards(room, playerId, count) {
    const player = room.players[playerId];
    for(let i=0; i<count; i++) {
        if(player.hand.length >= 10) {
            io.to(playerId).emit('errorMessage', { message: "패가 가득 찼습니다! (최대 10장)" }); break;
        }
        if(player.deck.length === 0) {
            player.deck = shuffle([...player.graveyard]); player.graveyard = [];
        }
        if(player.deck.length > 0) player.hand.push(player.deck.pop());
    }
    io.to(room.id).emit('updateState', { gameState: room });
}

function dealDamage(room, attackerId, defenderId, baseDmg, hits = 1) {
    let attacker = room.players[attackerId]; let defender = room.players[defenderId];
    for(let i=0; i<hits; i++) {
        let dmg = Math.max(0, baseDmg + attacker.bonusDamage - defender.damageReduction);
        for (let j = defender.shields.length - 1; j >= 0; j--) {
            if (dmg <= 0) break;
            let s = defender.shields[j];
            if (s.amount >= dmg) { s.amount -= dmg; dmg = 0; } 
            else { dmg -= s.amount; s.amount = 0; }
        }
        defender.shields = defender.shields.filter(s => s.amount > 0);
        defender.hp -= dmg;
        if(defender.hp <= 0) break;
    }
}

function addShield(room, playerId, amount, durationTurns) {
    room.players[playerId].shields.push({ amount: amount, expireTurn: room.globalTurnCount + durationTurns });
}

function queueEffect(room, targetPlayerId, executeFunc, expireTurn) {
    room.activeEffects.push({ target: targetPlayerId, execute: executeFunc, expireTurn: expireTurn });
}

function startTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;

    room.globalTurnCount++;
    const p = room.players[room.turn];
    p.pulledStandbyThisTurn = false;

    // 배너는 시각적으로만 흐르고(setTimeout), 게임 논리는 멈추지 않고 즉시 메인 단계로 진입합니다.
    io.to(roomId).emit('phaseBanner', { type: 'TURN_CHANGE' });
    
    if(room.globalTurnCount > 1) p.energy = Math.min(600, p.energy + p.energyRegen);
    let drawCount = 6 - p.hand.length;
    if (drawCount > 0) drawCards(room, room.turn, drawCount);

    room.phase = "main";
    io.to(roomId).emit('updateState', { gameState: room });
    
    setTimeout(() => { io.to(roomId).emit('phaseBanner', { type: 'MAIN_PHASE' }); }, 800);
}

function endTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;
    room.phase = "processing";

    let p = room.players[room.turn];
    let enemyId = room.playerIds.find(id => id !== room.turn);
    let enemy = room.players[enemyId];

    let expiringEffects = room.activeEffects.filter(eff => eff.expireTurn === room.globalTurnCount);
    let expiringShields = [...p.shields, ...enemy.shields].filter(s => s.expireTurn === room.globalTurnCount);

    if (expiringEffects.length > 0 || expiringShields.length > 0) {
        io.to(roomId).emit('phaseBanner', { type: 'END_PHASE' });
        room.activeEffects = room.activeEffects.filter(eff => {
            if(eff.expireTurn === room.globalTurnCount) { eff.execute(room); return false; }
            return true;
        });
        p.shields = p.shields.filter(s => s.expireTurn !== room.globalTurnCount);
        enemy.shields = enemy.shields.filter(s => s.expireTurn !== room.globalTurnCount);
    }

    setTimeout(() => {
        io.to(roomId).emit('phaseBanner', { type: 'TURN_OVER' });
        if (p.hand.length > 5) {
            room.phase = "discard";
            io.to(roomId).emit('updateState', { gameState: room }); 
        } else {
            room.turn = enemyId;
            startTurnSequence(roomId);
        }
    }, 500); // 아주 짧은 지연 시간만 부여
}

io.on('connection', (socket) => {
    socket.on('findMatch', () => {
        waitingPlayers.push(socket.id); io.to(socket.id).emit('matching');
        if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift(); const p2 = waitingPlayers.shift();
            const roomId = 'room_' + Date.now();

            const initPlayer = () => {
                const decks = initDeckAndStandby();
                return {
                    hp: 1500, energy: 600, energyRegen: 300, strength: 0, endurance: 0, focus: 0, agility: 0, magic: 0,
                    bonusDamage: 0, damageReduction: 0, shields: [], deck: decks.deck, standbyDeck: decks.standby, hand: [], graveyard: [],
                    pulledStandbyThisTurn: false
                };
            };

            rooms[roomId] = { id: roomId, players: { [p1]: initPlayer(), [p2]: initPlayer() }, playerIds: [p1, p2], turn: p1, globalTurnCount: 0, phase: "init", activeEffects: [] };

            socket.join(roomId); io.sockets.sockets.get(p1)?.join(roomId); io.sockets.sockets.get(p2)?.join(roomId);
            io.to(roomId).emit('gameStart', { roomId, gameState: rooms[roomId] });
            startTurnSequence(roomId);
        }
    });

    socket.on('pullStandbyCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;
        const p = room.players[socket.id];
        
        if (p.pulledStandbyThisTurn) return;
        if (p.hand.length >= 10) { socket.emit('errorMessage', { message: "패가 가득 차서 가져올 수 없습니다." }); return; }

        const idx = p.standbyDeck.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) {
            p.hand.push(p.standbyDeck[idx]); p.standbyDeck.splice(idx, 1);
            p.pulledStandbyThisTurn = true; io.to(roomId).emit('updateState', { gameState: room });
        }
    });

    socket.on('playCard', ({ roomId, instanceId, discardTargetIds }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;

        const p = room.players[socket.id]; const targetId = room.playerIds.find(id => id !== socket.id); const enemy = room.players[targetId];
        const cardIndex = p.hand.findIndex(c => c.instanceId === instanceId); if (cardIndex === -1) return;

        const card = p.hand[cardIndex];
        if (p.energy < card.cost) { socket.emit('errorMessage', { message: "에너지가 부족합니다." }); return; }

        if (card.name === "신비로운 마법") {
            if (!discardTargetIds || discardTargetIds.length !== 2) return;
            discardTargetIds.forEach(targetId => {
                const tIdx = p.hand.findIndex(c => c.instanceId === targetId);
                if (tIdx !== -1) { p.graveyard.push(p.hand[tIdx]); p.hand.splice(tIdx, 1); }
            });
            drawCards(room, socket.id, 2); p.magic += 6;
        } else {
            switch(card.name) {
                case "재빠른 일격": dealDamage(room, socket.id, targetId, 202); p.strength+=8; break;
                case "굳건한 수비": addShield(room, socket.id, 176, 1); p.endurance+=9; break;
                case "침착한 판단": p.damageReduction += 70; p.focus+=10; queueEffect(room, socket.id, (r) => { r.players[socket.id].damageReduction -= 70; }, room.globalTurnCount + 1); break;
                case "신속한 찌르기": dealDamage(room, socket.id, targetId, 120, 2); p.agility+=7; break;
                case "솟구치는 힘": p.strength += 17; break; case "불굴의 인내심": p.endurance += 16; break;
                case "정신집중": p.focus += 15; break; case "전력질주": p.agility += 18; break; case "마력 폭주": p.magic += 19; break;
                case "묵직한 내려찍기": dealDamage(room, socket.id, targetId, 151 + (p.strength*5)); addShield(room, socket.id, p.endurance*4, 1); break;
                case "질풍의 치고 빠지기": dealDamage(room, socket.id, targetId, 53 + (p.agility*2), 3); let r1 = 40 + p.focus; p.damageReduction += r1; queueEffect(room, socket.id, (r) => { r.players[socket.id].damageReduction -= r1; }, room.globalTurnCount + 1); break;
                case "신성한 치유 마법": p.hp = Math.min(1500, p.hp + 192 + (p.magic*6)); break;
                case "부드러움은 강함을 이긴다": dealDamage(room, socket.id, targetId, 200 + (enemy.strength*4)); break;
                case "방패 꿰뚫기": let b1 = 100 + (enemy.endurance*3); p.bonusDamage += b1; queueEffect(room, socket.id, (r) => { r.players[socket.id].bonusDamage -= b1; }, room.globalTurnCount + 1); break;
                case "방해": dealDamage(room, socket.id, targetId, 149 + (enemy.focus*5)); break;
                case "탈진": dealDamage(room, socket.id, targetId, 269 + (enemy.agility*3)); break;
                case "마력 흡수": let b2 = 52 + (enemy.magic*4); p.bonusDamage += b2; queueEffect(room, socket.id, (r) => { r.players[socket.id].bonusDamage -= b2; }, room.globalTurnCount + 1); break;
            }
        }

        const finalCardIndex = p.hand.findIndex(c => c.instanceId === instanceId);
        if(finalCardIndex !== -1) { p.energy -= card.cost; p.graveyard.push(p.hand[finalCardIndex]); p.hand.splice(finalCardIndex, 1); }

        if (room.players[targetId].hp <= 0) {
            io.to(roomId).emit('updateState', { gameState: room }); io.to(roomId).emit('gameOver', { winner: socket.id }); delete rooms[roomId]; return;
        }
        io.to(roomId).emit('updateState', { gameState: room });
    });

    socket.on('endTurn', ({ roomId }) => {
        if (rooms[roomId] && rooms[roomId].turn === socket.id && rooms[roomId].phase === "main") endTurnSequence(roomId);
    });

    socket.on('discardCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "discard") return;
        const p = room.players[socket.id]; const idx = p.hand.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) { p.graveyard.push(p.hand[idx]); p.hand.splice(idx, 1); }
        io.to(roomId).emit('updateState', { gameState: room });
        if (p.hand.length <= 5) { room.turn = room.playerIds.find(id => id !== socket.id); startTurnSequence(roomId); }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(id => id !== socket.id);
        for (const roomId in rooms) {
            if (rooms[roomId].playerIds.includes(socket.id)) {
                const winnerId = rooms[roomId].playerIds.find(id => id !== socket.id);
                io.to(winnerId).emit('gameOver', { winner: winnerId, disconnect: true }); delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`서버 작동 중 (포트 ${PORT})`));