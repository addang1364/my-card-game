const express = require('express');
const app = express();
const http = require('http').createServer(app);
// Socket.io 설정 (pingInterval 단축으로 튕김 감지 속도 향상)
const io = require('socket.io')(http, { pingTimeout: 5000, pingInterval: 3000 });
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = [];
let rooms = {};

// 카드 데이터베이스 (서버 공통)
const CARD_DB = [
    { name: "재빠른 일격", cost: 100, textTemplate: "10 피해를 준다.", type: "basic" },
    { name: "굳건한 수비", cost: 100, textTemplate: "9 보호막을 얻는다.", type: "basic" },
    { name: "연속 사격", cost: 100, textTemplate: "5 피해를 2번 준다.", type: "basic" },
    { name: "준비 태세", cost: 100, textTemplate: "4 피해를 준다. 내 다음 피해가 치명타가 된다.", type: "basic" },
    { name: "평범한 물약", cost: 100, textTemplate: "8 치유를 한다.", type: "basic" },
    { name: "신비로운 마법", cost: 100, discardCost: 1, textTemplate: "패를 1장 무덤으로 보내고 사용한다, 카드를 1장 드로우 한다.", type: "basic" },
    
    { name: "묵직한 일격", cost: 150, textTemplate: "17 피해를 준다.", type: "other" },
    { name: "강력한 일격", cost: 200, textTemplate: "25 피해를 준다.", type: "other" },
    { name: "굳건한 막기", cost: 150, textTemplate: "15 보호막을 얻는다.", type: "other" },
    { name: "굳건한 수호", cost: 200, textTemplate: "22 보호막을 얻는다.", type: "other" },
    { name: "연속 찌르기", cost: 100, textTemplate: "6 피해를 2번 준다.", type: "other" },
    { name: "연속 베기", cost: 150, textTemplate: "6 피해를 3번 준다.", type: "other" },
    { name: "연속 쌍검 난무", cost: 200, hpCost: 7, textTemplate: "7 체력지불을 하고 사용한다, 8 피해를 4번 준다.", type: "other" },
    { name: "치고 빠지기", cost: 100, textTemplate: "6 피해를 준다. 5 보호막을 얻는다.", type: "other" },
    { name: "피에 목마른 단검", cost: 100, textTemplate: "5 피해를 준다. 5 치유를 한다.", type: "other" },
    { name: "치유 베리어", cost: 150, textTemplate: "5 보호막을 얻는다. 9 치유를 한다.", type: "other" },
    { name: "피에 목마른 쌍검", cost: 150, textTemplate: "이번턴 상대에게 피해를 준 횟수만큼 5 치유를 한다.", type: "other" },
    { name: "치유 증폭", cost: 100, textTemplate: "이번 턴 자신이 치유를 한 만큼 치유한다.", type: "other" },
    { name: "치명적인 칼날", cost: 100, textTemplate: "내 다음 2번의 피해가 치명타가 된다.", type: "other" },
    { name: "치명적인 마법", cost: 150, textTemplate: "14 피해를 준다. 내 다음 피해가 치명타가 된다.", type: "other" },
    { name: "치명적인 악마와의 계약", cost: 200, hpCost: 12, textTemplate: "12 체력지불을 하고 사용한다, 이번턴 내 모든 피해가 치명타가 된다.", type: "other" },
    { name: "치명적인 마력 증폭", cost: 100, req: "dealtCrit", textTemplate: "이번 턴 자신이 치명타 피해를 줬다면 이 카드를 사용할 수 있다. 카드를 1장 드로우 한다. 에너지를 150 회복한다.", type: "other" },
    { name: "평범한 쿠키", cost: 150, textTemplate: "카드를 2장 드로우 한다.", type: "other" },
    { name: "평범한 비스킷", cost: 100, hpCost: 5, textTemplate: "5 체력지불을 하고 사용한다. 카드를 2장 드로우 한다.", type: "other" },
    { name: "쿠키와 비스킷", cost: 150, hpCost: 9, textTemplate: "9 체력지불을 하고 사용한다. 카드를 3장 드로우 한다.", type: "other" },
    { name: "드로우 스트라이크", cost: 150, req: "drewCard", textTemplate: "이번 턴 자신이 카드의 효과로 드로우 했다면 이 카드를 사용할 수 있다. 상대에게 26 피해를 준다.", type: "other" },
    { name: "간식과 같이먹을 우유", cost: 100, req: "drewCard", textTemplate: "이번턴 자신이 카드의 효과로 드로우 했다면 이 카드를 사용할 수 있다. 에너지를 200 회복한다.", type: "other" },
    { name: "방패 부수기", cost: 150, textTemplate: "상대의 보호막을 0 으로 만든다. 15 피해를 준다.", type: "other" },
    { name: "방패로 밀쳐내기", cost: 100, req: "myShield", textTemplate: "자신이 보호막을 보유하고 있다면 이 카드를 사용할 수 있다. 상대에게 16 피해를 준다.", type: "other" },
    { name: "불타는 복수심", cost: 150, req: "hpPaid", textTemplate: "이번 턴 자신이 카드의 효과로 체력지불을 했다면 이 카드를 사용할 수 있다. 이번 턴 자신이 체력지불을 한 3배 만큼의 피해를 준다.", type: "other" },
    { name: "치명적인 반사", cost: 200, req: "enemyDealtCrit", textTemplate: "전 턴에 상대가 치명타 피해를 줬다면 이 카드를 사용할 수 있다. 상대에게 10 피해를 3번 준다.", type: "other" },
    { name: "출혈 타격", cost: 100, textTemplate: "10 피해를 준다. 전 턴에 상대가 카드의 효과로 치유를 했다면 10 피해를 준다.", type: "other" },
    { name: "쿠키 뺏어먹기", cost: 100, req: "enemyDrew", textTemplate: "전 턴에 상대가 카드를 효과로 드로우 했다면 이 카드를 사용할 수 있다. 카드를 2장 드로우 한다. 에너지를 150 회복한다.", type: "other" }
];

