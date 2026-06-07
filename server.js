const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = [];
let rooms = {};
const delay = ms => new Promise(res => setTimeout(res, ms));

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
    { name: "쿠키 뺏어먹기", cost: 100, req: "enemyDrew", textTemplate: "전 턴에 상대가 카드의 효과로 드로우 했다면 이 카드를 사용할 수 있다. 카드를 2장 드로우 한다. 에너지를 150 회복한다.", type: "other" }
];

function getCard(name) { return CARD_DB.find(c => c.name === name); }
function shuffle(arr) { for(let i=arr.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i], arr[j]]=[arr[j], arr[i]]; } return arr; }

function drawCardsSystem(room, playerId, count) {
    const p = room.players[playerId];
    for(let i=0; i<count; i++) {
        if(p.hand.length >= 10) { io.to(playerId).emit('errorMessage', { message: "패가 가득 찼습니다!" }); break; }
        if(p.deck.length === 0) { p.deck = shuffle([...p.graveyard]); p.graveyard = []; }
        if(p.deck.length > 0) p.hand.push(p.deck.pop());
    }
}
function drawCardsEffect(room, playerId, count) {
    drawCardsSystem(room, playerId, count);
    room.players[playerId].stats.drewCard = true; // 효과 드로우 스탯 기록
}
function heal(p, amount) { p.hp = Math.min(70, p.hp + amount); p.stats.healAmount += amount; p.stats.healedFromCard = true; }
function payHP(p, amount) { p.hp -= amount; p.stats.hpPaidAmount += amount; }

// 데미지 처리 (A방식: 타격 단위로 치명타 선적용 후 감소)
function dealDamage(room, attackerId, defenderId, baseDmg, hits = 1) {
    let attacker = room.players[attackerId]; let defender = room.players[defenderId];
    for(let i=0; i<hits; i++) {
        let dmg = baseDmg + attacker.bonusDamage;
        let isCrit = false;
        if (attacker.critCharges > 0 || attacker.infiniteCrit) {
            dmg *= 2; isCrit = true;
            if(!attacker.infiniteCrit) attacker.critCharges--;
        }
        dmg = Math.max(0, dmg - defender.damageReduction);
        
        attacker.stats.hitsDealt++;
        if(isCrit) attacker.stats.dealtCrit = true;

        if (defender.shield >= dmg) { defender.shield -= dmg; dmg = 0; } 
        else { dmg -= defender.shield; defender.shield = 0; }
        
        defender.hp -= dmg;
        if(defender.hp <= 0) break;
    }
}

function startTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;
    room.globalTurnCount++;
    const p = room.players[room.turn];
    
    io.to(roomId).emit('phaseBanner', { type: 'TURN_CHANGE' });
    p.pulledStandbyThisTurn = false;
    p.shield = 0; // 통합 보호막 증발
    
    let drawCount = 5 - p.hand.length;
    if (drawCount > 0) drawCardsSystem(room, room.turn, drawCount); // 시스템 드로우 (효과 조건에 안 들어감)
    p.energy = 400; // 완전 회복
    
    room.phase = "main";
    io.to(roomId).emit('updateState', { gameState: room });
}

function endTurnSequence(roomId) {
    const room = rooms[roomId]; if(!room) return;
    room.phase = "processing";
    let p = room.players[room.turn]; let enemyId = room.playerIds.find(id => id !== room.turn); let enemy = room.players[enemyId];

    io.to(roomId).emit('phaseBanner', { type: 'TURN_OVER' });
    
    setTimeout(() => {
        if (p.hand.length > 5) {
            room.phase = "discard"; io.to(roomId).emit('updateState', { gameState: room });
        } else {
            // 치명타 및 턴스탯 정리
            p.critCharges = 0; p.infiniteCrit = false;
            enemy.lastTurnStats = { enemyDealtCrit: p.stats.dealtCrit, enemyHealed: p.stats.healedFromCard, enemyDrew: p.stats.drewCard };
            p.stats = { hitsDealt: 0, healAmount: 0, drewCard: false, hpPaidAmount: 0, dealtCrit: false, healedFromCard: false };
            room.turn = enemyId; startTurnSequence(roomId);
        }
    }, 500);
}

