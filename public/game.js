// 🌟 [최종 기획] 16:9 해상도 강제 고정 및 레터박스 스케일링 로직 🌟
function resizeApp() {
    const wrapper = document.getElementById('app-wrapper');
    // 최적 해상도: 1920x1080
    const targetRatio = 1920 / 1080;
    const currentRatio = window.innerWidth / window.innerHeight;

    let scale;
    if (currentRatio > targetRatio) {
        // 창이 더 넓을 때 -> 높이 기준 스케일링
        scale = window.innerHeight / 1080;
    } else {
        // 창이 더 좁을 때 -> 너비 기준 스케일링
        scale = window.innerWidth / 1920;
    }

    // 통째로 스케일링 및 가운데 정렬
    wrapper.style.transform = `translate(-50%, -50%) scale(${scale})`;
}
window.addEventListener('resize', resizeApp);
resizeApp(); // 초기 로딩 시 실행

// Socket 설정
const socket = io();

let currentRoomId = null;
let myId = null;
let localGameState = null;
let bannerTimeout = null;

// 모달 & 드롭다운 상태
let modalMode = null; 
let selectedDiscardIds = [];
let pendingMagicCardId = null;

// 효과음 객체
const sfxCardDraw = new Audio('audio/sfx/card-draw.ogg');
sfxCardDraw.volume = 0.6; 

// 키워드 사전
const KEYWORDS_DESC = {
    "피해": "상대의 체력을 이 수치만큼 감소시킨다.",
    "보호막": "다음 상대 턴 종료시까지, 상대의 피해를 이 수치만큼 경감한다.",
    "치명타": "내 피해량이 2배가 된다. 이번턴이 종료하기 전까지 적용된다.",
    "드로우": "덱에서 카드를 뽑는다.",
    "치유": "이 수치만큼 자신의 체력을 회복한다.",
    "체력지불": "자신은 이 수치만큼 체력을 잃는다. 보호막으로 경감이 되지 않는다."
};

// 카드 데이터베이스 (JS 렌더링용 프리뷰/덱 에디터 전용)
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

// 클라이언트 덱 편집 상태
let myDeckSetup = { standby: [null, null], subStandby: [null, null, null, null, null, null] };

// DOM 요소
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const matchBtn = document.getElementById('match-btn');
const toastLayer = document.getElementById('toast-layer');
const bannerLayer = document.getElementById('banner-layer');
const bannerText = document.getElementById('banner-text');

// 시스템 유틸
function showToast(message) {
    const toast = document.createElement('div'); toast.className = 'toast-msg'; toast.innerText = message;
    toastLayer.appendChild(toast); setTimeout(() => toast.remove(), 3000);
}

function showBanner(text, duration = 1500) {
    if (bannerTimeout) { clearTimeout(bannerTimeout); bannerTimeout = null; }
    bannerText.innerText = text; bannerLayer.classList.remove('hidden');
    bannerTimeout = setTimeout(() => { bannerLayer.classList.add('hidden'); }, duration);
}

// 로비 탭 전환
document.getElementById('tab-match').addEventListener('click', () => {
    document.getElementById('tab-match').classList.add('active'); document.getElementById('tab-deck').classList.remove('active');
    document.getElementById('lobby-match-view').classList.remove('hidden'); document.getElementById('lobby-deck-view').classList.add('hidden');
});
document.getElementById('tab-deck').addEventListener('click', () => {
    document.getElementById('tab-deck').classList.add('active'); document.getElementById('tab-match').classList.remove('active');
    document.getElementById('lobby-deck-view').classList.remove('hidden'); document.getElementById('lobby-match-view').classList.add('hidden');
    renderDeckEditor(); // 덱 에디터 로드
});

// 키워드 하이라이팅
function colorize(text) {
    let colored = text;
    Object.keys(KEYWORDS_DESC).forEach(k => {
        let regex = new RegExp(`(${k})`, 'g');
        colored = colored.replace(regex, '<span class="kw-orange">$1</span>');
    });
    return colored;
}

