const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = [];
let rooms = {};

// 카드 기본 데이터 정의
const CARD_LIST = [
    { id: 1, name: "재빠른 공격", cost: 86 },
    { id: 2, name: "재빠른 막기", cost: 91 },
    { id: 3, name: "자연의 순환", cost: 63 },
    { id: 4, name: "강력한 일격", cost: 203 },
    { id: 5, name: "달콤한 쿠키", cost: 30 },
    { id: 6, name: "신성한 회복", cost: 91 },
    { id: 7, name: "파인애플", cost: 0 },
    { id: 8, name: "거대한 방패", cost: 112 },
    { id: 9, name: "솟구치는 힘", cost: 133 },
    { id: 10, name: "솟구치는 마법", cost: 67 },
    { id: 11, name: "보물 발굴??", cost: 98 }
];

// 고정된 25장 테스트용 카드 더미 빌드 함수
function createTestDeck() {
    const composition = [
        { name: "재빠른 공격", count: 8 },
        { name: "재빠른 막기", count: 2 },
        { name: "강력한 일격", count: 3 },
        { name: "거대한 방패", count: 2 },
        { name: "달콤한 쿠키", count: 2 },
        { name: "파인애플", count: 2 },
        { name: "신성한 회복", count: 1 },
        { name: "솟구치는 힘", count: 1 },
        { name: "솟구치는 마법", count: 1 },
        { name: "보물 발굴??", count: 1 },
        { name: "자연의 순환", count: 2 }
    ];
    let deck = [];
    let idCounter = 1;
    composition.forEach(item => {
        const proto = CARD_LIST.find(c => c.name === item.name);
        for(let i=0; i<item.count; i++) {
            deck.push({ ...proto, instanceId: idCounter++ });
        }
    });
    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 차례 시작 시 자동 처리 로직
function processTurnStart(room, activePlayerId) {
    const p = room.players[activePlayerId];
    
    // 에너지 회복 및 한도 체크
    p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen);
    
    // 차례 시작 시 지속 효과 처리 구역
    room.globalEffectHistory.forEach(effect => {
        if (effect.owner === activePlayerId) {
            if (effect.type === '솟구치는 힘') {
                p.physAtk += 3;
            } else if (effect.type === '솟구치는 마법') {
                p.magPower += 5;
            } else if (effect.type === '보물 발굴??') {
                drawCards(p, 1);
            }
        }
    });

    // 기본 카드 3장 가져오기
    drawCards(p, 3);
    
    room.phase = "main";
}

function drawCards(player, count) {
    for(let i=0; i<count; i++) {
        if(player.deck.length === 0) {
            player.deck = shuffle([...player.graveyard]);
            player.graveyard = [];
        }
        if(player.deck.length > 0) {
            player.hand.push(player.deck.pop());
        }
    }
}

