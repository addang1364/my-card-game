const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayers = [];
let rooms = {};

const delay = ms => new Promise(res => setTimeout(res, ms));

// 신규 30종 카드 데이터베이스 (완벽 텍스트 매칭)
const CARD_LIST = [
    { name: "재빠른 일격", cost: 100, textTemplate: "상대에게 34 피해를 준다. 힘이 2 증가한다." },
    { name: "재빠른 막기", cost: 100, textTemplate: "자신이 다음 상대 턴이 종료할 때 까지 26 보호막을 얻는다. 힘이 1, 민첩이 1 증가한다." },
    { name: "재빠른 준비동작", cost: 100, textTemplate: "힘이 2, 집중이 1 증가한다." },
    { name: "재빠른 베어가르기", cost: 200, textTemplate: "상대에게 73 피해를 준다. 힘이 5 이상이면 인내가 3 증가한다." },
    { name: "굳건한 타격", cost: 100, textTemplate: "상대에게 28 피해를 준다. 인내가 1, 힘이 1 증가한다." },
    { name: "굳건한 수비", cost: 100, textTemplate: "다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 15 증가한다. 인내가 2 증가한다." },
    { name: "굳건한 의지", cost: 100, textTemplate: "인내가 2, 집중이 1 증가한다." },
    { name: "굳건한 방패 밀쳐내기", cost: 200, textTemplate: "상대에게 90 피해를 준다. 인내가 5 이상이면 집중이 3 증가한다." },
    { name: "침착한 공격", cost: 100, textTemplate: "상대에게 29 피해를 준다. 집중이 2 증가한다." },
    { name: "침착한 사격", cost: 100, textTemplate: "상대에게 40 피해를 준다. 힘이 1, 민첩이 1 증가한다." },
    { name: "침착한 판단", cost: 100, textTemplate: "집중이 2, 마력이 1 증가한다." },
    { name: "침착한 집중 사격", cost: 200, textTemplate: "상대에게 81 피해를 준다. 집중이 5 이상이면 민첩이 3 증가한다." },
    { name: "신속한 찌르기", cost: 100, textTemplate: "상대에게 38 피해를 준다. 민첩이 1, 마력이 1 증가한다." },
    { name: "신속한 기회 엿보기", cost: 100, textTemplate: "덱에서 카드를 1장 뽑는다. 민첩이 1, 인내가 1 증가한다." },
    { name: "신속한 달리기", cost: 100, textTemplate: "민첩이 3 증가한다." },
    { name: "신속한 연속 공격", cost: 200, textTemplate: "상대에게 78 피해를 준다. 민첩이 5 이상이면 힘이 3 증가한다." },
    { name: "신비로운 마법", cost: 100, textTemplate: "상대에게 32 피해를 준다. 마력이 2 증가한다." },
    { name: "신비로운 치유", cost: 100, textTemplate: "자신의 체력을 43 회복한다. 인내가 1, 마력이 1 증가한다." },
    { name: "신비로운 마력 방출", cost: 100, textTemplate: "마력이 2, 민첩이 1 증가한다." },
    { name: "신비로운 마법 폭주", cost: 200, textTemplate: "상대에게 85 피해를 준다. 마력이 5 이상이면 마력이 3 증가한다." },
    { name: "강력한 내려찍기", cost: 300, textTemplate: "상대에게 ???(힘 X 20) 피해를 준다." },
    { name: "강력한 마검 휘두르기", cost: 300, textTemplate: "상대에게 ???(80 + 힘 X 5 + 마력 X 5) 피해를 준다." },
    { name: "불굴의 막아내기", cost: 300, textTemplate: "자신이 다음 상대 턴이 종료할 때 까지 ???(인내 X 18) 보호막을 얻는다." },
    { name: "불굴의 받아치기", cost: 300, textTemplate: "자신이 다음 상대 턴이 종료할 때 까지 ???(60 + 인내 X 7) 보호막을 얻는다. 민첩이 8 이상이면 상대에게 80 피해를 준다." },
    { name: "초집중 목표 포착", cost: 300, textTemplate: "상대에게 ???(120 + 집중 8 이상이면 60) 피해를 준다." },
    { name: "초집중 공격 흘려내기", cost: 300, textTemplate: "자신이 다음 상대 턴이 종료할 때 까지 ???(집중 X 13) 보호막을 얻는다. 인내가 8 이상이면 덱에서 카드를 2장 뽑는다." },
    { name: "기민한 빈틈 노리기", cost: 300, textTemplate: "상대에게 ???(민첩 X 16) 피해를 준다. 덱에서 카드를 1장 뽑는다." },
    { name: "기민한 치고 빠지기", cost: 300, textTemplate: "다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 ???(10 + 민첩 X 1) 증가한다. 힘이 8 이상이면 상대에게 87 피해를 준다." },
    { name: "엄청난 불의 방패", cost: 300, textTemplate: "상대에게 ???(60 + 마력 X 7) 피해를 준다. 다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 15 증가한다." },
    { name: "엄청난 마력 집중", cost: 300, textTemplate: "상대에게 ???(마력 X 15 + 집중 X 8) 피해를 준다." }
];

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function createTestDeck() {
    let deck = [];
    let idCounter = 1;
    CARD_LIST.forEach(card => deck.push({ ...card, instanceId: idCounter++ }));
    return shuffle(deck);
}

