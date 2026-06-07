const socket = io();

let currentRoomId = null;
let myId = null;
let localGameState = null;
let bannerTimeout = null;

let modalMode = null; 
let selectedDiscardIds = [];
let pendingMagicCardId = null;

// 🌟 핵심: 이전 패의 카드 번호들을 기억하는 배열
let previousHandIds = [];

// 키워드 사전
const KEYWORDS_DESC = {
    "피해": "상대의 체력을 이 수치만큼 감소시킨다.",
    "보호막": "다음 상대 턴 종료시까지, 상대의 피해를 이 수치만큼 경감한다.",
    "치명타": "내 피해량이 2배가 된다. 이번턴이 종료하기 전까지 적용된다.",
    "드로우": "덱에서 카드를 뽑는다.",
    "치유": "이 수치만큼 자신의 체력을 회복한다.",
    "체력지불": "자신은 이 수치만큼 체력을 잃는다. 보호막으로 경감이 되지 않는다."
};

// 클라이언트 카드 DB (덱 편집기용)
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

// 덱 에디터 상태
let myDeckSetup = { standby: [null, null], subStandby: [null, null, null, null, null, null] };

// UI Elements
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const matchBtn = document.getElementById('match-btn');
const toastLayer = document.getElementById('toast-layer');
const bannerLayer = document.getElementById('banner-layer');
const bannerText = document.getElementById('banner-text');

function showToast(message) {
    const toast = document.createElement('div'); toast.className = 'toast-msg'; toast.innerText = message;
    toastLayer.appendChild(toast); setTimeout(() => toast.remove(), 3000);
}

function showBanner(text, duration = 1200) {
    if (bannerTimeout) { clearTimeout(bannerTimeout); bannerTimeout = null; }
    bannerText.innerText = text; bannerLayer.classList.remove('hidden');
    bannerTimeout = setTimeout(() => { bannerLayer.classList.add('hidden'); }, duration);
}

// 탭 전환 로직
document.getElementById('tab-match').addEventListener('click', () => {
    document.getElementById('tab-match').classList.add('active'); document.getElementById('tab-deck').classList.remove('active');
    document.getElementById('lobby-match-view').classList.remove('hidden'); document.getElementById('lobby-deck-view').classList.add('hidden');
});
document.getElementById('tab-deck').addEventListener('click', () => {
    document.getElementById('tab-deck').classList.add('active'); document.getElementById('tab-match').classList.remove('active');
    document.getElementById('lobby-deck-view').classList.remove('hidden'); document.getElementById('lobby-match-view').classList.add('hidden');
    renderDeckEditor();
});

// 키워드 파싱 함수
function colorize(text) {
    let colored = text;
    Object.keys(KEYWORDS_DESC).forEach(k => {
        let regex = new RegExp(`(${k})`, 'g');
        colored = colored.replace(regex, '<span class="kw-orange">$1</span>');
    });
    return colored;
}

function showPreviewWithKeywords(card, previewBoxId, keywordBoxId, keywordListId) {
    const pBox = document.getElementById(previewBoxId);
    const kBox = document.getElementById(keywordBoxId);
    const kList = document.getElementById(keywordListId);

    pBox.innerHTML = `
        <div class="card-frame" style="width:100%; height:100%; transform:none; margin:0; cursor:default; box-shadow:none;">
            <div class="card-cost-badge" style="width:40px; height:40px; font-size:18px; top:-15px; left:-15px;">${card.cost}</div>
            <div class="card-name-label" style="font-size:18px; margin-top:20px; color:#58a6ff;">${card.name}</div>
            <div class="card-effect-text" style="font-size:14px; margin-top:30px;">${colorize(card.textTemplate)}</div>
        </div>
    `;

    let foundKeys = Object.keys(KEYWORDS_DESC).filter(k => (card.name + card.textTemplate).includes(k));
    if(foundKeys.length > 0) {
        kList.innerHTML = foundKeys.map(k => `<div class="keyword-item"><span class="kw-orange">${k}</span>: ${KEYWORDS_DESC[k]}</div>`).join('');
        kBox.classList.remove('hidden');
    } else {
        kBox.classList.add('hidden');
    }
}

