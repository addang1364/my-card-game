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
const phaseBadge = document.getElementById('phase-badge');

// 매칭 찾기 구조 유지
matchBtn.addEventListener('click', () => {
    socket.emit('findMatch');
});

socket.on('matching', () => {
    statusText.innerText = "상태: 다른 플레이어 매칭 중...";
    matchBtn.disabled = true;
});

socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId;
    myId = socket.id;
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateUI(gameState);
});

socket.on('updateState', ({ gameState }) => {
    updateUI(gameState);
});

socket.on('cardPlayed', ({ gameState, lastPlayedCard, playerWhoPlayed }) => {
    updateUI(gameState);
    
    // 사용된 카드를 3초간 화면 중앙 필드에 보여주기 처리
    const view = document.getElementById('recent-card-view');
    const textNode = document.getElementById('drop-zone-text');
    
    textNode.classList.add('hidden');
    view.classList.remove('hidden');
    view.innerHTML = `
        <div class="card-frame" style="transform:none; pointer-events:none; margin:auto;">
            <div class="card-cost-badge">${lastPlayedCard.cost}</div>
            <div class="card-name-label">${lastPlayedCard.name}</div>
            <div class="card-img-placeholder"></div>
            <div class="card-effect-text">발동됨</div>
        </div>
        <p style="font-size:11px; margin-top:5px; text-align:center;">${playerWhoPlayed === myId ? '내가' : '상대가'} 사용함</p>
    `;

    setTimeout(() => {
        view.classList.add('hidden');
        textNode.classList.remove('hidden');
    }, 3000);
});

socket.on('mustDiscard', ({ gameState }) => {
    updateUI(gameState);
    phaseBadge.innerText = "7단계: 패 버리기 필요 (5장 이하로)";
    phaseBadge.style.background = "#da3633";
    phaseBadge.style.color = "#fff";
});

socket.on('gameOver', ({ winner, disconnect }) => {
    if (disconnect) {
        alert("상대방의 연결이 끊어져 승리했습니다!");
    } else if (winner === myId) {
        alert("축하합니다! 상대의 라이프를 0으로 만들고 유희왕처럼 승리하셨습니다!");
    } else {
        alert("패배했습니다! 체력이 0 이하가 되었습니다.");
    }
    location.reload();
});