io.on('connection', (socket) => {
    socket.on('findMatch', (clientDeckConfig) => {
        waitingPlayers.push({ id: socket.id, deckConfig: clientDeckConfig });
        io.to(socket.id).emit('matching');

        if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift(); const p2 = waitingPlayers.shift();
            const roomId = 'room_' + Date.now();

            const initPlayer = (config) => {
                let deck = CARD_DB.filter(c => c.type === 'basic');
                let standby = [];
                config.standby.forEach(name => { for(let i=0; i<4; i++) standby.push(getCard(name)); });
                config.subStandby.forEach(name => standby.push(getCard(name)));
                
                let idCounter = 1;
                deck = deck.map(c => ({...c, instanceId: idCounter++}));
                standby = standby.map(c => ({...c, instanceId: idCounter++}));

                return {
                    hp: 70, energy: 400, bonusDamage: 0, damageReduction: 0, shield: 0,
                    critCharges: 0, infiniteCrit: false,
                    deck: shuffle(deck), standbyDeck: standby, hand: [], graveyard: [],
                    pulledStandbyThisTurn: false,
                    stats: { hitsDealt: 0, healAmount: 0, drewCard: false, hpPaidAmount: 0, dealtCrit: false, healedFromCard: false },
                    lastTurnStats: { enemyDealtCrit: false, enemyHealed: false, enemyDrew: false }
                };
            };

            rooms[roomId] = { id: roomId, players: { [p1.id]: initPlayer(p1.deckConfig), [p2.id]: initPlayer(p2.deckConfig) }, playerIds: [p1.id, p2.id], turn: p1.id, globalTurnCount: 0, phase: "init" };
            socket.join(roomId); io.sockets.sockets.get(p1.id)?.join(roomId); io.sockets.sockets.get(p2.id)?.join(roomId);
            io.to(roomId).emit('gameStart', { roomId, gameState: rooms[roomId] });
            startTurnSequence(roomId);
        }
    });

    socket.on('pullStandbyCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;
        const p = room.players[socket.id];
        if (p.pulledStandbyThisTurn) return;
        if (p.hand.length >= 10) return;
        const idx = p.standbyDeck.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) { p.hand.push(p.standbyDeck[idx]); p.standbyDeck.splice(idx, 1); p.pulledStandbyThisTurn = true; io.to(roomId).emit('updateState', { gameState: room }); }
    });

    socket.on('playCard', ({ roomId, instanceId, discardTargetIds }) => {
        const room = rooms[roomId]; if (!room || room.turn !== socket.id || room.phase !== "main") return;
        const p = room.players[socket.id]; const targetId = room.playerIds.find(id => id !== socket.id); const enemy = room.players[targetId];
        const cardIndex = p.hand.findIndex(c => c.instanceId === instanceId); if (cardIndex === -1) return;
        const card = p.hand[cardIndex];

        // 코스트 및 조건 검사
        if (p.energy < card.cost) return;
        if (card.hpCost && p.hp <= card.hpCost) return;
        if (card.discardCost && p.hand.length - 1 < card.discardCost) return;
        if (card.req === 'dealtCrit' && !p.stats.dealtCrit) return;
        if (card.req === 'drewCard' && !p.stats.drewCard) return;
        if (card.req === 'myShield' && p.shield <= 0) return;
        if (card.req === 'hpPaid' && p.stats.hpPaidAmount <= 0) return;
        if (card.req === 'enemyDealtCrit' && !p.lastTurnStats.enemyDealtCrit) return;
        if (card.req === 'enemyDrew' && !p.lastTurnStats.enemyDrew) return;

        // 코스트 지불
        if(card.hpCost) payHP(p, card.hpCost);
        if(card.discardCost && discardTargetIds) {
            discardTargetIds.forEach(tid => {
                const tIdx = p.hand.findIndex(c => c.instanceId === tid);
                if(tIdx !== -1) { p.graveyard.push(p.hand[tIdx]); p.hand.splice(tIdx, 1); }
            });
        }
        
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
            case "출혈 타격": dealDamage(room, socket.id, targetId, 10); if(p.lastTurnStats.enemyHealed) dealDamage(room, socket.id, targetId, 10); break;
            case "쿠키 뺏어먹기": drawCardsEffect(room, socket.id, 2); p.energy += 150; break;
        }

        const finalCardIndex = p.hand.findIndex(c => c.instanceId === instanceId);
        if(finalCardIndex !== -1) { p.energy -= card.cost; p.graveyard.push(p.hand[finalCardIndex]); p.hand.splice(finalCardIndex, 1); }

        if (enemy.hp <= 0) { io.to(roomId).emit('updateState', { gameState: room }); io.to(roomId).emit('gameOver', { winner: socket.id }); delete rooms[roomId]; return; }
        if (p.hp <= 0) { io.to(roomId).emit('updateState', { gameState: room }); io.to(roomId).emit('gameOver', { winner: targetId }); delete rooms[roomId]; return; }

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
        if (p.hand.length <= 5) { 
            p.critCharges = 0; p.infiniteCrit = false;
            let enemyId = room.playerIds.find(id => id !== socket.id); let enemy = room.players[enemyId];
            enemy.lastTurnStats = { enemyDealtCrit: p.stats.dealtCrit, enemyHealed: p.stats.healedFromCard, enemyDrew: p.stats.drewCard };
            p.stats = { hitsDealt: 0, healAmount: 0, drewCard: false, hpPaidAmount: 0, dealtCrit: false, healedFromCard: false };
            room.turn = enemyId; startTurnSequence(roomId);
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(p => p.id !== socket.id);
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