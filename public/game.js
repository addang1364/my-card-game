const socket = io();

let currentRoomId = null;
let myId = null;
let localGameState = null;
let isMyTurnProcessing = false;
let discardRequiredCount = 0;

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const matchBtn = document.getElementById('match-btn');
const toastLayer = document.getElementById('toast-layer');
const bannerLayer = document.getElementById('banner-layer');
const bannerText = document.getElementById('banner-text');

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    toastLayer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showBanner(text, duration = 1000) {
    bannerText.innerText = text;
    bannerLayer.classList.remove('hidden');
    setTimeout(() => {
        bannerLayer.classList.add('hidden');
    }, duration);
}

matchBtn.addEventListener('click', () => socket.emit('findMatch'));

socket.on('matching', () => {
    document.getElementById('status-text').innerText = "매칭 중...";
    matchBtn.disabled = true;
});

socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId;
    myId = socket.id;
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    updateUI(gameState);
});

socket.on('updateState', ({ gameState }) => { updateUI(gameState); });
socket.on('errorMessage', ({ message }) => { showToast(message); });

socket.on('phaseBanner', ({ type }) => {
    const texts = {
        'TURN_CHANGE': "Turn Change!!",
        'START_PHASE': localGameState.turn === myId ? "내 턴 시작 - 카드 효과 처리 진행" : "상대 턴 시작 - 카드 효과 처리 진행",
        'MAIN_PHASE': localGameState.turn === myId ? "카드를 사용하세요!!" : "상대방이 카드를 사용 중입니다",
        'END_PHASE': localGameState.turn === myId ? "내 턴 종료 - 카드 효과 처리 진행" : "상대 턴 종료 - 카드 효과 처리 진행",
        'TURN_OVER': "Turn Over"
    };
    if (texts[type]) showBanner(texts[type]);
    
    // UI 상태 갱신
    if (type === 'MAIN_PHASE' && localGameState.turn === myId) {
        document.getElementById('end-turn-btn').classList.remove('hidden');
        document.getElementById('drop-zone-text').innerHTML = "카드를 이곳에 사용하세요";
    } else {
        document.getElementById('end-turn-btn').classList.add('hidden');
    }
});

socket.on('requireDiscard', ({ count }) => {
    discardRequiredCount = count;
    document.getElementById('drop-zone-text').innerHTML = `<span style="color:#f85149; font-weight:bold;">패가 초과되었습니다!<br>${count}장을 이곳에 버려주세요.</span>`;
});

socket.on('gameOver', ({ winner, disconnect }) => {
    setTimeout(() => {
        if (disconnect) showBanner("상대방 연결 끊김! 승리!", 4000);
        else if (winner === myId) showBanner("승 리 !!", 4000);
        else showBanner("패 배 ..", 4000);
        setTimeout(() => location.reload(), 4000);
    }, 1000);
});