function drawCards(room, playerId, count) {
    const player = room.players[playerId];
    for(let i=0; i<count; i++) {
        if(player.hand.length >= 8) {
            io.to(playerId).emit('errorMessage', { message: "패가 가득 찼습니다! (최대 8장)" });
            break;
        }
        if(player.deck.length === 0) {
            player.deck = shuffle([...player.graveyard]);
            player.graveyard = [];
        }
        if(player.deck.length > 0) player.hand.push(player.deck.pop());
    }
    io.to(room.id).emit('updateState', { gameState: room });
}

// 다단 히트 지원 대미지 함수 (LIFO 보호막 차감 적용)
function dealDamage(room, attackerId, defenderId, baseDmg, hits = 1) {
    let attacker = room.players[attackerId];
    let defender = room.players[defenderId];
    for(let i=0; i<hits; i++) {
        let dmg = Math.max(0, baseDmg + attacker.bonusDamage - defender.damageReduction);
        // LIFO: 배열 뒤쪽(최근)부터 차감
        for (let j = defender.shields.length - 1; j >= 0; j--) {
            if (dmg <= 0) break;
            let s = defender.shields[j];
            if (s.amount >= dmg) {
                s.amount -= dmg;
                dmg = 0;
            } else {
                dmg -= s.amount;
                s.amount = 0;
            }
        }
        defender.shields = defender.shields.filter(s => s.amount > 0);
        defender.hp -= dmg;
        if(defender.hp <= 0) break;
    }
}

function addShield(room, playerId, amount, durationTurns) {
    room.players[playerId].shields.push({
        amount: amount,
        expireTurn: room.globalTurnCount + durationTurns
    });
}

function queueEffect(room, executeFunc, expireTurn) {
    room.activeEffects.push({ execute: executeFunc, expireTurn: expireTurn });
}

async function startTurnSequence(roomId) {
    const room = rooms[roomId];
    if(!room) return;

    room.globalTurnCount++;
    const p = room.players[room.turn];

    // 1단계
    io.to(roomId).emit('phaseBanner', { type: 'TURN_CHANGE' });
    await delay(1000);
    
    if(room.globalTurnCount > 1) p.energy = Math.min(600, p.energy + p.energyRegen);
    drawCards(room, room.turn, room.globalTurnCount === 1 ? 3 : 2); // 시작 시 3장, 이후 2장
    await delay(1000);

    // 2단계 (시작 페이즈 효과 처리 공간 - 향후 확장)
    io.to(roomId).emit('phaseBanner', { type: 'START_PHASE' });
    await delay(1000);
    // TODO: 시작 효과 FIFO 처리 루프 구현
    await delay(1000);

    // 3단계
    room.phase = "main";
    io.to(roomId).emit('phaseBanner', { type: 'MAIN_PHASE' });
    io.to(roomId).emit('updateState', { gameState: room });
}