// 🌟 [최종 기획] 커스텀 틀 & 유희왕 스타일 HTML 구조 생성 함수 🌟
function createCardHTML(card) {
    const typeClass = card.type === 'basic' ? 'basic-type' : 'standby-type';
    // 에너지 비용 형식을 '숫자 전용'으로 변경
    return `
        <div class="card-frame ${typeClass}" data-instance-id="${card.instanceId}">
            <div class="card-cost-badge">${card.cost}</div>
            <div class="card-name-label">${card.name}</div>
            <div class="card-effect-text">${colorize(card.textTemplate)}</div>
            <div class="card-image-area"></div>
        </div>
    `;
}

// 프리뷰 박스 업데이트 (공통)
function showPreviewWithKeywords(card, previewBoxId, keywordBoxId, keywordListId) {
    const pBox = document.getElementById(previewBoxId);
    const kBox = document.getElementById(keywordBoxId);
    const kList = document.getElementById(keywordListId);

    pBox.innerHTML = createCardHTML({...card});

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
    // 1. 기본 카드 슬롯 (렌더링만)
    const basicSlots = document.getElementById('slots-basic');
    basicSlots.innerHTML = "";
    CARD_DB.filter(c => c.type === 'basic').forEach(c => {
        const el = document.createElement('div'); el.className = 'slot-card basic-type'; 
        el.innerHTML = `<div class="slot-card-name">${c.name}</div><div class="slot-card-cost">${c.cost}</div>`;
        el.addEventListener('mouseenter', () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list'));
        basicSlots.appendChild(el);
    });

    // 2. 스탠바이/서브 스탠바이 슬롯 (드롭다운 & 제거)
    function renderSlotArray(arr, containerId, type) {
        const container = document.getElementById(containerId);
        // 컨테이너 내의 .empty-slot 요소만 초기화
        const slots = container.querySelectorAll('.empty-slot');
        slots.forEach((el, idx) => {
            const cardName = arr[idx];
            // 슬롯 초기화 (dataset 정보 유지)
            el.innerHTML = '<span style="font-size:24px; color:#30363d;">+</span>';
            el.className = 'empty-slot card-image-placeholder';
            el.removeAttribute('mouseenter');
            
            if (cardName) {
                const c = CARD_DB.find(x => x.name === cardName);
                const typeClass = type === 'standby' ? 'standby-type' : 'basic-type'; // 실제로는 다 other지만 틀 색상 구분용
                el.className = `empty-slot slot-card ${typeClass}`;
                el.innerHTML = `<div class="slot-card-name">${c.name}</div><div class="slot-card-cost">${c.cost}</div>`;
                
                // 프리뷰 & 제거 이벤트
                el.onmouseenter = () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list');
                el.oncontextmenu = (e) => { e.preventDefault(); arr[idx] = null; renderDeckEditor(); };
            } else {
                // 빈 슬롯 드래그 이벤트 (최초 1회만 설정되도록 on속성 사용)
                el.ondragover = (e) => { e.preventDefault(); el.classList.add('hover'); };
                el.ondragleave = () => el.classList.remove('hover');
                el.ondrop = (e) => {
                    e.preventDefault(); el.classList.remove('hover');
                    const name = e.dataTransfer.getData('text/plain');
                    const c = CARD_DB.find(x => x.name === name);
                    if (!c || c.type === 'basic') return showToast("기본 카드는 넣을 수 없습니다.");
                    if (myDeckSetup.standby.includes(name) || myDeckSetup.subStandby.includes(name)) return showToast("이미 덱에 존재하는 카드입니다.");
                    arr[idx] = name; renderDeckEditor();
                };
            }
        });
    }
    renderSlotArray(myDeckSetup.standby, 'slots-standby', 'standby');
    renderSlotArray(myDeckSetup.subStandby, 'slots-substandby', 'substandby');

    // 3. 카드 풀 (검색 & 정렬)
    let pool = CARD_DB.filter(c => c.type === 'other');
    if(searchText) pool = pool.filter(c => c.name.includes(searchText) || c.textTemplate.includes(searchText));
    if(sortByCost) pool.sort((a,b) => a.cost - b.cost);

    const poolContainer = document.getElementById('edit-card-pool'); poolContainer.innerHTML = "";
    pool.forEach(c => {
        const typeClass = 'standby-type'; // Other 카드 기본 틀 색상
        const cardEl = document.createElement('div');
        cardEl.className = `grid-card card-frame ${typeClass}`;
        cardEl.draggable = true;
        
        cardEl.innerHTML = `
            <div class="card-cost-badge">${c.cost}</div>
            <div class="card-name-label">${c.name}</div>
            <div class="card-effect-text">${colorize(c.textTemplate)}</div>
            <div class="card-image-area"></div>
        `;
        
        cardEl.addEventListener('mouseenter', () => showPreviewWithKeywords(c, 'edit-preview', 'edit-keywords', 'edit-keyword-list'));
        cardEl.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.name); cardEl.classList.add('selected'); });
        cardEl.addEventListener('dragend', () => cardEl.classList.remove('selected'));
        poolContainer.appendChild(cardEl);
    });
}