// 동적 텍스트 계산기 (서버 공식과 동일)
function getDynamicText(card, me, enemy, isHovered) {
    let dmgBonus = me.bonusDamage || 0;
    let reduc = enemy.damageReduction || 0;
    
    function calc(rawBase, rawAdd = 0, conditionMet = false) {
        let final1 = Math.max(0, (rawBase + dmgBonus) - reduc);
        let leftReduc = Math.max(0, reduc - (rawBase + dmgBonus));
        let final2 = Math.max(0, rawAdd - leftReduc);
        
        let display = final1.toString();
        if (conditionMet && rawAdd > 0) display += ` + ${final2}`;
        return display;
    }

    switch(card.name) {
        case "강력한 내려찍기":
            let d1 = me.strength * 20;
            return isHovered ? `상대에게 ${calc(d1)}(힘 X 20) 피해를 준다.` : `상대에게 ${calc(d1)} 피해를 준다.`;
        case "강력한 마검 휘두르기":
            let d2 = 80 + (me.strength * 5) + (me.magic * 5);
            return isHovered ? `상대에게 ${calc(d2)}(80 + 힘 X 5 + 마력 X 5) 피해를 준다.` : `상대에게 ${calc(d2)} 피해를 준다.`;
        case "불굴의 막아내기":
            let s1 = me.endurance * 18;
            return isHovered ? `자신이 다음 상대 턴이 종료할 때 까지 ${s1}(인내 X 18) 보호막을 얻는다.` : `자신이 다음 상대 턴이 종료할 때 까지 ${s1} 보호막을 얻는다.`;
        case "불굴의 받아치기":
            let s2 = 60 + (me.endurance * 7);
            let p1 = `자신이 다음 상대 턴이 종료할 때 까지 ${s2}(60 + 인내 X 7) 보호막을 얻는다.`;
            if (!isHovered) p1 = `자신이 다음 상대 턴이 종료할 때 까지 ${s2} 보호막을 얻는다.`;
            return p1 + ` 민첩이 8 이상이면 상대에게 ${calc(80)} 피해를 준다.`;
        case "초집중 목표 포착":
            return isHovered ? `상대에게 ${calc(120, 60, me.focus >= 8)}(120 + 집중 8 이상이면 60) 피해를 준다.` : `상대에게 ${calc(120, 60, me.focus >= 8)} 피해를 준다.`;
        case "초집중 공격 흘려내기":
            let s3 = me.focus * 13;
            let p2 = isHovered ? `자신이 다음 상대 턴이 종료할 때 까지 ${s3}(집중 X 13) 보호막을 얻는다.` : `자신이 다음 상대 턴이 종료할 때 까지 ${s3} 보호막을 얻는다.`;
            return p2 + ` 인내가 8 이상이면 덱에서 카드를 2장 뽑는다.`;
        case "기민한 빈틈 노리기":
            return isHovered ? `상대에게 ${calc(me.agility * 16)}(민첩 X 16) 피해를 준다. 덱에서 카드를 1장 뽑는다.` : `상대에게 ${calc(me.agility * 16)} 피해를 준다. 덱에서 카드를 1장 뽑는다.`;
        case "기민한 치고 빠지기":
            let r1 = 10 + (me.agility * 1);
            let p3 = isHovered ? `다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 ${r1}(10 + 민첩 X 1) 증가한다.` : `다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 ${r1} 증가한다.`;
            return p3 + ` 힘이 8 이상이면 상대에게 ${calc(87)} 피해를 준다.`;
        case "엄청난 불의 방패":
            let d3 = 60 + (me.magic * 7);
            return isHovered ? `상대에게 ${calc(d3)}(60 + 마력 X 7) 피해를 준다. 다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 15 증가한다.` : `상대에게 ${calc(d3)} 피해를 준다. 다음 상대 턴이 종료할 때 까지 자신이 받는 피해 감소가 15 증가한다.`;
        case "엄청난 마력 집중":
            let d4 = (me.magic * 15) + (me.focus * 8);
            return isHovered ? `상대에게 ${calc(d4)}(마력 X 15 + 집중 X 8) 피해를 준다.` : `상대에게 ${calc(d4)} 피해를 준다.`;
        case "재빠른 일격": return `상대에게 ${calc(34)} 피해를 준다. 힘이 2 증가한다.`;
        case "재빠른 베어가르기": return `상대에게 ${calc(73)} 피해를 준다. 힘이 5 이상이면 인내가 3 증가한다.`;
        case "굳건한 타격": return `상대에게 ${calc(28)} 피해를 준다. 인내가 1, 힘이 1 증가한다.`;
        case "굳건한 방패 밀쳐내기": return `상대에게 ${calc(90)} 피해를 준다. 인내가 5 이상이면 집중이 3 증가한다.`;
        case "침착한 공격": return `상대에게 ${calc(29)} 피해를 준다. 집중이 2 증가한다.`;
        case "침착한 사격": return `상대에게 ${calc(40)} 피해를 준다. 힘이 1, 민첩이 1 증가한다.`;
        case "침착한 집중 사격": return `상대에게 ${calc(81)} 피해를 준다. 집중이 5 이상이면 민첩이 3 증가한다.`;
        case "신속한 찌르기": return `상대에게 ${calc(38)} 피해를 준다. 민첩이 1, 마력이 1 증가한다.`;
        case "신속한 연속 공격": return `상대에게 ${calc(78)} 피해를 준다. 민첩이 5 이상이면 힘이 3 증가한다.`;
        case "신비로운 마법": return `상대에게 ${calc(32)} 피해를 준다. 마력이 2 증가한다.`;
        case "신비로운 마법 폭주": return `상대에게 ${calc(85)} 피해를 준다. 마력이 5 이상이면 마력이 3 증가한다.`;
        default: return card.textTemplate;
    }
}

