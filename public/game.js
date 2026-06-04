const socket = io();

let currentRoomId = null;
let myId = null;
let localGameState = null;
let bannerTimeout = null;

let modalMode = null; 
let selectedDiscardIds = [];
let pendingMagicCardId = null;

const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const matchBtn = document.getElementById('match-btn');
const toastLayer = document.getElementById('toast-layer');
const bannerLayer = document.getElementById('banner-layer');
const bannerText = document.getElementById('banner-text');
const previewBox = document.getElementById('card-preview-box');

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = message;
    toastLayer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showBanner(text, duration = 1200) {
    if (bannerTimeout) { clearTimeout(bannerTimeout); bannerTimeout = null; }
    bannerText.innerText = text;
    bannerLayer.classList.remove('hidden');
    bannerTimeout = setTimeout(() => { bannerLayer.classList.add('hidden'); }, duration);
}

matchBtn.addEventListener('click', () => socket.emit('findMatch'));
socket.on('matching', () => { document.getElementById('status-text').innerText = "매칭 중..."; matchBtn.disabled = true; });
socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId; myId = socket.id;
    lobbyScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    updateUI(gameState);
});

socket.on('updateState', ({ gameState }) => { updateUI(gameState); });
socket.on('errorMessage', ({ message }) => { showToast(message); });

socket.on('phaseBanner', ({ type }) => {
    if (!localGameState) return;
    const texts = {
        'TURN_CHANGE': "Turn Change!!",
        'START_PHASE': localGameState.turn === myId ? "내 턴 시작 - 카드 효과 처리 진행" : "상대 턴 시작 - 카드 효과 처리 진행",
        'MAIN_PHASE': localGameState.turn === myId ? "카드를 사용하세요!!" : "상대방이 카드를 사용 중입니다",
        'END_PHASE': localGameState.turn === myId ? "내 턴 종료 - 카드 효과 처리 진행" : "상대 턴 종료 - 카드 효과 처리 진행",
        'TURN_OVER': "Turn Over"
    };
    if (texts[type]) showBanner(texts[type]);
});

socket.on('gameOver', ({ winner, disconnect }) => {
    setTimeout(() => {
        if (disconnect) showBanner("상대방 연결 끊김! 승리!", 4000);
        else if (winner === myId) showBanner("승 리 !!", 4000);
        else showBanner("패 배 ..", 4000);
        setTimeout(() => location.reload(), 4000);
    }, 500);
});

function colorize(text) {
    let colored = text;
    colored = colored.replace(/힘/g, '<span class="c-str">힘</span>');
    colored = colored.replace(/인내/g, '<span class="c-end">인내</span>');
    colored = colored.replace(/집중/g, '<span class="c-foc">집중</span>');
    colored = colored.replace(/민첩/g, '<span class="c-agi">민첩</span>');
    colored = colored.replace(/마력/g, '<span class="c-mag">마력</span>');
    return colored;
}