// 유틸리티
function getCard(name) { return CARD_DB.find(c => c.name === name); }
function shuffle(arr) { for(let i=arr.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i], arr[j]]=[arr[j], arr[i]]; } return arr; }

// 드로우 시스템 (count장 드로우)
function drawCardsSystem(room, playerId, count) {
    const p = room.players[playerId]; if(!p) return;
    for(let i=0; i<count; i++) {
        if(p.hand.length >= 10) break; // 패 초과 방지
        if(p.deck.length === 0) {
            // 덱이 비었으면 무덤을 셔플하여 덱으로
            if(p.graveyard.length === 0) break; // 무덤도 비었으면 더이상 드로우 불가
            p.deck = shuffle([...p.graveyard]);
            p.graveyard = [];
        }
        p.hand.push(p.deck.pop()); // 덱 맨위 카드를 패로
    }
}
// 카드 효과에 의한 드로우 (스탯 업데이트 포함)
function drawCardsEffect(room, playerId, count) {
    drawCardsSystem(room, playerId, count);
    if(room.players[playerId]) room.players[playerId].stats.drewCard = true;
}

// 스탯 유틸
function heal(p, amount) { if(!p) return; p.hp = Math.min(70, p.hp + amount); p.stats.healAmount += amount; p.stats.healedFromCard = true; }
function payHP(p, amount) { if(!p) return; p.hp -= amount; p.stats.hpPaidAmount += amount; }

// 대미지 계산 시스템 (방어막 감소 포함)
function dealDamage(room, attackerId, defenderId, baseDmg, hits = 1) {
    let attacker = room.players[attackerId]; let defender = room.players[defenderId];
    if(!attacker || !defender) return;
    for(let i=0; i<hits; i++) {
        if(defender.hp <= 0) break;
        let dmg = baseDmg;
        // 크리티컬 적용
        if (attacker.critCharges > 0 || attacker.infiniteCrit) {
            dmg *= 2;
            attacker.stats.dealtCrit = true; // 통계 적용
            if(!attacker.infiniteCrit) attacker.critCharges--;
        }
        
        // 방어막 처리
        if (defender.shield >= dmg) { defender.shield -= dmg; dmg = 0; } 
        else { dmg -= defender.shield; defender.shield = 0; }
        
        defender.hp -= dmg; // 최종 체력 감소
        attacker.stats.hitsDealt++;
    }
}

