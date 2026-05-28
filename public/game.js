const socket = io();

let currentRoomId = null;
let myId = null;
let localGameState = null;

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const matchBtn = document.getElementById('match-btn');
const statusText = document.getElementById('status-text');
const myHand = document.getElementById('my-hand');
const dropZone = document.getElementById('drop-zone');
const endTurnBtn = document.getElementById('end-turn-btn');
const turnBadge = document.getElementById('turn-badge');
const toastLayer = document.getElementById('toast-layer');

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    toastLayer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

matchBtn.addEventListener('click', () => {
    socket.emit('findMatch');
});

socket.on('matching', () => {
    statusText.innerText = "상태: 참여 대상을 찾고 있습니다...";
    matchBtn.disabled = true;
});

socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId;
    myId = socket.id;
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    showToast("조율 완료. 배틀을 시작합니다.");
    updateUI(gameState);
});

socket.on('updateState', ({ gameState }) => {
    updateUI(gameState);
});

socket.on('errorMessage', ({ message }) => {
    showToast(message);
});

socket.on('cardPlayed', ({ gameState, lastPlayedCard, playerWhoPlayed }) => {
    updateUI(gameState);
    
    const view = document.getElementById('recent-card-view');
    const textNode = document.getElementById('drop-zone-text');
    
    textNode.classList.add('hidden');
    view.classList.remove('hidden');
    view.innerHTML = `
        <div class="card-frame" style="transform:none; pointer-events:none; margin:auto;">
            <div class="card-cost-badge">${lastPlayedCard.cost}</div>
            <div class="card-name-label">${lastPlayedCard.name}</div>
            <img src="/${lastPlayedCard.image}" class="card-image-real" alt="${lastPlayedCard.name}">
            <div class="card-effect-text">발동</div>
        </div>
        <p style="font-size:11px; margin-top:5px; text-align:center;">${playerWhoPlayed === myId ? '내가' : '상대가'} 사용</p>
    `;

    setTimeout(() => {
        view.classList.add('hidden');
        textNode.classList.remove('hidden');
    }, 2000);
});

socket.on('mustDiscard', ({ gameState }) => {
    updateUI(gameState);
    turnBadge.innerText = "초과 카드 분해 필요 (6장 이하로)";
    turnBadge.style.background = "#da3633";
    turnBadge.style.color = "#fff";
    showToast("보유 카드가 허용치를 초과했습니다. 필요 없는 카드를 선택하여 반환하세요.");
});

socket.on('gameOver', ({ winner, disconnect }) => {
    if (disconnect) {
        showToast("상대방의 연결이 차단되어 승리했습니다.");
    } else if (winner === myId) {
        showToast("승리했습니다! 상대의 체력을 충족 조건 이하로 하락시켰습니다.");
    } else {
        showToast("체력이 모두 고갈되어 차단되었습니다.");
    }
    setTimeout(() => {
        location.reload();
    }, 4000);
});