function getDynamicText(card, me, enemy, isHovered) {
    let dmgBonus = me.bonusDamage || 0;
    let reduc = enemy.damageReduction || 0;
    
    function calc(rawBase) {
        let final1 = Math.max(0, (rawBase + dmgBonus) - reduc);
        return final1.toString();
    }

    let t = "";
    switch(card.name) {
        case "재빠른 일격": t = `상대에게 ${calc(202)} 피해를 준다. 힘이 8 증가한다.`; break;
        case "굳건한 수비": t = `자신이 다음 상대 턴이 종료할 때 까지 176 보호막을 얻는다. 인내가 9 증가한다.`; break;
        case "침착한 판단": t = `다음 상대 턴이 종료할 때 까지 자신의 받는 피해 감소가 70 증가한다. 집중이 10 증가한다.`; break;
        case "신속한 찌르기": t = `상대에게 ${calc(120)} 피해를 2번 준다. 민첩이 7 증가한다.`; break;
        case "신비로운 마법": t = `자신의 패가 이 카드를 제외하고 2장 이상일 때만 이 카드를 사용할 수 있다. 패의 카드를 2장 카드 무덤으로 보낸다. 덱에서 카드를 2장 뽑는다. 마력이 6 증가한다.`; break;
        case "솟구치는 힘": t = `힘이 17 증가한다.`; break;
        case "불굴의 인내심": t = `인내가 16 증가한다.`; break;
        case "정신집중": t = `집중이 15 증가한다.`; break;
        case "전력질주": t = `민첩이 18 증가한다.`; break;
        case "마력 폭주": t = `마력이 19 증가한다.`; break;
        case "묵직한 내려찍기":
            let d1 = 151 + (me.strength * 5); let s1 = me.endurance * 4;
            t = isHovered ? `상대에게 ${calc(d1)} (151 + 힘 X 5) 의 피해를 준다. 자신이 다음 상대 턴이 종료할 때 까지 ${s1} (인내 X 4) 보호막을 얻는다.` : `상대에게 ${calc(d1)} 의 피해를 준다. 자신이 다음 상대 턴이 종료할 때 까지 ${s1} 보호막을 얻는다.`; break;
        case "질풍의 치고 빠지기":
            let d2 = 53 + (me.agility * 2); let r1 = 40 + (me.focus * 1);
            t = isHovered ? `상대에게 ${calc(d2)} (53 + 민첩 X 2) 의 피해를 3번 준다. 다음 상대 턴이 종료할 때 까지 자신의 받는 피해 감소가 ${r1} (40 + 집중 X 1) 증가한다.` : `상대에게 ${calc(d2)} 의 피해를 3번 준다. 다음 상대 턴이 종료할 때 까지 자신의 받는 피해 감소가 ${r1} 증가한다.`; break;
        case "신성한 치유 마법":
            let h1 = 192 + (me.magic * 6); t = isHovered ? `자신이 ${h1} (192 + 마력 X 6) 의 체력을 회복한다.` : `자신이 ${h1} 의 체력을 회복한다.`; break;
        case "부드러움은 강함을 이긴다":
            let d3 = 200 + (enemy.strength * 4); t = isHovered ? `상대에게 ${calc(d3)} (200 + 상대 힘 X 4) 피해를 준다.` : `상대에게 ${calc(d3)} 피해를 준다.`; break;
        case "방패 꿰뚫기":
            let b1 = 100 + (enemy.endurance * 3); t = isHovered ? `다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 ${b1} (100 + 상대 인내 X 3) 증가한다.` : `다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 ${b1} 증가한다.`; break;
        case "방해":
            let d4 = 149 + (enemy.focus * 5); t = isHovered ? `상대에게 ${calc(d4)} (149 + 상대 집중 X 5) 피해를 준다.` : `상대에게 ${calc(d4)} 피해를 준다.`; break;
        case "탈진":
            let d5 = 269 + (enemy.agility * 3); t = isHovered ? `상대에게 ${calc(d5)} (269 + 상대 민첩 X 3) 피해를 준다.` : `상대에게 ${calc(d5)} 피해를 준다.`; break;
        case "마력 흡수":
            let b2 = 52 + (enemy.magic * 4); t = isHovered ? `다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 ${b2} (52 + 상대 마력 X 4) 증가한다.` : `다음 상대 턴이 종료할 때 까지 자신의 공격시 추가 피해가 ${b2} 증가한다.`; break;
        default: t = card.textTemplate; break;
    }
    return colorize(t);
}