// 덱 에디터 이벤트
document.getElementById('edit-search').addEventListener('input', e => renderDeckEditor(e.target.value, false));
document.getElementById('edit-sort-btn').addEventListener('click', () => {
    const btn = document.getElementById('edit-sort-btn');
    const isSorted = btn.classList.toggle('active');
    renderDeckEditor(document.getElementById('edit-search').value, isSorted);
});

// 매칭 신청
matchBtn.addEventListener('click', () => {
    // 덱 완성 검사
    if(myDeckSetup.standby.includes(null) || myDeckSetup.subStandby.includes(null)) {
        showToast("덱을 완성해 주세요!"); return;
    }
    // 완성된 덱 정보 전달
    socket.emit('findMatch', { standby: myDeckSetup.standby, subStandby: myDeckSetup.subStandby });
});

// --- Socket Events (In-game) ---

socket.on('matching', () => { document.getElementById('status-text').innerText = "매칭 중..."; matchBtn.disabled = true; });

socket.on('gameStart', ({ roomId, gameState }) => {
    currentRoomId = roomId; myId = socket.id;
    previousHandIds = []; 
    lobbyScreen.classList.add('hidden'); gameScreen.classList.remove('hidden');
    // 배너 끄기
    bannerLayer.classList.add('hidden');
    updateUI(gameState);
});

// 🌟 [최종 수정] 서버가 보낸 updateState를 클라이언트가 받고 UI를 갱신합니다. 🌟
socket.on('updateState', ({ gameState }) => { 
    updateUI(gameState); 
});

socket.on('errorMessage', ({ message }) => { showToast(message); });
socket.on('phaseBanner', ({ type }) => {
    if (!localGameState) return;
    // processing 등 intermediate phase 무시
    if (type === 'TURN_OVER') { showBanner("Turn Over"); }
    if (type === 'TURN_CHANGE') { 
        showBanner("Turn Change!!"); 
    }
});

socket.on('gameOver', ({ winner, disconnect }) => {
    // 마지막 상태 업데이트 (HP 등)
    if(localGameState) updateUI(localGameState);
    
    // 약간 대기 후 결과 표시
    setTimeout(() => {
        if (disconnect) showBanner("상대 끊김! 승리!", 4000);
        else if (winner === myId) showBanner("승 리 !!", 4000);
        else showBanner("패 배 ..", 4000);
        
        setTimeout(() => location.reload(), 4100);
    }, 500);
});