function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    
    const me = gameState.players[myId];
    const enemy = gameState.players[enemyId];

    document.getElementById('my-hp-text').innerText = `${me.hp} / ${me.maxHp}`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / me.maxHp) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / ${me.maxEnergy}`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / me.maxEnergy) * 100}%`;
    
    document.getElementById('my-atk').innerText = me.physAtk;
    document.getElementById('my-power').innerText = me.magPower;
    document.getElementById('my-pdef').innerText = me.physDef;
    document.getElementById('my-mdef').innerText = me.magDef;
    document.getElementById('my-deck-count').innerText = me.deck.length;

    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / ${enemy.maxHp}`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
    document.getElementById('enemy-energy-text').innerText = `${enemy.energy} / ${enemy.maxEnergy}`;
    document.getElementById('enemy-energy-bar').style.width = `${(enemy.energy / enemy.maxEnergy) * 100}%`;
    
    document.getElementById('enemy-atk').innerText = enemy.physAtk;
    document.getElementById('enemy-power').innerText = enemy.magPower;
    document.getElementById('enemy-pdef').innerText = enemy.physDef;
    document.getElementById('enemy-mdef').innerText = enemy.magDef;
    document.getElementById('enemy-hand-count').innerText = enemy.hand.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length;

    const myPhysPercent = Math.ceil((100 / (100 + me.physDef)) * 100);
    const myMagPercent = Math.ceil((100 / (100 + me.magDef)) * 100);
    const enemyPhysPercent = Math.ceil((100 / (100 + enemy.physDef)) * 100);
    const enemyMagPercent = Math.ceil((100 / (100 + enemy.magDef)) * 100);

    document.getElementById('my-pdef-box').title = `받는 물리 피해: ${myPhysPercent}% (감소율: ${100 - myPhysPercent}%)`;
    document.getElementById('my-mdef-box').title = `받는 마법 피해: ${myMagPercent}% (감소율: ${100 - myMagPercent}%)`;
    document.getElementById('enemy-pdef-box').title = `받는 물리 피해: ${enemyPhysPercent}% (감소율: ${100 - enemyPhysPercent}%)`;
    document.getElementById('enemy-mdef-box').title = `받는 마법 피해: ${enemyMagPercent}% (감소율: ${100 - enemyMagPercent}%)`;

    if (gameState.turn === myId && gameState.phase === "main") {
        endTurnBtn.classList.remove('hidden');
        turnBadge.innerText = "내 차례";
        turnBadge.style.background = "#238636";
        turnBadge.style.color = "#fff";
    } else if (gameState.turn === myId && gameState.phase === "discard") {
        endTurnBtn.classList.add('hidden');
    } else {
        endTurnBtn.classList.add('hidden');
        turnBadge.innerText = "상대방 차례";
        turnBadge.style.background = "#30363d";
        turnBadge.style.color = "#8b949e";
    }

    myHand.innerHTML = "";
    me.hand.forEach(card => {
        const cardEl = document.createElement('div');
        
        if (me.energy >= card.cost) {
            cardEl.className = 'card-frame card-playable';
        } else {
            cardEl.className = 'card-frame card-unplayable';
        }
        
        cardEl.draggable = true;
        cardEl.dataset.instanceId = card.instanceId;

        let cleanText = "";
        let hoverText = "";

        if (card.name === "재빠른 공격") {
            let total = Math.ceil(86 + (me.physAtk * 0.9));
            cleanText = `물리 피해: ${total}`;
            hoverText = `공식: 86 + (물리 공격력 90%) = ${total} 물리 피해`;
        } else if (card.name === "강력한 일격") {
            let total = Math.ceil((me.physAtk * 1.25) + (me.magPower * 1.5));
            cleanText = `마법 피해: ${total}`;
            hoverText = `공식: (물리 공격력 125%) + (마력 150%) = ${total} 마법 피해`;
        } else if (card.name === "재빠른 막기") {
            cleanText = `물리 방어 +31 / 마법 방어 +23 (차례 종료시 소멸)`;
            hoverText = cleanText;
        } else if (card.name === "거대한 방패") {
            let total = Math.ceil(10 + (me.magPower * 2.0));
            cleanText = `물리 방어 +${total} (차례 종료시 소멸)`;
            hoverText = `공식: 10 + (마력 200%) = +${total} 물리 방어`;
        } else if (card.name === "자연의 순환") {
            cleanText = `에너지 재생 증가: +41`;
            hoverText = cleanText;
        } else if (card.name === "달콤한 쿠키") {
            cleanText = `카드 2장 추가 획득`;
            hoverText = cleanText;
        } else if (card.name === "신성한 회복") {
            let total = Math.ceil(30 + (me.magPower * 0.65));
            cleanText = `체력 회복: +${total}`;
            hoverText = `공식: 30 + (마력 65%) = +${total} 회복`;
        } else if (card.name === "파인애플") {
            cleanText = `에너지 회복: +130`;
            hoverText = cleanText;
        } else if (card.name === "솟구치는 힘") {
            cleanText = `매 차례 시작할 때 물리 공격력 +3 증가`;
            hoverText = cleanText;
        } else if (card.name === "솟구치는 마법") {
            cleanText = `매 차례 시작할 때 마력 +5 증가`;
            hoverText = cleanText;
        } else if (card.name === "보물 발굴??") {
            cleanText = `매 차례 시작할 때 추가 카드 +1장 획득`;
            hoverText = cleanText;
        }

        cardEl.innerHTML = `
            <div class="card-cost-badge">${card.cost}</div>
            <div class="card-name-label">${card.name}</div>
            <img src="/${card.image}" class="card-image-real" alt="${card.name}">
            <div id="text-${card.instanceId}" class="card-effect-text">${cleanText}</div>
        `;

        cardEl.addEventListener('mouseenter', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = hoverText;
        });
        cardEl.addEventListener('mouseleave', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = cleanText;
        });

        cardEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.instanceId);
        });

        cardEl.addEventListener('click', () => {
            if (localGameState && localGameState.turn === myId && localGameState.phase === "discard") {
                socket.emit('discardCard', { roomId: currentRoomId, instanceId: card.instanceId });
            }
        });

        myHand.appendChild(cardEl);
    });
}

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('hover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('hover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    
    if (!localGameState || localGameState.turn !== myId || localGameState.phase !== "main") {
        showToast("사용 가능한 타이밍이 아닙니다.");
        return;
    }

    const instanceId = parseInt(e.dataTransfer.getData('text/plain'));
    socket.emit('playCard', { roomId: currentRoomId, instanceId: instanceId });
});

endTurnBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('endTurn', { roomId: currentRoomId });
    }
});

function openGraveyard(target) {
    if (!localGameState) return;
    const targetId = target === 'my' ? myId : localGameState.playerIds.find(id => id !== myId);
    const p = localGameState.players[targetId];

    document.getElementById('grave-title').innerText = `${target === 'my' ? '내' : '상대'} 사용된 카드 목록 (${p.graveyard.length}장)`;
    const listEl = document.getElementById('grave-list');
    listEl.innerHTML = "";

    if (p.graveyard.length === 0) {
        listEl.innerHTML = "<p style='color:#8b949e; font-size:12px;'>기록이 존재하지 않습니다.</p>";
    } else {
        p.graveyard.forEach(card => {
            const item = document.createElement('div');
            item.className = 'grave-item';
            item.innerText = `[비용: ${card.cost}] ${card.name}`;
            listEl.appendChild(item);
        });
    }
    document.getElementById('grave-modal').classList.remove('hidden');
}

function closeGraveyard() {
    document.getElementById('grave-modal').classList.add('hidden');
}