function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    const me = gameState.players[myId];
    const enemy = gameState.players[enemyId];

    document.getElementById('my-hp-text').innerText = `${me.hp} / 1500`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / 1500) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / 600`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / 600) * 100}%`;
    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / 1500`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / 1500) * 100}%`;

    document.getElementById('stat-str').innerText = me.strength; document.getElementById('stat-end').innerText = me.endurance;
    document.getElementById('stat-foc').innerText = me.focus; document.getElementById('stat-agi').innerText = me.agility;
    document.getElementById('stat-mag').innerText = me.magic; document.getElementById('stat-add-dmg').innerText = me.bonusDamage;
    document.getElementById('stat-red-dmg').innerText = me.damageReduction; document.getElementById('stat-regen').innerText = me.energyRegen;

    document.getElementById('my-deck-count').innerText = me.deck.length; document.getElementById('my-standby-count').innerText = me.standbyDeck.length;
    document.getElementById('my-grave-count').innerText = me.graveyard.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length; document.getElementById('enemy-standby-count').innerText = enemy.standbyDeck.length;
    document.getElementById('enemy-grave-count').innerText = enemy.graveyard.length;

    const standbyBtn = document.getElementById('my-standby-btn');
    if (me.pulledStandbyThisTurn || localGameState.turn !== myId || localGameState.phase !== "main") {
        standbyBtn.classList.add('disabled');
    } else { standbyBtn.classList.remove('disabled'); }

    function renderShields(targetId, arr) {
        const container = document.getElementById(targetId); container.innerHTML = "";
        arr.forEach(s => {
            const badge = document.createElement('div'); badge.className = 'shield-badge';
            badge.innerText = s.amount; container.appendChild(badge);
        });
    }
    renderShields('my-shields', me.shields); renderShields('enemy-shields', enemy.shields);

    const dropZoneText = document.getElementById('drop-zone-text');
    const endTurnBtn = document.getElementById('end-turn-btn');

    if (localGameState.turn === myId) {
        if (localGameState.phase === "main") {
            endTurnBtn.classList.remove('hidden'); dropZoneText.innerHTML = "카드를 이곳에 사용하세요";
        } else if (localGameState.phase === "discard") {
            endTurnBtn.classList.add('hidden');
            let overflow = me.hand.length - 5;
            dropZoneText.innerHTML = `<span style="color:#f85149; font-weight:bold;">패가 초과되었습니다!<br>${overflow}장을 이곳에 버려주세요.</span>`;
        } else {
            endTurnBtn.classList.add('hidden'); dropZoneText.innerHTML = "처리 중...";
        }
    } else { endTurnBtn.classList.add('hidden'); dropZoneText.innerHTML = "상대방 차례입니다"; }

    const myHand = document.getElementById('my-hand');
    myHand.innerHTML = "";
    me.hand.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = `card-frame ${me.energy >= card.cost ? 'card-playable' : 'card-unplayable'}`;
        cardEl.style.zIndex = index; cardEl.draggable = true; cardEl.dataset.instanceId = card.instanceId;

        cardEl.innerHTML = `
            <div class="card-cost-badge">${card.cost}</div><div class="card-name-label">${card.name}</div>
            <div class="card-effect-text">${getDynamicText(card, me, enemy, false)}</div>
        `;
        cardEl.addEventListener('click', () => {
            previewBox.innerHTML = `
                <div class="card-frame" style="width:100%; height:100%; transform:none; margin:0; cursor:default; box-shadow:none;">
                    <div class="card-cost-badge" style="width:40px; height:40px; font-size:18px; top:-15px; left:-15px;">${card.cost}</div>
                    <div class="card-name-label" style="font-size:18px; margin-top:20px; color:#58a6ff;">${card.name}</div>
                    <div class="card-effect-text" style="font-size:14px; margin-top:30px;">${getDynamicText(card, me, enemy, true)}</div>
                </div>
            `;
        });
        cardEl.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', card.instanceId));
        myHand.appendChild(cardEl);
    });
}

// 행동 불가 딜레이 완전 삭제 (초고속 반응)
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('hover');
    if (!localGameState) return;
    
    const instanceId = parseInt(e.dataTransfer.getData('text/plain'));
    const me = localGameState.players[myId];
    
    if (localGameState.turn === myId) {
        if (localGameState.phase === "discard") {
            socket.emit('discardCard', { roomId: currentRoomId, instanceId });
        } else if (localGameState.phase === "main") {
            const card = me.hand.find(c => c.instanceId === instanceId);
            if(card && card.name === "신비로운 마법") {
                if(me.hand.length < 3) {
                    showToast("패가 부족하여 이 카드를 사용할 수 없습니다.");
                    return;
                }
                pendingMagicCardId = instanceId;
                openModal('버릴 카드 2장을 선택하세요', me.hand.filter(c => c.instanceId !== instanceId), false, 'magicSelect');
            } else {
                socket.emit('playCard', { roomId: currentRoomId, instanceId });
            }
        }
    }
});

document.getElementById('end-turn-btn').addEventListener('click', () => {
    if (localGameState && localGameState.turn === myId && localGameState.phase === "main") {
        socket.emit('endTurn', { roomId: currentRoomId });
        document.getElementById('end-turn-btn').classList.add('hidden');
    }
});