// 🌟 [최종 수정] 턴 시작 로직: 버그 해결의 핵심 🌟
function startTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;
    const pId = room.turn;
    const p = room.players[pId]; if(!p) return;
    
    // 1. 배너 전송 (Banner만 전송, UpdateState와 분리)
    io.to(roomId).emit('phaseBanner', { type: 'TURN_CHANGE' });
    
    // 2. [🌟버그수정] 턴 시작 전 기존 스탯 완전 초기화 🌟
    p.critCharges = 0; p.infiniteCrit = false;
    p.stats = { hitsDealt: 0, healAmount: 0, drewCard: false, hpPaidAmount: 0, dealtCrit: false, healedFromCard: false };
    p.pulledStandbyThisTurn = false;
    p.shield = 0; // 방어막은 YGO style 턴 시작 시 제거
    p.energy = 400; // 에너지 충전
    
    // 3. [🌟버그수정] YGO Style 1장 드로우 (5장 채우기 아님) 🌟
    // 첫 턴 후공 드로우 구현 (선공 T1skip 필요시 로직추가, 현재는 양쪽 모두 턴시작시 Draw1)
    if (room.globalTurnCount >= 1) { // 첫 턴(T1 선공)은 시작 드로우 스킵
        drawCardsSystem(room, pId, 1);
    }
    room.globalTurnCount++;

    // 4. 메인 페이즈 돌입
    room.phase = "main";
    
    // 5. [🌟버그수정] 모든 스탯이 업데이트된 최종 State를 클라이언트로 전송 🌟
    io.to(roomId).emit('updateState', { gameState: room });
}

// 턴 종료 로직 (버리기 페이즈 포함)
function endTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;
    let p = room.players[room.turn]; if(!p) return;
    
    const enemyId = room.playerIds.find(id => id !== room.turn);
    const enemy = room.players[enemyId];

    // 1. 패 초과 검사 (YGO style: 5장)
    if (p.hand.length > 5) {
        room.phase = "discard";
        // 버리기 배너 생략 (드롭존 텍스트로 대체)
        io.to(roomId).emit('updateState', { gameState: room });
    } else {
        // 2. 초과 아니면 바로 턴 넘김 (Processing 페이즈 제거로 동기화 향상)
        proceedTurnTransition(room, enemyId);
    }
}

// 턴 실제 전환 (스탯 인계 & 배너 전송 & 다음턴 시작)
function proceedTurnTransition(room, nextPlayerId) {
    let p = room.players[room.turn]; // 현재 플레이어
    let nextPlayer = room.players[nextPlayerId]; // 다음 플레이어

    // [🌟버그수정] 턴 오버 배너 전송 🌟
    io.to(room.id).emit('phaseBanner', { type: 'TURN_OVER' });
    
    // 1. 스탯 인계 (YGO style)
    // 현재 플레이어의 통계를 상대의 lastTurnStats로 인계
    nextPlayer.lastTurnStats = { 
        enemyDealtCrit: p.stats.dealtCrit, 
        enemyHealed: p.stats.healedFromCard, 
        enemyDrew: p.stats.drewCard 
    };

    // 2. 턴 변경
    room.turn = nextPlayerId;
    
    // 3. 0.5초 대기 후 다음 턴 시작 (배너 가독성)
    setTimeout(() => startTurnSequence(room.id), 500);
}