async function endTurnSequence(roomId) {
    const room = rooms[roomId];
    if(!room) return;
    room.phase = "processing";

    // 4단계
    io.to(roomId).emit('phaseBanner', { type: 'END_PHASE' });
    await delay(1000);
    
    // FIFO 효과 및 만료 처리 (내 보호막/버프 만료 등)
    let p = room.players[room.turn];
    let enemyId = room.playerIds.find(id => id !== room.turn);
    let enemy = room.players[enemyId];

    // 만료 턴이 현재 턴카운트와 일치하는 효과(버프 복구) 실행
    room.activeEffects = room.activeEffects.filter(eff => {
        if(eff.expireTurn === room.globalTurnCount) { eff.execute(room); return false; }
        return true;
    });

    // 보호막 만료 처리 (FIFO)
    p.shields = p.shields.filter(s => s.expireTurn !== room.globalTurnCount);
    enemy.shields = enemy.shields.filter(s => s.expireTurn !== room.globalTurnCount);
    io.to(roomId).emit('updateState', { gameState: room });
    await delay(1000);

    // 5단계
    io.to(roomId).emit('phaseBanner', { type: 'TURN_OVER' });
    await delay(1000);

    if (p.hand.length > 3) {
        room.phase = "discard";
        io.to(roomId).emit('requireDiscard', { count: p.hand.length - 3 });
    } else {
        room.turn = enemyId;
        startTurnSequence(roomId);
    }
}