// 덱 에디터 렌더링
function renderDeckEditor(searchText = "", sortByCost = false) {
    const basicSlots = document.getElementById('slots-basic');
    basicSlots.innerHTML = "";
    CARD_DB.filter(c => c.type === 'basic').forEach(c => {
        const el = document.createElement('div'); el.className = 'slot-card';
        el.innerHTML = `<div style="font-size:10px; font-weight:bold;">${c.cost}</div><div style="font-size:11px;">${c.name}</div>`;
        el.addEventListener('mouseenter', () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list'));
        basicSlots.appendChild(el);
    });

    function renderSlotArray(arr, containerId, type) {
        const container = document.getElementById(containerId); container.innerHTML = "";
        arr.forEach((cardName, idx) => {
            if(cardName) {
                const c = CARD_DB.find(x => x.name === cardName);
                const el = document.createElement('div'); el.className = 'slot-card';
                el.innerHTML = `<div style="font-size:10px; font-weight:bold;">${c.cost}</div><div style="font-size:11px;">${c.name}</div>`;
                el.addEventListener('mouseenter', () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list'));
                el.addEventListener('contextmenu', (e) => { e.preventDefault(); arr[idx] = null; renderDeckEditor(); });
                container.appendChild(el);
            } else {
                const el = document.createElement('div'); el.className = 'empty-slot'; el.dataset.type = type; el.dataset.index = idx;
                el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('hover'); });
                el.addEventListener('dragleave', () => el.classList.remove('hover'));
                el.addEventListener('drop', e => {
                    e.preventDefault(); el.classList.remove('hover');
                    const name = e.dataTransfer.getData('text/plain');
                    if(CARD_DB.find(x => x.name === name).type === 'basic') return showToast("기본 카드는 넣을 수 없습니다.");
                    if(myDeckSetup.standby.includes(name) || myDeckSetup.subStandby.includes(name)) return showToast("스탠바이 전체를 통틀어 중복 카드는 넣을 수 없습니다.");
                    arr[idx] = name; renderDeckEditor();
                });
                container.appendChild(el);
            }
        });
    }
    renderSlotArray(myDeckSetup.standby, 'slots-standby', 'standby');
    renderSlotArray(myDeckSetup.subStandby, 'slots-substandby', 'substandby');

    let pool = CARD_DB.filter(c => c.type === 'other');
    if(searchText) pool = pool.filter(c => c.name.includes(searchText) || c.textTemplate.includes(searchText));
    if(sortByCost) pool.sort((a,b) => a.cost - b.cost);

    const poolContainer = document.getElementById('edit-card-pool');
    poolContainer.innerHTML = "";
    pool.forEach(c => {
        const el = document.createElement('div'); el.className = 'card-frame grid-card'; el.draggable = true;
        el.innerHTML = `<div class="card-cost-badge">${c.cost}</div><div class="card-name-label">${c.name}</div><div class="card-effect-text" style="font-size:10px;">${colorize(c.textTemplate)}</div>`;
        el.addEventListener('mouseenter', () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list'));
        el.addEventListener('dragstart', e => e.dataTransfer.setData('text/plain', c.name));
        poolContainer.appendChild(el);
    });
}

document.getElementById('edit-search').addEventListener('input', e => renderDeckEditor(e.target.value, false));
document.getElementById('edit-sort-btn').addEventListener('click', () => renderDeckEditor(document.getElementById('edit-search').value, true));

matchBtn.addEventListener('click', () => {
    if(myDeckSetup.standby.includes(null) || myDeckSetup.subStandby.includes(null)) {
        showToast("덱을 먼저 완성해 주세요! (빈 슬롯이 있습니다)"); return;
    }
    socket.emit('findMatch', { standby: myDeckSetup.standby, subStandby: myDeckSetup.subStandby });
});

socket.on('matching', () => { document.getElementById('status-text').innerText = "매칭 중..."; matchBtn.disabled = true; });
socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId; myId = socket.id;
    previousHandIds = []; // 게임 시작 시 초기화
    lobbyScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    updateUI(gameState);
});
socket.on('updateState', ({ gameState }) => { updateUI(gameState); });
socket.on('errorMessage', ({ message }) => { showToast(message); });
socket.on('phaseBanner', ({ type }) => {
    if (!localGameState) return;
    const texts = { 'TURN_CHANGE': "Turn Change!!", 'MAIN_PHASE': localGameState.turn === myId ? "카드를 사용하세요!!" : "상대방이 카드를 사용 중입니다", 'TURN_OVER': "Turn Over" };
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

function isPlayable(card, me) {
    if(me.energy < card.cost) return false;
    if(card.hpCost && me.hp <= card.hpCost) return false;
    if(card.discardCost && me.hand.length - 1 < card.discardCost) return false;
    if(card.req === 'dealtCrit' && !me.stats.dealtCrit) return false;
    if(card.req === 'drewCard' && !me.stats.drewCard) return false;
    if(card.req === 'myShield' && me.shield <= 0) return false;
    if(card.req === 'hpPaid' && me.stats.hpPaidAmount <= 0) return false;
    if(card.req === 'enemyDealtCrit' && !me.lastTurnStats.enemyDealtCrit) return false;
    if(card.req === 'enemyDrew' && !me.lastTurnStats.enemyDrew) return false;
    return true;
}

function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    const me = gameState.players[myId]; const enemy = gameState.players[enemyId];

    document.getElementById('my-hp-text').innerText = `${me.hp} / 70`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / 70) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / 400`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / 400) * 100}%`;

    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / 70`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / 70) * 100}%`;

    document.getElementById('my-deck-count').innerText = me.deck.length; document.getElementById('my-standby-count').innerText = me.standbyDeck.length;
    document.getElementById('my-grave-count').innerText = me.graveyard.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length; document.getElementById('enemy-standby-count').innerText = enemy.standbyDeck.length;
    document.getElementById('enemy-grave-count').innerText = enemy.graveyard.length;

    const standbyBtn = document.getElementById('my-standby-btn');
    if (me.pulledStandbyThisTurn || localGameState.turn !== myId || localGameState.phase !== "main") standbyBtn.classList.add('disabled');
    else standbyBtn.classList.remove('disabled');

    document.getElementById('my-shields').innerHTML = me.shield > 0 ? `<div class="shield-badge">${me.shield}</div>` : '';
    document.getElementById('enemy-shields').innerHTML = enemy.shield > 0 ? `<div class="shield-badge">${enemy.shield}</div>` : '';

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
        const playable = isPlayable(card, me);
        const cardEl = document.createElement('div');
        
        // 🌟 이번 업데이트에 이 카드가 새로 추가된 카드인지 검사
        const isNewCard = !previousHandIds.includes(card.instanceId);
        
        cardEl.className = `card-frame ${playable ? 'card-playable' : 'card-unplayable'} ${isNewCard ? 'card-just-drawn' : ''}`;
        cardEl.style.zIndex = index; cardEl.draggable = playable; cardEl.dataset.instanceId = card.instanceId;

        cardEl.innerHTML = `<div class="card-cost-badge">${card.cost}</div><div class="card-name-label">${card.name}</div><div class="card-effect-text">${colorize(card.textTemplate)}</div>`;
        cardEl.addEventListener('click', () => showPreviewWithKeywords(card, 'card-preview-box', 'game-keywords', 'game-keyword-list'));
        cardEl.addEventListener('dragstart', (e) => {
            if(!playable) e.preventDefault();
            else e.dataTransfer.setData('text/plain', card.instanceId);
        });
        myHand.appendChild(cardEl);
        
        // 🌟 애니메이션이 끝나면 호버링을 위해 클래스 제거
        if (isNewCard) {
            setTimeout(() => { if (cardEl) cardEl.classList.remove('card-just-drawn'); }, 400);
        }
    });
    
    // 🌟 렌더링이 끝나면 현재 패를 '이전 패'로 기억해둠
    previousHandIds = me.hand.map(c => c.instanceId);
}