io.on('connection', (socket) => {
    socket.on('findMatch', () => {
        if (waitingPlayers.includes(socket.id)) return;
        waitingPlayers.push(socket.id);
        io.to(socket.id).emit('matching');

        if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift();
            const p2 = waitingPlayers.shift();
            const roomId = 'room_' + Date.now();

            rooms[roomId] = {
                id: roomId,
                players: {
                    [p1]: { 
                        hp: 2000, maxHp: 2000, 
                        energy: 300, maxEnergy: 600, 
                        physAtk: 63, magPower: 59,
                        physDef: 40, magDef: 35,
                        energyRegen: 200,
                        deck: [], hand: [], graveyard: []
                    },
                    [p2]: { 
                        hp: 2000, maxHp: 2000, 
                        energy: 300, maxEnergy: 600, 
                        physAtk: 63, magPower: 59,
                        physDef: 40, magDef: 35,
                        energyRegen: 200,
                        deck: [], hand: [], graveyard: []
                    }
                },
                playerIds: [p1, p2],
                turn: p1,
                phase: "main",
                globalEffectHistory: [] // 기록 구조 (History Queue)
            };

            rooms[roomId].playerIds.forEach(id => {
                rooms[roomId].players[id].deck = createTestDeck();
                drawCards(rooms[roomId].players[id], 4); // 시작 카드 4장
            });

            socket.join(roomId);
            io.sockets.sockets.get(p1)?.join(roomId);
            io.sockets.sockets.get(p2)?.join(roomId);

            // 첫 차례 처리 시작
            processTurnStart(rooms[roomId], p1);

            io.to(roomId).emit('gameStart', {
                roomId: roomId,
                gameState: rooms[roomId]
            });
        }
    });

    socket.on('playCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== "main") return;

        const player = room.players[socket.id];
        const targetId = room.playerIds.find(id => id !== socket.id);
        const target = room.players[targetId];

        const cardIndex = player.hand.findIndex(c => c.instanceId === instanceId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];
        if (player.energy < card.cost) {
            socket.emit('errorMessage', { message: "에너지가 부족합니다." });
            return;
        }

        player.energy -= card.cost;
        player.hand.splice(cardIndex, 1);

        let rawDmg = 0;
        let finalDmg = 0;

        switch(card.name) {
            case "재빠른 공격":
                rawDmg = Math.ceil(86 + (player.physAtk * 0.9));
                finalDmg = Math.ceil(rawDmg * (100 / (100 + target.physDef)));
                target.hp = Math.max(0, target.hp - finalDmg);
                player.graveyard.push(card);
                break;

            case "재빠른 막기":
                player.physDef += 31;
                player.magDef += 23;
                // 적용 시점의 정확한 증가 수치를 기록 구조에 저장
                room.globalEffectHistory.push({ 
                    type: '임시_복합_방어', 
                    owner: socket.id, 
                    target: targetId,
                    physAdded: 31,
                    magAdded: 23
                });
                player.graveyard.push(card);
                break;

            case "자연의 순환":
                player.energyRegen += 41;
                player.graveyard.push(card);
                break;

            case "강력한 일격":
                rawDmg = Math.ceil((player.physAtk * 1.25) + (player.magPower * 1.5));
                finalDmg = Math.ceil(rawDmg * (100 / (100 + target.magDef)));
                target.hp = Math.max(0, target.hp - finalDmg);
                player.graveyard.push(card);
                break;

            case "달콤한 쿠키":
                drawCards(player, 2);
                player.graveyard.push(card);
                break;

            case "신성한 회복":
                let healAmount = Math.ceil(30 + (player.magPower * 0.65));
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                player.graveyard.push(card);
                break;

            case "파인애플":
                player.energy = Math.min(player.maxEnergy, player.energy + 130);
                player.graveyard.push(card);
                break;

            case "거대한 방패":
                let physBuff = Math.ceil(10 + (player.magPower * 2.0));
                player.physDef += physBuff;
                // 계산된 정확한 수치를 기록 구조에 보관
                room.globalEffectHistory.push({ 
                    type: '임시_물리_방어', 
                    owner: socket.id, 
                    target: targetId,
                    physAdded: physBuff
                });
                player.graveyard.push(card);
                break;

            case "솟구치는 힘":
                room.globalEffectHistory.push({ type: '솟구치는 힘', owner: socket.id });
                player.graveyard.push(card);
                break;

            case "솟구치는 마법":
                room.globalEffectHistory.push({ type: '솟구치는 마법', owner: socket.id });
                player.graveyard.push(card);
                break;

            case "보물 발굴??":
                room.globalEffectHistory.push({ type: '보물 발굴??', owner: socket.id });
                player.graveyard.push(card);
                break;
            default:
                player.graveyard.push(card);
                break;
        }

        if (target.hp <= 0) {
            io.to(roomId).emit('gameOver', { winner: socket.id });
            delete rooms[roomId];
            return;
        }

        io.to(roomId).emit('cardPlayed', { gameState: room, lastPlayedCard: card, playerWhoPlayed: socket.id });
    });

    socket.on('endTurn', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== "main") return;

        const player = room.players[socket.id];
        const nextPlayerId = room.playerIds.find(id => id !== socket.id);

        // 차례 종료에 따른 임시 증가치 원상 복구 처리
        room.globalEffectHistory = room.globalEffectHistory.filter(effect => {
            if (effect.target === socket.id) {
                if (effect.type === '임시_복합_방어') {
                    room.players[effect.owner].physDef -= effect.physAdded;
                    room.players[effect.owner].magDef -= effect.magAdded;
                    return false;
                }
                if (effect.type === '임시_물리_방어') {
                    room.players[effect.owner].physDef -= effect.physAdded;
                    return false;
                }
            }
            return true;
        });

        // 보유 카드 수가 6장을 초과하는지 체크
        if (player.hand.length > 6) {
            room.phase = "discard";
            io.to(roomId).emit('mustDiscard', { gameState: room });
        } else {
            room.turn = nextPlayerId;
            processTurnStart(room, nextPlayerId);
            io.to(roomId).emit('updateState', { gameState: room });
        }
    });

    socket.on('discardCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== "discard") return;

        const player = room.players[socket.id];
        const cardIndex = player.hand.findIndex(c => c.instanceId === instanceId);
        
        if (cardIndex !== -1) {
            player.graveyard.push(player.hand[cardIndex]);
            player.hand.splice(cardIndex, 1);
        }

        if (player.hand.length <= 6) {
            const nextPlayerId = room.playerIds.find(id => id !== socket.id);
            room.turn = nextPlayerId;
            processTurnStart(room, nextPlayerId);
            io.to(roomId).emit('updateState', { gameState: room });
        } else {
            io.to(roomId).emit('mustDiscard', { gameState: room });
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(id => id !== socket.id);
        for (const roomId in rooms) {
            if (rooms[roomId].playerIds.includes(socket.id)) {
                const winnerId = rooms[roomId].playerIds.find(id => id !== socket.id);
                io.to(winnerId).emit('gameOver', { winner: winnerId, disconnect: true });
                delete rooms[roomId];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`서버가 포트 ${PORT}에서 작동 중입니다.`);
});