// 패의 카드 사용 가능 여부 판별
function isPlayable(card, me) {
    if (localGameState.turn !== myId || localGameState.phase !== "main") return false;
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

// 🌟 [최종 수정] 인게임 UI 핵심 갱신 함수 🌟
function updateUI(gameState) {
    localGameState = gameState;
    const enemyId = gameState.playerIds.find(id => id !== myId);
    const me = gameState.players[myId]; const enemy = gameState.players[enemyId];

    // 스탯 (나)
    document.getElementById('my-hp-text').innerText = `${me.hp} / 70`;
    document.getElementById('my-hp-bar').style.width = `${(me.hp / 70) * 100}%`;
    document.getElementById('my-energy-text').innerText = `${me.energy} / 400`;
    document.getElementById('my-energy-bar').style.width = `${(me.energy / 400) * 100}%`;
    document.getElementById('my-shields').innerHTML = me.shield > 0 ? `<div class="shield-badge">${me.shield}</div>` : '';

    // 스탯 (상대)
    document.getElementById('enemy-hp-text').innerText = `${enemy.hp} / 70`;
    document.getElementById('enemy-hp-bar').style.width = `${(enemy.hp / 70) * 100}%`;
    document.getElementById('enemy-shields').innerHTML = enemy.shield > 0 ? `<div class="shield-badge">${enemy.shield}</div>` : '';

    // 덱/무덤 카운트
    document.getElementById('my-deck-count').innerText = me.deck.length; 
    document.getElementById('my-standby-count').innerText = me.standbyDeck.length;
    document.getElementById('my-grave-count').innerText = me.graveyard.length;
    document.getElementById('enemy-deck-count').innerText = enemy.deck.length; 
    document.getElementById('enemy-standby-count').innerText = enemy.standbyDeck.length;
    document.getElementById('enemy-grave-count').innerText = enemy.graveyard.length;

    // 내 스탠바이 버튼 활성화 조건
    const standbyBtn = document.getElementById('my-standby-btn');
    if (me.pulledStandbyThisTurn || localGameState.turn !== myId || localGameState.phase !== "main") standbyBtn.classList.add('disabled');
    else standbyBtn.classList.remove('disabled');

    // 드롭존 & 차례종료 버튼
    const dropZoneText = document.getElementById('drop-zone-text');
    const endTurnBtn = document.getElementById('end-turn-btn');

    if (localGameState.turn === myId) {
        endTurnBtn.classList.add('info-btn'); // 베이직 스타일 보장
        if (localGameState.phase === "main") {
            endTurnBtn.classList.remove('hidden'); endTurnBtn.innerText = "차례 종료";
            dropZoneText.innerHTML = "카드를 이곳에 사용하세요";
        } else if (localGameState.phase === "discard") {
            endTurnBtn.classList.add('hidden'); // 버리기 페이즈엔 숨김
            let overflow = me.hand.length - 5;
            dropZoneText.innerHTML = `<span style="color:#f85149; font-weight:bold;">패 초과! ${overflow}장을 버리세요.<br>(무덤으로 드래그)</span>`;
        } else {
            endTurnBtn.classList.add('hidden'); dropZoneText.innerHTML = "처리 중...";
        }
    } else { 
        endTurnBtn.classList.add('hidden'); 
        dropZoneText.innerHTML = "상대방의 차례입니다"; 
    }

    // 🌟 [최종 수정] 나의 패 렌더링 (순차 드로우 적용) 🌟
    const myHand = document.getElementById('my-hand');
    myHand.innerHTML = "";
    let newCardCounter = 0;

    me.hand.forEach((card, index) => {
        const playable = isPlayable(card, me);
        const cardEl = document.createElement('div');
        const isNewCard = !previousHandIds.includes(card.instanceId);
        
        if (isNewCard) {
            // 새 카드: 딜레이 계산
            const delaySec = newCardCounter * 0.4;
            const typeClass = card.type === 'basic' ? 'basic-type' : 'standby-type';
            cardEl.className = `card-frame ${typeClass} ${playable ? 'card-playable' : 'card-unplayable'} card-just-drawn`;
            cardEl.style.animationDelay = `${delaySec}s`; 
            
            // 효과음
            setTimeout(() => {
                const snd = sfxCardDraw.cloneNode(); snd.volume = 0.6;
                snd.play().catch(e => console.log("자동재생 방지:", e));
            }, delaySec * 1000);

            // 애니메이션 끝나면 클래스 제거
            setTimeout(() => { if (cardEl) cardEl.classList.remove('card-just-drawn'); }, (delaySec * 1000) + 500);
            newCardCounter++;
        } else {
            // 기존 카드
            const typeClass = card.type === 'basic' ? 'basic-type' : 'standby-type';
            cardEl.className = `card-frame ${typeClass} ${playable ? 'card-playable' : 'card-unplayable'}`;
        }

        // 공통 속성
        cardEl.style.zIndex = index; cardEl.draggable = playable; 
        cardEl.innerHTML = createCardHTML(card);
        
        // 인게임 프리뷰
        cardEl.addEventListener('click', () => showPreviewWithKeywords(card, 'card-preview-box', 'game-keywords', 'game-keyword-list'));
        
        // 드래그 시작
        cardEl.addEventListener('dragstart', (e) => {
            if(!playable && localGameState.phase !== "discard") { e.preventDefault(); return; }
            e.dataTransfer.setData('text/plain', card.instanceId);
            cardEl.classList.add('hover');
        });
        cardEl.addEventListener('dragend', () => cardEl.classList.remove('hover'));
        
        myHand.appendChild(cardEl);
    });
    
    // 현재 패 ID 저장
    previousHandIds = me.hand.map(c => c.instanceId);
}

// --- Interaction ---

// 드롭존 (카드 사용 / 버리기)
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('hover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('hover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('hover');
    if (!localGameState || !currentRoomId) return;
    
    const instanceId = parseInt(e.dataTransfer.getData('text/plain'));
    const me = localGameState.players[myId];
    
    if (localGameState.turn === myId) {
        if (localGameState.phase === "discard") {
            // 패 버리기 기능
            socket.emit('discardCard', { roomId: currentRoomId, instanceId });
        } else if (localGameState.phase === "main") {
            // 카드 사용 기능
            const card = me.hand.find(c => c.instanceId === instanceId);
            if(card && isPlayable(card, me)) {
                if(card.discardCost) {
                    // 마법 카드 조건: 패 선택 모달 열기
                    pendingMagicCardId = instanceId;
                    openModal(`버릴 카드 ${card.discardCost}장을 선택하세요`, me.hand.filter(c => c.instanceId !== instanceId), false, 'magicSelect', card.discardCost);
                } else {
                    socket.emit('playCard', { roomId: currentRoomId, instanceId });
                }
            } else {
                showToast("사용할 수 없습니다.");
            }
        }
    }
});