// --- Socket Connection ---
io.on('connection', (socket) => {
    socket.on('findMatch', (clientDeckConfig) => {
        // 매칭 대기
        waitingPlayers.push({ id: socket.id, deckConfig: clientDeckConfig });
        io.to(socket.id).emit('matching');

        if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift(); const p2 = waitingPlayers.shift();
            const roomId = 'room_' + Date.now();

            // 플레이어 초기 스탯 생성 함수
            const initPlayer = (config) => {
                // 기본 카드 덱
                let deck = CARD_DB.filter(c => c.type === 'basic');
                // 스탠바이 풀 생성 (4장 복사 + 1장 sub)
                let standby = [];
                config.standby.forEach(name => { for(let i=0; i<4; i++) standby.push(getCard(name)); });
                config.subStandby.forEach(name => standby.push(getCard(name)));
                
                // 고유 instanceId 부여 (서버 로직 완결성)
                let idCounter = 1;
                deck = deck.map(c => ({...c, instanceId: idCounter++}));
                standby = standby.map(c => ({...c, instanceId: idCounter++}));

                return {
                    hp: 70, energy: 400, shield: 0, critCharges: 0, infiniteCrit: false,
                    deck: shuffle(deck), standbyDeck: standby, hand: [], graveyard: [],
                    pulledStandbyThisTurn: false,
                    // 통계 스탯
                    stats: { hitsDealt: 0, healAmount: 0, drewCard: false, hpPaidAmount: 0, dealtCrit: false, healedFromCard: false },
                    // 상대방 턴 정보 인계
                    lastTurnStats: { enemyDealtCrit: false, enemyHealed: false, enemyDrew: false }
                };
            };

            // 방 정보 초기화
            rooms[roomId] = { id: roomId, players: { [p1.id]: initPlayer(p1.deckConfig), [p2.id]: initPlayer(p2.deckConfig) }, playerIds: [p1.id, p2.id], turn: p1.id, globalTurnCount: 0, phase: "init" };
            socket.join(roomId); io.sockets.sockets.get(p1.id)?.join(roomId); io.sockets.sockets.get(p2.id)?.join(roomId);
            
            // 🌟 [🌟버그수정] 게임 시작 시 양쪽 모두 카드 5장 드로우 (선공후공 무관) 🌟
            drawCardsSystem(rooms[roomId], p1.id, 5);
            drawCardsSystem(rooms[roomId], p2.id, 5);

            io.to(roomId).emit('gameStart', { roomId, gameState: rooms[roomId] });
            // 1초 뒤 선공 턴 시작
            setTimeout(() => startTurnSequence(roomId), 1000);
        }
    });

    // 스탠바이 풀 드로우
    socket.on('pullStandbyCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;
        const p = room.players[socket.id];
        if (p.pulledStandbyThisTurn || p.hand.length >= 10) return;
        const idx = p.standbyDeck.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) { p.hand.push(p.standbyDeck[idx]); p.standbyDeck.splice(idx, 1); p.pulledStandbyThisTurn = true; io.to(roomId).emit('updateState', { gameState: room }); }
    });

    // 카드 사용
    socket.on('playCard', ({ roomId, instanceId, discardTargetIds }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;
        const p = room.players[socket.id]; const targetId = room.playerIds.find(id => id !== socket.id); const enemy = room.players[targetId];
        const cardIndex = p.hand.findIndex(c => c.instanceId === instanceId); if (cardIndex === -1) return;
        const card = p.hand[cardIndex];

        // 조건 검사
        if (p.energy < card.cost) return;
        if (card.hpCost && p.hp <= card.hpCost) return;
        if (card.discardCost && (!discardTargetIds || p.hand.length - 1 < card.discardCost)) return;
        // 요구 조건 검사
        if (card.req === 'dealtCrit' && !p.stats.dealtCrit) return;
        if (card.req === 'drewCard' && !p.stats.drewCard) return;
        if (card.req === 'myShield' && p.shield <= 0) return;
        if (card.req === 'hpPaid' && p.stats.hpPaidAmount <= 0) return;
        if (card.req === 'enemyDealtCrit' && !p.lastTurnStats.enemyDealtCrit) return;
        if (card.req === 'enemyDrew' && !p.lastTurnStats.enemyDrew) return;

        // 비용 지불
        if(card.hpCost) payHP(p, card.hpCost);
        if(card.discardCost && discardTargetIds) {
            discardTargetIds.forEach(tid => {
                const tIdx = p.hand.findIndex(c => c.instanceId === tid);
                if(tIdx !== -1) { p.graveyard.push(p.hand[tIdx]); p.hand.splice(tIdx, 1); }
            });
        }
        
        // 카드 효과 처리 (공격 로직 등)
        switch(card.name) {
            case "재빠른 일격": dealDamage(room, socket.id, targetId, 10); break;
            case "굳건한 수비": p.shield += 9; break;
            case "연속 사격": dealDamage(room, socket.id, targetId, 5, 2); break;
            case "준비 태세": dealDamage(room, socket.id, targetId, 4); p.critCharges++; break;
            case "평범한 물약": heal(p, 8); break;
            case "신비로운 마법": drawCardsEffect(room, socket.id, 1); break;
            case "묵직한 일격": dealDamage(room, socket.id, targetId, 17); break;
            case "강력한 일격": dealDamage(room, socket.id, targetId, 25); break;
            case "굳건한 막기": p.shield += 15; break;
            case "굳건한 수호": p.shield += 22; break;
            case "연속 찌르기": dealDamage(room, socket.id, targetId, 6, 2); break;
            case "연속 베기": dealDamage(room, socket.id, targetId, 6, 3); break;
            case "연속 쌍검 난무": dealDamage(room, socket.id, targetId, 8, 4); break;
            case "치고 빠지기": dealDamage(room, socket.id, targetId, 6); p.shield += 5; break;
            case "피에 목마른 단검": dealDamage(room, socket.id, targetId, 5); heal(p, 5); break;
            case "치유 베리어": p.shield += 5; heal(p, 9); break;
            case "피에 목마른 쌍검": for(let i=0; i<p.stats.hitsDealt; i++) heal(p, 5); break;
            case "치유 증폭": heal(p, p.stats.healAmount); break;
            case "치명적인 칼날": p.critCharges += 2; break;
            case "치명적인 마법": dealDamage(room, socket.id, targetId, 14); p.critCharges++; break;
            case "치명적인 악마와의 계약": p.infiniteCrit = true; break;
            case "치명적인 마력 증폭": drawCardsEffect(room, socket.id, 1); p.energy += 150; break;
            case "평범한 쿠키": drawCardsEffect(room, socket.id, 2); break;
            case "평범한 비스킷": drawCardsEffect(room, socket.id, 2); break;
            case "쿠키와 비스킷": drawCardsEffect(room, socket.id, 3); break;
            case "드로우 스트라이크": dealDamage(room, socket.id, targetId, 26); break;
            case "간식과 같이먹을 우유": p.energy += 200; break;
            case "방패 부수기": enemy.shield = 0; dealDamage(room, socket.id, targetId, 15); break;
            case "방패로 밀쳐내기": dealDamage(room, socket.id, targetId, 16); break;
            case "불타는 복수심": dealDamage(room, socket.id, targetId, p.stats.hpPaidAmount * 3); break;
            case "치명적인 반사": dealDamage(room, socket.id, targetId, 10, 3); break;
            case "출혈 타격": dealDamage(room, socket.id, targetId, 10); if(nextPlayer.lastTurnStats.enemyHealed) dealDamage(room, socket.id, targetId, 10); break;
            case "쿠키 뺏어먹기": drawCardsEffect(room, socket.id, 2); p.energy += 150; break;
        }

        // 사용한 카드 패에서 제거 및 비용 차감
        // 버리기 효과로 패가 변했을 수 있으므로 다시 index를 찾음
        const finalCardIndex = p.hand.findIndex(c => c.instanceId === instanceId);
        if(finalCardIndex !== -1) { p.energy -= card.cost; p.graveyard.push(p.hand[finalCardIndex]); p.hand.splice(finalCardIndex, 1); }

        // 체력 검사 (게임 종료)
        if (enemy.hp <= 0) { io.to(roomId).emit('updateState', { gameState: room }); gameOver(roomId, socket.id); return; }
        if (p.hp <= 0) { io.to(roomId).emit('updateState', { gameState: room }); gameOver(roomId, targetId); return; }

        io.to(roomId).emit('updateState', { gameState: room });
    });

    // 차례 종료 신청
    socket.on('endTurn', ({ roomId }) => {
        if (rooms[roomId] && rooms[roomId].turn === socket.id && rooms[roomId].phase === "main") endTurnSequence(roomId);
    });

    // 패 버리기 처리
    socket.on('discardCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "discard") return;
        const p = room.players[socket.id]; const idx = p.hand.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) { p.graveyard.push(p.hand[idx]); p.hand.splice(idx, 1); }
        io.to(roomId).emit('updateState', { gameState: room });
        if (p.hand.length <= 5) { proceedTurnTransition(room, room.playerIds.find(id => id !== socket.id)); }
    });

    // 연결 끊김 처리 (상대방 끊김 시 승리)
    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
        for (const roomId in rooms) {
            if (rooms[roomId].playerIds.includes(socket.id)) {
                const winnerId = rooms[roomId].playerIds.find(id => id !== socket.id);
                // 🌟 [🌟버그수정] 즉시  Banner와 State를 보내 게임 종료 알림 🌟
                io.to(roomId).emit('phaseBanner', { type: 'TURN_OVER' }); // 애니메이션 대기용
                // 튕긴 사람 외 플레이어에게 disconnect 승리 알림
                gameOver(roomId, winnerId, true);
                break;
            }
        }
    });
});

// 게임 종료 처리 (메모리 정리)
function gameOver(roomId, winnerId, isDisconnect = false) {
    if(!rooms[roomId]) return;
    io.to(roomId).emit('gameOver', { winner: winnerId, disconnect: isDisconnect });
    // 메모리 누수 방지
    delete rooms[roomId];
}

// 서버 시작
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`tcg 서버 작동 중 (포트 ${PORT})`));