io.on('connection', (socket) => {
    socket.on('findMatch', () => {
        waitingPlayers.push(socket.id);
        io.to(socket.id).emit('matching');

        if (waitingPlayers.length >= 2) {
            const p1 = waitingPlayers.shift();
            const p2 = waitingPlayers.shift();
            const roomId = 'room_' + Date.now();

            const initPlayer = () => ({
                hp: 700, energy: 600, energyRegen: 300,
                strength: 0, endurance: 0, focus: 0, agility: 0, magic: 0,
                bonusDamage: 0, damageReduction: 0,
                shields: [], deck: createTestDeck(), hand: [], graveyard: []
            });

            rooms[roomId] = {
                id: roomId,
                players: { [p1]: initPlayer(), [p2]: initPlayer() },
                playerIds: [p1, p2],
                turn: p1,
                globalTurnCount: 0,
                phase: "init",
                activeEffects: []
            };

            socket.join(roomId);
            io.sockets.sockets.get(p1)?.join(roomId);
            io.sockets.sockets.get(p2)?.join(roomId);

            io.to(roomId).emit('gameStart', { roomId, gameState: rooms[roomId] });
            startTurnSequence(roomId);
        }
    });

    socket.on('playCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== "main") return;

        const p = room.players[socket.id];
        const targetId = room.playerIds.find(id => id !== socket.id);
        const cardIndex = p.hand.findIndex(c => c.instanceId === instanceId);
        if (cardIndex === -1) return;

        const card = p.hand[cardIndex];
        if (p.energy < card.cost) {
            socket.emit('errorMessage', { message: "에너지가 부족합니다." });
            return;
        }

        p.energy -= card.cost;
        p.hand.splice(cardIndex, 1);
        p.graveyard.push(card);

        // 카드 효과 분기
        switch(card.name) {
            case "재빠른 일격": dealDamage(room, socket.id, targetId, 34); p.strength+=2; break;
            case "재빠른 막기": addShield(room, socket.id, 26, 1); p.strength+=1; p.agility+=1; break;
            case "재빠른 준비동작": p.strength+=2; p.focus+=1; break;
            case "재빠른 베어가르기": dealDamage(room, socket.id, targetId, 73); if(p.strength>=5) p.endurance+=3; break;
            case "굳건한 타격": dealDamage(room, socket.id, targetId, 28); p.endurance+=1; p.strength+=1; break;
            case "굳건한 수비": 
                p.damageReduction += 15;
                queueEffect(room, (r) => { r.players[socket.id].damageReduction -= 15; }, room.globalTurnCount + 1);
                p.endurance+=2; break;
            case "굳건한 의지": p.endurance+=2; p.focus+=1; break;
            case "굳건한 방패 밀쳐내기": dealDamage(room, socket.id, targetId, 90); if(p.endurance>=5) p.focus+=3; break;
            case "침착한 공격": dealDamage(room, socket.id, targetId, 29); p.focus+=2; break;
            case "침착한 사격": dealDamage(room, socket.id, targetId, 40); p.strength+=1; p.agility+=1; break;
            case "침착한 판단": p.focus+=2; p.magic+=1; break;
            case "침착한 집중 사격": dealDamage(room, socket.id, targetId, 81); if(p.focus>=5) p.agility+=3; break;
            case "신속한 찌르기": dealDamage(room, socket.id, targetId, 38); p.agility+=1; p.magic+=1; break;
            case "신속한 기회 엿보기": drawCards(room, socket.id, 1); p.agility+=1; p.endurance+=1; break;
            case "신속한 달리기": p.agility+=3; break;
            case "신속한 연속 공격": dealDamage(room, socket.id, targetId, 78); if(p.agility>=5) p.strength+=3; break;
            case "신비로운 마법": dealDamage(room, socket.id, targetId, 32); p.magic+=2; break;
            case "신비로운 치유": p.hp = Math.min(700, p.hp + 43); p.endurance+=1; p.magic+=1; break;
            case "신비로운 마력 방출": p.magic+=2; p.agility+=1; break;
            case "신비로운 마법 폭주": dealDamage(room, socket.id, targetId, 85); if(p.magic>=5) p.magic+=3; break;
            case "강력한 내려찍기": dealDamage(room, socket.id, targetId, p.strength*20); break;
            case "강력한 마검 휘두르기": dealDamage(room, socket.id, targetId, 80 + (p.strength*5) + (p.magic*5)); break;
            case "불굴의 막아내기": addShield(room, socket.id, p.endurance*18, 1); break;
            case "불굴의 받아치기": addShield(room, socket.id, 60 + (p.endurance*7), 1); if(p.agility>=8) dealDamage(room, socket.id, targetId, 80); break;
            case "초집중 목표 포착": dealDamage(room, socket.id, targetId, 120 + (p.focus>=8?60:0)); break;
            case "초집중 공격 흘려내기": addShield(room, socket.id, p.focus*13, 1); if(p.endurance>=8) drawCards(room, socket.id, 2); break;
            case "기민한 빈틈 노리기": dealDamage(room, socket.id, targetId, p.agility*16); drawCards(room, socket.id, 1); break;
            case "기민한 치고 빠지기": 
                let amt = 10 + p.agility; p.damageReduction += amt;
                queueEffect(room, (r) => { r.players[socket.id].damageReduction -= amt; }, room.globalTurnCount + 1);
                if(p.strength>=8) dealDamage(room, socket.id, targetId, 87); break;
            case "엄청난 불의 방패": 
                dealDamage(room, socket.id, targetId, 60 + (p.magic*7)); p.damageReduction += 15;
                queueEffect(room, (r) => { r.players[socket.id].damageReduction -= 15; }, room.globalTurnCount + 1);
                break;
            case "엄청난 마력 집중": dealDamage(room, socket.id, targetId, (p.magic*15) + (p.focus*8)); break;
        }

        if (room.players[targetId].hp <= 0) {
            io.to(roomId).emit('updateState', { gameState: room });
            io.to(roomId).emit('gameOver', { winner: socket.id });
            delete rooms[roomId];
            return;
        }

        io.to(roomId).emit('updateState', { gameState: room });
    });

    socket.on('endTurn', ({ roomId }) => {
        if (rooms[roomId] && rooms[roomId].turn === socket.id && rooms[roomId].phase === "main") {
            endTurnSequence(roomId);
        }
    });

    socket.on('discardCard', ({ roomId, instanceId }) => {
        const room = rooms[roomId];
        if (!room || room.turn !== socket.id || room.phase !== "discard") return;

        const p = room.players[socket.id];
        const idx = p.hand.findIndex(c => c.instanceId === instanceId);
        if (idx !== -1) {
            p.graveyard.push(p.hand[idx]);
            p.hand.splice(idx, 1);
        }

        io.to(roomId).emit('updateState', { gameState: room });
        if (p.hand.length <= 3) {
            room.turn = room.playerIds.find(id => id !== socket.id);
            startTurnSequence(roomId);
        }
    });

    socket.on('disconnect', () => {
        waitingPlayers = waitingPlayers.filter(id => id !== socket.id);
        for (const roomId in rooms) {
            if (rooms[roomId].playerIds.includes(socket.id)) {
                const winnerId = rooms[roomId].playerIds.find(id => id !== socket.id);
                io.to(winnerId).emit('gameOver', { winner: winnerId, disconnect: true });
                delete rooms[roomId];
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`서버 작동 중 (포트 ${PORT})`));