function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    
    const me = gameState.players[myId];
    const enemy = gameState.players[enemyId];

    // 내 스탯 정보 연동
    document.getElementById('my-hp-text').innerText = `${me.hp} / ${me.maxHp}`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / me.maxHp) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / ${me.maxEnergy}`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / me.maxEnergy) * 100}%`;
    
    document.getElementById('my-atk').innerText = me.atk;
    document.getElementById('my-def').innerText = me.def;
    document.getElementById('my-hpreg').innerText = me.hpRegen;
    document.getElementById('my-nrgreg').innerText = me.energyRegen;
    document.getElementById('my-deck-count').innerText = me.deck.length;

    // 상대 스탯 정보 연동
    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / ${enemy.maxHp}`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / enemy.maxHp) * 100}%`;
    document.getElementById('enemy-energy-text').innerText = `${enemy.energy} / ${enemy.maxEnergy}`;
    document.getElementById('enemy-energy-bar').style.width = `${(enemy.energy / enemy.maxEnergy) * 100}%`;
    
    document.getElementById('enemy-atk').innerText = enemy.atk;
    document.getElementById('enemy-def').innerText = enemy.def;
    document.getElementById('enemy-hpreg').innerText = enemy.hpRegen;
    document.getElementById('enemy-nrgreg').innerText = enemy.energyRegen;
    document.getElementById('enemy-hand-count').innerText = enemy.hand.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length;

    // 제어 버튼 갱신
    if (gameState.turn === myId && gameState.phase === 5) {
        endTurnBtn.classList.remove('hidden');
        phaseBadge.innerText = "5단계: 내 메인 페이즈";
        phaseBadge.style.background = "#238636";
    } else if (gameState.turn === myId && gameState.phase === 7) {
        endTurnBtn.classList.add('hidden');
    } else {
        endTurnBtn.classList.add('hidden');
        phaseBadge.innerText = "상대방 턴 진행 중...";
        phaseBadge.style.background = "#30363d";
    }

    // 카드 패 드로잉 및 드래그 바인딩
    myHand.innerHTML = "";
    me.hand.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-frame';
        cardEl.draggable = true;
        cardEl.dataset.instanceId = card.instanceId;

        // 계수 반영 동적 문구 파싱 (소수점 일의자리 무조건 올림 규칙 적용)
        let cleanText = "";
        let hoverText = "";

        if (card.name === "재빠른 공격") {
            let dmg = Math.ceil(86 + (me.atk * 0.5));
            cleanText = `상대에게 ${dmg} 만큼의 피해를 줍니다`;
            hoverText = `상대에게 (86 + 내 공격력의 50%) = ${dmg} 만큼의 피해를 줍니다`;
        } else if (card.name === "강력한 일격") {
            let dmg = Math.ceil(me.atk * 1.5);
            cleanText = `상대에게 ${dmg} 만큼의 피해를 줍니다`;
            hoverText = `상대에게 (내 공격력의 150%) = ${dmg} 만큼의 피해를 줍니다`;
        } else if (card.name === "재빠른 막기") {
            cleanText = `방어력이 99 증가합니다. 상대 턴 종료 시 99 감소합니다`;
            hoverText = cleanText;
        } else if (card.name === "솟구치는 힘") {
            cleanText = `앞으로 내 턴이 시작할 때 마다, 내 공격력이 32 증가합니다`;
            hoverText = cleanText;
        } else if (card.name === "자연의 순환") {
            cleanText = `내 체력재생이 17 증가하고, 내 에너지 재생이 28 증가합니다`;
            hoverText = cleanText;
        } else if (card.name === "달콤한 쿠키") {
            cleanText = `내 덱에서 카드를 2장 뽑습니다`;
            hoverText = cleanText;
        } else if (card.name === "불굴의 의지") {
            cleanText = `방어력이 23 증가합니다`;
            hoverText = cleanText;
        } else if (card.name === "신성한 회복") {
            cleanText = `내 체력을 96 회복합니다`;
            hoverText = cleanText;
        } else if (card.name === "파인애플") {
            cleanText = `내 에너지를 130 회복합니다`;
            hoverText = cleanText;
        }

        cardEl.innerHTML = `
            <div class="card-cost-badge">${card.cost}</div>
            <div class="card-name-label">${card.name}</div>
            <div class="card-img-placeholder"></div>
            <div id="text-${card.instanceId}" class="card-effect-text">${cleanText}</div>
        `;

        // 마우스 커서 호버링 이벤트 설정 (계수 툴팁 공식 출력 규칙)
        cardEl.addEventListener('mouseenter', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = hoverText;
        });
        cardEl.addEventListener('mouseleave', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = cleanText;
        });

        // HTML5 드래그 앤 드롭 핸들러 등록
        cardEl.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.instanceId);
        });

        // 패 버리기 페이즈일 경우 클릭만 해도 버려지도록 지원
        cardEl.addEventListener('click', () => {
            if (localGameState && localGameState.turn === myId && localGameState.phase === 7) {
                socket.emit('discardCard', { roomId: currentRoomId, instanceId: card.instanceId });
            }
        });

        myHand.appendChild(cardEl);
    });
}

// 드롭존 공간 인터랙션 이벤트 핸들링
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
    
    if (!localGameState || localGameState.turn !== myId || localGameState.phase !== 5) {
        alert("지금은 카드를 드래그하여 사용할 수 있는 단계가 아닙니다!");
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

// 나와 상대방의 카드 무덤 열기/닫기 팝업 UI 시스템
function openGraveyard(target) {
    if (!localGameState) return;
    const targetId = target === 'my' ? myId : localGameState.playerIds.find(id => id !== myId);
    const p = localGameState.players[targetId];

    document.getElementById('grave-title').innerText = `${target === 'my' ? '내' : '상대'} 카드 무덤 (${p.graveyard.length}장)`;
    const listEl = document.getElementById('grave-list');
    listEl.innerHTML = "";

    if (p.graveyard.length === 0) {
        listEl.innerHTML = "<p style='color:#8b949e; font-size:12px;'>버려진 카드가 없습니다.</p>";
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