function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    const me = gameState.players[myId];
    const enemy = gameState.players[enemyId];

    // 스탯 바 업데이트
    document.getElementById('my-hp-text').innerText = `${me.hp} / 700`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / 700) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / 600`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / 600) * 100}%`;

    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / 700`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / 700) * 100}%`;

    // 신규 RPG 스탯 업데이트
    document.getElementById('stat-str').innerText = me.strength;
    document.getElementById('stat-end').innerText = me.endurance;
    document.getElementById('stat-foc').innerText = me.focus;
    document.getElementById('stat-agi').innerText = me.agility;
    document.getElementById('stat-mag').innerText = me.magic;
    document.getElementById('stat-add-dmg').innerText = me.bonusDamage;
    document.getElementById('stat-red-dmg').innerText = me.damageReduction;
    document.getElementById('stat-regen').innerText = me.energyRegen;

    document.getElementById('my-deck-count').innerText = me.deck.length;
    document.getElementById('my-grave-count').innerText = me.graveyard.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length;
    document.getElementById('enemy-grave-count').innerText = enemy.graveyard.length;

    // 보호막 렌더링 (LIFO 시각화: 가장 뒤에 있는 배열 요소가 가장 최근)
    function renderShields(targetId, arr) {
        const container = document.getElementById(targetId);
        container.innerHTML = "";
        arr.forEach(s => {
            const badge = document.createElement('div');
            badge.className = 'shield-badge';
            badge.innerText = s.amount;
            container.appendChild(badge);
        });
    }
    renderShields('my-shields', me.shields);
    renderShields('enemy-shields', enemy.shields);

    // 내 손패 렌더링
    const myHand = document.getElementById('my-hand');
    myHand.innerHTML = "";
    me.hand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = `card-frame ${me.energy >= card.cost ? 'card-playable' : 'card-unplayable'}`;
        cardEl.style.zIndex = index;
        cardEl.draggable = true;
        cardEl.dataset.instanceId = card.instanceId;

        cardEl.innerHTML = `
            <div class="card-cost-badge">${card.cost}</div>
            <div class="card-name-label">${card.name}</div>
            <div id="text-${card.instanceId}" class="card-effect-text">${getDynamicText(card, me, enemy, false)}</div>
        `;

        cardEl.addEventListener('mouseenter', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = getDynamicText(card, me, enemy, true);
        });
        cardEl.addEventListener('mouseleave', () => {
            document.getElementById(`text-${card.instanceId}`).innerText = getDynamicText(card, me, enemy, false);
        });

        cardEl.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.instanceId));
        myHand.appendChild(cardEl);
    });
}

// 드래그 앤 드롭 구역 (사용 및 버리기 통합)
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    const instanceId = parseInt(e.dataTransfer.getData('text/plain'));

    if (discardRequiredCount > 0) {
        socket.emit('discardCard', { roomId: currentRoomId, instanceId });
        discardRequiredCount--;
        if(discardRequiredCount <= 0) {
            document.getElementById('drop-zone-text').innerHTML = "카드를 이곳에 사용하세요";
        } else {
            document.getElementById('drop-zone-text').innerHTML = `<span style="color:#f85149; font-weight:bold;">패가 초과되었습니다!<br>${discardRequiredCount}장을 이곳에 버려주세요.</span>`;
        }
    } else {
        if (localGameState.turn === myId && localGameState.phase === "main" && !isMyTurnProcessing) {
            isMyTurnProcessing = true;
            socket.emit('playCard', { roomId: currentRoomId, instanceId });
            setTimeout(() => { isMyTurnProcessing = false; }, 1000); // 1초 쿨타임
        }
    }
});

document.getElementById('end-turn-btn').addEventListener('click', () => {
    socket.emit('endTurn', { roomId: currentRoomId });
    document.getElementById('end-turn-btn').classList.add('hidden');
});

// 덱 / 무덤 모달창 로직
const modal = document.getElementById('list-modal');
const modalGrid = document.getElementById('modal-grid');
const modalPreview = document.getElementById('modal-preview');

function openModal(title, cardArray, shuffle = false) {
    document.getElementById('modal-title').innerText = title;
    modalGrid.innerHTML = "";
    modalPreview.innerHTML = "<p style='color:#8b949e; margin-top:50px;'>카드를 선택하세요</p>";
    
    let displayArray = [...cardArray];
    if (shuffle) displayArray.sort(() => Math.random() - 0.5);

    displayArray.forEach(card => {
        const el = document.createElement('div');
        el.className = 'card-frame grid-card';
        el.innerHTML = `<div class="card-cost-badge">${card.cost}</div><div class="card-name-label">${card.name}</div><div class="card-effect-text" style="font-size:8px;">${card.textTemplate}</div>`;
        el.addEventListener('click', () => {
            modalPreview.innerHTML = `
                <div class="card-frame" style="width:200px; height:280px; transform:none; margin:auto; cursor:default;">
                    <div class="card-cost-badge" style="width:36px; height:36px; font-size:16px; top:-12px; left:-12px;">${card.cost}</div>
                    <div class="card-name-label" style="font-size:18px; margin-top:15px;">${card.name}</div>
                    <div class="card-effect-text" style="font-size:13px; margin-top:20px;">${card.textTemplate}</div>
                </div>
            `;
        });
        modalGrid.appendChild(el);
    });
    modal.classList.remove('hidden');
}

document.getElementById('my-deck-btn').addEventListener('click', () => openModal('나의 덱 목록 (무작위 정렬)', localGameState.players[myId].deck, true));
document.getElementById('my-grave-btn').addEventListener('click', () => openModal('나의 카드 무덤', localGameState.players[myId].graveyard, false));
document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));