const modal = document.getElementById('list-modal');
const modalGrid = document.getElementById('modal-grid');
const modalPreview = document.getElementById('modal-preview');
const confirmBtn = document.getElementById('modal-confirm-btn');

function openModal(title, cardArray, shuffle = false, mode = 'view') {
    modalMode = mode; selectedDiscardIds = [];
    document.getElementById('modal-title').innerText = title;
    modalGrid.innerHTML = ""; modalPreview.innerHTML = "<p style='color:#8b949e; margin-top:50px;'>카드를 선택하세요</p>";
    
    if(mode === 'magicSelect') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = "2장 선택 완료"; confirmBtn.disabled = true; }
    else if(mode === 'standby') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = "패로 가져오기"; confirmBtn.disabled = true; }
    else { confirmBtn.classList.add('hidden'); }

    let displayArray = [...cardArray];
    if (shuffle) displayArray.sort(() => Math.random() - 0.5);

    const me = localGameState.players[myId];
    const enemy = localGameState.players[localGameState.playerIds.find(id => id !== myId)];

    displayArray.forEach(card => {
        const el = document.createElement('div');
        el.className = 'card-frame grid-card';
        el.innerHTML = `<div class="card-cost-badge">${card.cost}</div><div class="card-name-label">${card.name}</div><div class="card-effect-text" style="font-size:10px;">${colorize(card.textTemplate)}</div>`;
        
        el.addEventListener('click', () => {
            modalPreview.innerHTML = `
                <div class="card-frame" style="width:200px; height:280px; transform:none; margin:auto; cursor:default;">
                    <div class="card-cost-badge" style="width:36px; height:36px; font-size:16px; top:-12px; left:-12px;">${card.cost}</div>
                    <div class="card-name-label" style="font-size:18px; margin-top:15px; color:#58a6ff;">${card.name}</div>
                    <div class="card-effect-text" style="font-size:13px; margin-top:20px;">${getDynamicText(card, me, enemy, true)}</div>
                </div>
            `;
            
            if(mode === 'magicSelect') {
                if (el.classList.contains('selected')) {
                    el.classList.remove('selected'); selectedDiscardIds = selectedDiscardIds.filter(id => id !== card.instanceId);
                } else if (selectedDiscardIds.length < 2) {
                    el.classList.add('selected'); selectedDiscardIds.push(card.instanceId);
                }
                confirmBtn.disabled = (selectedDiscardIds.length !== 2);
            } 
            else if(mode === 'standby') {
                document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected'); selectedDiscardIds = [card.instanceId];
                confirmBtn.disabled = false;
            }
        });
        modalGrid.appendChild(el);
    });
    modal.classList.remove('hidden');
}

confirmBtn.addEventListener('click', () => {
    if(modalMode === 'magicSelect' && selectedDiscardIds.length === 2) {
        socket.emit('playCard', { roomId: currentRoomId, instanceId: pendingMagicCardId, discardTargetIds: selectedDiscardIds });
        modal.classList.add('hidden');
    }
    else if (modalMode === 'standby' && selectedDiscardIds.length === 1) {
        socket.emit('pullStandbyCard', { roomId: currentRoomId, instanceId: selectedDiscardIds[0] });
        modal.classList.add('hidden');
    }
});

document.getElementById('my-deck-btn').addEventListener('click', () => openModal('나의 덱 목록 (무작위 정렬)', localGameState.players[myId].deck, true, 'view'));
document.getElementById('my-grave-btn').addEventListener('click', () => openModal('나의 카드 무덤', localGameState.players[myId].graveyard, false, 'view'));
document.getElementById('enemy-grave-btn').addEventListener('click', () => openModal('상대 카드 무덤', localGameState.players[localGameState.playerIds.find(id=>id!==myId)].graveyard, false, 'view'));
document.getElementById('enemy-standby-btn').addEventListener('click', () => openModal('상대 스탠바이 목록', localGameState.players[localGameState.playerIds.find(id=>id!==myId)].standbyDeck, false, 'view'));

document.getElementById('my-standby-btn').addEventListener('click', () => {
    const btn = document.getElementById('my-standby-btn');
    if(btn.classList.contains('disabled')) return;
    openModal('스탠바이 카드 (1장 선택 가능)', localGameState.players[myId].standbyDeck, false, 'standby');
});

document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));