// 차례 종료 버튼
document.getElementById('end-turn-btn').addEventListener('click', () => {
    if (localGameState && localGameState.turn === myId && localGameState.phase === "main") {
        socket.emit('endTurn', { roomId: currentRoomId });
        document.getElementById('end-turn-btn').classList.add('hidden'); // 클릭 즉시 숨김
    }
});

// 나의 스탠바이 버튼 클릭 (패로 가져오기)
document.getElementById('my-standby-btn').addEventListener('click', () => {
    const me = localGameState.players[myId];
    if(me.pulledStandbyThisTurn || localGameState.turn !== myId || localGameState.phase !== "main") return;
    openModal('스탠바이 풀 (1장 가져오기)', me.standbyDeck, false, 'standby');
});

// 모달 시스템
const modal = document.getElementById('list-modal');
const modalGrid = document.getElementById('modal-grid');
const modalPreview = document.getElementById('modal-preview');
const confirmBtn = document.getElementById('modal-confirm-btn');
let requiredDiscardCount = 0;

function openModal(title, cardArray, shuffle = false, mode = 'view', reqCount = 0) {
    modalMode = mode; selectedDiscardIds = []; requiredDiscardCount = reqCount;
    document.getElementById('modal-title').innerText = title;
    modalGrid.innerHTML = ""; modalPreview.innerHTML = "<p style='color:#8b949e; margin-top:100px; text-align:center;'>카드를<br>선택하세요</p>";
    
    if(mode === 'magicSelect') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = `${reqCount}장 선택 완료`; confirmBtn.disabled = true; }
    else if(mode === 'standby') { confirmBtn.classList.remove('hidden'); confirmBtn.innerText = "패로 가져오기"; confirmBtn.disabled = true; }
    else { confirmBtn.classList.add('hidden'); }

    // 배열 복사 및 셔플(필요시)
    let displayArray = [...cardArray]; if (shuffle) displayArray.sort(() => Math.random() - 0.5);

    displayArray.forEach(card => {
        const cardContainer = document.createElement('div');
        cardContainer.className = 'grid-card-container';
        
        const typeClass = card.type === 'basic' ? 'basic-type' : 'standby-type';
        // 모달 내부는 미니 카드 스타일
        cardContainer.innerHTML = `
            <div class="grid-card card-frame ${typeClass}">
                <div class="card-cost-badge">${card.cost}</div>
                <div class="card-name-label">${card.name}</div>
                <div class="card-effect-text">${colorize(card.textTemplate)}</div>
                <div class="card-image-area"></div>
            </div>
        `;

        cardContainer.addEventListener('click', () => {
            // 모달 프리뷰 (원본 크기 HTML)
            modalPreview.innerHTML = createCardHTML({...card});

            const el = cardContainer.querySelector('.grid-card');
            
            if(mode === 'magicSelect') {
                if (el.classList.contains('selected')) {
                    el.classList.remove('selected'); selectedDiscardIds = selectedDiscardIds.filter(id => id !== card.instanceId);
                } else if (selectedDiscardIds.length < requiredDiscardCount) {
                    el.classList.add('selected'); selectedDiscardIds.push(card.instanceId);
                }
                confirmBtn.disabled = (selectedDiscardIds.length !== requiredDiscardCount);
            } 
            else if(mode === 'standby') {
                // 단일 선택
                modalGrid.querySelectorAll('.grid-card').forEach(c => c.classList.remove('selected'));
                el.classList.add('selected'); selectedDiscardIds = [card.instanceId]; confirmBtn.disabled = false;
            }
        });
        modalGrid.appendChild(cardContainer);
    });
    modal.classList.remove('hidden');
}

