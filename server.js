const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// 매칭 시스템 구조 유지
let waitingPlayers = [];
let rooms = {};

// 카드 데이터 정의
const CARD_LIST = [
    { id: 1, name: "재빠른 공격", cost: 126 },
    { id: 2, name: "재빠른 막기", cost: 91 },
    { id: 3, name: "솟구치는 힘", cost: 167 },
    { id: 4, name: "자연의 순환", cost: 63 },
    { id: 5, name: "강력한 일격", cost: 203 },
    { id: 6, name: "달콤한 쿠키", cost: 18 },
    { id: 7, name: "불굴의 의지", cost: 75 },
    { id: 8, name: "신성한 회복", cost: 91 },
    { id: 9, name: "파인애플", cost: 0 }
];

// 고정된 23장 테스트 덱 빌드 함수
function createTestDeck() {
    const composition = [
        { name: "재빠른 공격", count: 6 },
        { name: "재빠른 막기", count: 4 },
        { name: "솟구치는 힘", count: 1 },
        { name: "자연의 순환", count: 2 },
        { name: "강력한 일격", count: 3 },
        { name: "달콤한 쿠키", count: 2 },
        { name: "불굴의 의지", count: 1 },
        { name: "신성한 회복", count: 2 },
        { name: "파인애플", count: 2 }
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

// 턴 시작 시 페이즈 1~4 자동 처리 함수
function processTurnStart(room, activePlayerId) {
    const p = room.players[activePlayerId];
    
    // 1단계: 체력 재생
    p.hp = Math.min(p.maxHp, p.hp + p.hpRegen);
    
    // 2단계: 에너지 재생
    p.energy = Math.min(p.maxEnergy, p.energy + p.energyRegen);
    
    // 3단계: 2장 드로우 (슬레이 더 스파이어 시스템)
    drawCards(p, 2);
    
    // 4단계: "내 턴이 시작할 때" 지속 효과 서순 처리
    // 글로벌 히스토리에 기록된 순서대로 효과 처리
    room.globalEffectHistory.forEach(effect => {
        if (effect.type === '솟구치는 힘' && effect.owner === activePlayerId) {
            p.atk += 32;
        }
    });
    
    room.phase = 5; // 메인 페이즈로 전환
}

function drawCards(player, count) {
    for(let i=0; i<count; i++) {
        if(player.deck.length === 0) {
            // 덱이 비어있으면 무덤을 섞어 덱으로 이동
            player.deck = shuffle([...player.graveyard]);
            player.graveyard = [];
        }
        if(player.deck.length > 0) {
            player.hand.push(player.deck.pop());
        }
    }
}

io.on('connection', (socket) => {
    console.log('유저 접속:', socket.id);

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
                        hp: 5000, maxHp: 5000, 
                        energy: 600, maxEnergy: 600, 
                        atk: 300, def: 100, 
                        hpRegen: 100, energyRegen: 200,
                        deck: [], hand: [], graveyard: []
                    },
                    [p2]: { 
                        hp: 5000, maxHp: 5000, 
                        energy: 600, maxEnergy: 600, 
                        atk: 300, def: 100, 
                        hpRegen: 100, energyRegen: 200,
                        deck: [], hand: [], graveyard: []
                    }
                },
                playerIds: [p1, p2],
                turn: p1,
                phase: 5,
                globalEffectHistory: [] // 효과 발동 서순 저장용 리스트
            };

            // 초기 덱 구성 및 4장 뽑기
            rooms[roomId].playerIds.forEach(id => {
                rooms[roomId].players[id].deck = createTestDeck();
                drawCards(rooms[roomId].players[id], 4);
            });

            socket.join(roomId);
            io.sockets.sockets.get(p1)?.join(roomId);
            io.sockets.sockets.get(p2)?.join(roomId);

            // 선공 플레이어 첫 턴 시작 처리
            processTurnStart(rooms[roomId], p1);

            io.to(roomId).emit('gameStart', {
                roomId: roomId,
                gameState: rooms[roomId]
            });
        }
    });

    socket.on('playCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== 5) return;

        const player = room.players[socket.id];
        const targetId = room.playerIds.find(id => id !== socket.id);
        const target = room.players[targetId];

        const cardIndex = player.hand.findIndex(c => c.instanceId === instanceId);
        if (cardIndex === -1) return;

        const card = player.hand[cardIndex];
        if (player.energy < card.cost) return; // 에너지 부족

        // 코스트 차감
        player.energy -= card.cost;
        player.hand.splice(cardIndex, 1);

        // 카드 효과 처리 (올림 연산 규칙 적용)
        let dmg = 0;
        switch(card.name) {
            case "재빠른 공격":
                dmg = Math.ceil(86 + (player.atk * 0.5));
                target.hp = Math.max(0, target.hp - Math.max(0, dmg - target.def));
                player.graveyard.push(card);
                break;
            case "재빠른 막기":
                player.def += 99;
                // 상대 턴 종료 시 롤백하기 위해 히스토리에 등록
                room.globalEffectHistory.push({ type: '재빠른 막기', owner: socket.id, target: targetId });
                player.graveyard.push(card);
                break;
            case "솟구치는 힘":
                room.globalEffectHistory.push({ type: '솟구치는 힘', owner: socket.id });
                player.graveyard.push(card);
                break;
            case "자연의 순환":
                player.hpRegen += 17;
                player.energyRegen += 28;
                player.graveyard.push(card);
                break;
            case "강력한 일격":
                dmg = Math.ceil(player.atk * 1.5);
                target.hp = Math.max(0, target.hp - Math.max(0, dmg - target.def));
                player.graveyard.push(card);
                break;
            case "달콤한 쿠키":
                drawCards(player, 2);
                player.graveyard.push(card);
                break;
            case "불굴의 의지":
                player.def += 23;
                player.graveyard.push(card);
                break;
            case "신성한 회복":
                player.hp = Math.min(player.maxHp, player.hp + 96);
                player.graveyard.push(card);
                break;
            case "파인애플":
                player.energy = Math.min(player.maxEnergy, player.energy + 130);
                player.graveyard.push(card);
                break;
        }

        // 승리 판정
        if (target.hp <= 0) {
            io.to(roomId).emit('gameOver', { winner: socket.id });
            delete rooms[roomId];
            return;
        }

        io.to(roomId).emit('cardPlayed', { gameState: room, lastPlayedCard: card, playerWhoPlayed: socket.id });
    });

    socket.on('endTurn', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== 5) return;

        room.phase = 6; // 6단계: 종료 페이즈 진입
        const player = room.players[socket.id];
        const nextPlayerId = room.playerIds.find(id => id !== socket.id);

        // "상대 턴이 종료할 때" 버프 해제 처리 (재빠른 막기 서순 처리)
        // 이번에 종료되는 턴이 '상대 턴'인 재빠른 막기 효과를 찾아 원상복구
        room.globalEffectHistory = room.globalEffectHistory.filter(effect => {
            if (effect.type === '재빠른 막기' && effect.target === socket.id) {
                room.players[effect.owner].def -= 99;
                return false; // 일회성이므로 목록에서 삭제
            }
            return true;
        });

        // 7단계: 패 매수 초과 검사 (6장 이상인 경우 클라이언트에서 버리기 선택 대기)
        if (player.hand.length > 5) {
            room.phase = 7;
            io.to(roomId).emit('mustDiscard', { gameState: room });
        } else {
            // 패가 5장 이하면 즉시 차례 교대 및 다음 사람 1~4단계 가동
            room.turn = nextPlayerId;
            processTurnStart(room, nextPlayerId);
            io.to(roomId).emit('updateState', { gameState: room });
        }
    });

    socket.on('discardCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== 7) return;

        const player = room.players[socket.id];
        const cardIndex = player.hand.findIndex(c => c.instanceId === instanceId);
        
        if (cardIndex !== -1) {
            player.graveyard.push(player.hand[cardIndex]);
            player.hand.splice(cardIndex, 1);
        }

        if (player.hand.length <= 5) {
            // 5장 이하 조건이 충족되면 상대방에게 턴 넘김
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
                const loserId = socket.id;
                const winnerId = rooms[roomId].playerIds.find(id => id !== loserId);
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