const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('hover');
    if (!localGameState) return;
    
    const instanceId = parseInt(e.dataTransfer.getData('text/plain'));
    const me = localGameState.players[myId];
    
    if (localGameState.turn === myId) {
        if (localGameState.phase === "discard") {
            socket.emit('discardCard', { roomId: currentRoomId, instanceId });
        } else if (localGameState.phase === "main") {
            const card = me.hand.find(c => c.instanceId === instanceId);
            if(card && card.discardCost) {
                pendingMagicCardId = instanceId;
                openModal(`버릴 카드 ${card.discardCost}장을 선택하세요`, me.hand.filter(c => c.instanceId !== instanceId), false, 'magicSelect', card.discardCost);
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
let requiredDiscardCount = 0;

function openModal(title, cardArray, shuffle = false, mode = 'view', reqCount = 0) {
    modalMode = mode; selectedDiscardIds = []; requiredDiscardCount = reqCount;
    document.getElementById('modal-title').innerText = title;
    modalGrid.innerHTML = ""; modalPreview.innerHTML = "<p style='color:#8b949e; margin-top:50px;'>카드를 선택하세요</p>";
    
    if(mode === 'magicSelect') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = `${reqCount}장 선택 완료`; confirmBtn.disabled = true; }
    else if(mode === 'standby') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = "패로 가져오기"; confirmBtn.disabled = true; }
    else { confirmBtn.classList.add('hidden'); }

    let displayArray = [...cardArray]; if (shuffle) displayArray.sort(() => Math.random() - 0.5);

    displayArray.forEach(card => {
        const el = document.createElement('div'); el.className = 'card-frame grid-card';
        el.innerHTML = `<div class="card-cost-badge">${card.cost}</div><div class="card-name-label">${card.name}</div><div class="card-effect-text" style="font-size:10px;">${colorize(card.textTemplate)}</div>`;
        el.addEventListener('click', () => {
            modalPreview.innerHTML = `
                <div class="card-frame" style="width:200px; height:280px; transform:none; margin:auto; cursor:default;">
                    <div class="card-cost-badge" style="width:36px; height:36px; font-size:16px; top:-12px; left:-12px;">${card.cost}</div>
                    <div class="card-name-label" style="font-size:18px; margin-top:15px; color:#58a6ff;">${card.name}</div>
                    <div class="card-effect-text" style="font-size:13px; margin-top:20px;">${colorize(card.textTemplate)}</div>
                </div>
            `;
            if(mode === 'magicSelect') {
                if (el.classList.contains('selected')) {
                    el.classList.remove('selected'); selectedDiscardIds = selectedDiscardIds.filter(id => id !== card.instanceId);
                } else if (selectedDiscardIds.length < requiredDiscardCount) {
                    el.classList.add('selected'); selectedDiscardIds.push(card.instanceId);
                }
                confirmBtn.disabled = (selectedDiscardIds.length !== requiredDiscardCount);
            } 
            else if(mode === 'standby') {
                document.querySelectorAll('.grid-card').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected'); selectedDiscardIds = [card.instanceId]; confirmBtn.disabled = false;
            }
        });
        modalGrid.appendChild(el);
    });
    modal.classList.remove('hidden');
}

confirmBtn.addEventListener('click', () => {
    if(modalMode === 'magicSelect' && selectedDiscardIds.length === requiredDiscardCount) {
        socket.emit('playCard', { roomId: currentRoomId, instanceId: pendingMagicCardId, discardTargetIds: selectedDiscardIds });
        modal.classList.add('hidden');
    }
    else if (modalMode === 'standby' && selectedDiscardIds.length === 1) {
        socket.emit('pullStandbyCard', { roomId: currentRoomId, instanceId: selectedDiscardIds[0] });
        modal.classList.add('hidden');
    }
});

document.getElementById('my-deck-btn').addEventListener('click', () => openModal('나의 기본 덱 목록 (무작위)', localGameState.players[myId].deck, true, 'view'));
document.getElementById('my-grave-btn').addEventListener('click', () => openModal('나의 카드 무덤', localGameState.players[myId].graveyard, false, 'view'));
document.getElementById('enemy-grave-btn').addEventListener('click', () => openModal('상대 카드 무덤', localGameState.players[localGameState.playerIds.find(id=>id!==myId)].graveyard, false, 'view'));
document.getElementById('enemy-standby-btn').addEventListener('click', () => openModal('상대 스탠바이 목록', localGameState.players[localGameState.playerIds.find(id=>id!==myId)].standbyDeck, false, 'view'));
document.getElementById('my-standby-btn').addEventListener('click', () => {
    if(document.getElementById('my-standby-btn').classList.contains('disabled')) return;
    openModal('스탠바이 풀 (1장 가져오기)', localGameState.players[myId].standbyDeck, false, 'standby');
});
document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));