confirmBtn.addEventListener('click', () => {
    if(!currentRoomId) return;
    if(modalMode === 'magicSelect' && selectedDiscardIds.length === requiredDiscardCount) {
        socket.emit('playCard', { roomId: currentRoomId, instanceId: pendingMagicCardId, discardTargetIds: selectedDiscardIds });
        modal.classList.add('hidden');
    }
    else if (modalMode === 'standby' && selectedDiscardIds.length === 1) {
        socket.emit('pullStandbyCard', { roomId: currentRoomId, instanceId: selectedDiscardIds[0] });
        modal.classList.add('hidden');
    }
});

// 모달 닫기 버튼
document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('hidden'));

// 인게임 목록 버튼 이벤트
document.getElementById('my-deck-btn').addEventListener('click', () => {
    if(!localGameState) return; openModal('나의 기본 덱 (랜덤 순서)', localGameState.players[myId].deck, true, 'view');
});
document.getElementById('my-grave-btn').addEventListener('click', () => {
    if(!localGameState) return; openModal('나의 카드 무덤', localGameState.players[myId].graveyard, false, 'view');
});
document.getElementById('enemy-grave-btn').addEventListener('click', () => {
    if(!localGameState) return; openModal('상대 카드 무덤', localGameState.players[enemyId].graveyard, false, 'view');
});
document.getElementById('enemy-standby-btn').addEventListener('click', () => {
    if(!localGameState) return; openModal('상대 스탠바이 풀', localGameState.players[enemyId].standbyDeck, false, 'view');
});