import { buildSideScrollerCardBatch, SIDE_CARD_CATEGORY_LABELS, SIDE_CARD_RARITY_LABELS } from './side_scroller_cards_llm.js?v=20260623-side-combat';

const EVENT_COUNT = 8;
const EVENT_DISTANCE = 560;
const PLAYER_MAX_HP = 120;
const HAND_SIZE = 4;
const PLAYER_CARD_LIMIT = 3;

const ENEMY_NAMES = ['霜蚀兵', '冰壳体', '低温兽', '白噪无人机', '冻潮守卫'];
const BOSS_NAME = '极寒炉心';

const state = {
    panel: null,
    root: null,
    els: {},
    visible: false,
    phase: 'intro',
    styleText: '',
    events: [],
    eventIndex: 0,
    nextEventAt: EVENT_DISTANCE,
    forwardDistance: 0,
    player: createPlayer(),
    enemies: [],
    hand: [],
    deck: [],
    refreshCount: 0,
    guardUses: 3,
    executeUses: 3,
    playsUsed: 0,
    selectedCardId: '',
    pendingSkill: '',
    busy: false,
    log: [],
    getFacing: () => 1,
    getFireScreenPosition: null
};

export function initSideScrollerCombat(options = {}) {
    state.panel = options.panel || document.getElementById('side-scroller-adventure');
    state.getFacing = typeof options.getFacing === 'function' ? options.getFacing : state.getFacing;
    state.getFireScreenPosition = typeof options.getFireScreenPosition === 'function' ? options.getFireScreenPosition : null;
    if (!state.panel) return;
    ensureDom();
    bindEvents();
    renderCombat();
}

export function openSideScrollerCombat() {
    resetCombatState();
    state.visible = true;
    state.root?.classList.remove('hidden');
    renderCombat();
}

export function closeSideScrollerCombat() {
    state.visible = false;
    state.root?.classList.add('hidden');
    state.selectedCardId = '';
    state.pendingSkill = '';
}

export function updateSideScrollerCombat(delta) {
    if (!state.visible) return;
    const dt = Math.max(0, Math.min(0.08, Number(delta) || 0));
    updateEffectTimers(dt);
}

export function isSideScrollerCombatMovementBlocked() {
    return state.visible && !['walk'].includes(state.phase);
}

export function advanceSideScrollerCombatDistance(distance) {
    if (!state.visible || state.phase !== 'walk') return;
    const step = Math.max(0, Number(distance) || 0);
    if (step <= 0) return;
    state.forwardDistance += step;
    if (state.forwardDistance >= state.nextEventAt) {
        void triggerNextEvent();
    } else {
        renderProgressOnly();
    }
}

function resetCombatState() {
    state.phase = 'intro';
    state.styleText = '';
    state.events = [];
    state.eventIndex = 0;
    state.nextEventAt = EVENT_DISTANCE;
    state.forwardDistance = 0;
    state.player = createPlayer();
    state.enemies = [];
    state.hand = [];
    state.deck = [];
    state.refreshCount = 0;
    state.guardUses = 3;
    state.executeUses = 3;
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    state.busy = false;
    state.log = ['输入战斗风格后，向右前进会触发雪原事件。'];
}

function createPlayer() {
    return {
        hp: PLAYER_MAX_HP,
        maxHp: PLAYER_MAX_HP,
        statuses: []
    };
}

function ensureDom() {
    if (state.root) return;
    const root = document.createElement('div');
    root.id = 'side-scroller-combat';
    root.className = 'side-combat hidden';
    root.innerHTML = `
        <div class="side-combat-statusbar" aria-live="polite">
            <div class="side-combat-chip side-combat-chip--progress">
                <span id="side-combat-progress">事件 0/8</span>
                <small id="side-combat-distance">前进 0m</small>
            </div>
            <div class="side-combat-chip">
                <span>全局刷新</span>
                <strong id="side-combat-refresh-count">0</strong>
                <button id="side-combat-refresh" type="button">刷新战术</button>
            </div>
            <div id="side-combat-player-panel" class="side-combat-player" data-combat-target="self" role="button" tabindex="0" aria-label="选择芙提雅">
                <span>芙提雅</span>
                <strong id="side-combat-player-hp">120/120</strong>
                <div class="side-combat-hp"><i id="side-combat-player-hp-bar"></i></div>
                <div id="side-combat-player-status" class="side-combat-status-icons"></div>
            </div>
            <div class="side-combat-skills">
                <button id="side-combat-skill-guard" type="button">神之守护 3</button>
                <button id="side-combat-skill-execute" type="button">御驾亲征 3</button>
            </div>
        </div>
        <div id="side-combat-enemy-layer" class="side-combat-enemy-layer"></div>
        <div id="side-combat-log" class="side-combat-log"></div>
        <div id="side-combat-hand" class="side-combat-hand" aria-label="战斗卡牌"></div>
        <div class="side-combat-actions">
            <button id="side-combat-end-turn" type="button">结束回合</button>
        </div>
        <div id="side-combat-style-panel" class="side-combat-modal">
            <div class="side-combat-modal__panel">
                <span class="side-combat-modal__eyebrow">TACTICAL STYLE</span>
                <h2>冰雪战术设定</h2>
                <p>输入任意战斗风格，模型只会据此影响卡牌倾向和命名；数值与规则由本地校验。</p>
                <textarea id="side-combat-style-input" maxlength="240" placeholder="例如：高爆发、火力压制、偏治疗保护、召唤火种协同"></textarea>
                <button id="side-combat-start" type="button">开始前进</button>
            </div>
        </div>
        <div id="side-combat-reward-panel" class="side-combat-modal hidden">
            <div class="side-combat-modal__panel side-combat-modal__panel--small">
                <span id="side-combat-reward-title" class="side-combat-modal__eyebrow">EVENT CLEAR</span>
                <p id="side-combat-reward-text">事件处理完成。</p>
                <button id="side-combat-continue" type="button">继续前进</button>
            </div>
        </div>
        <div id="side-combat-complete-panel" class="side-combat-modal hidden">
            <div class="side-combat-modal__panel side-combat-modal__panel--small">
                <span id="side-combat-complete-title" class="side-combat-modal__eyebrow">RUN COMPLETE</span>
                <p id="side-combat-complete-text">雪原路线完成。</p>
                <button id="side-combat-restart" type="button">重新开始</button>
            </div>
        </div>
        <div id="side-combat-tooltip" class="side-combat-tooltip hidden"></div>
    `;
    state.panel.appendChild(root);
    state.root = root;
    state.els = {
        progress: root.querySelector('#side-combat-progress'),
        distance: root.querySelector('#side-combat-distance'),
        refreshCount: root.querySelector('#side-combat-refresh-count'),
        refresh: root.querySelector('#side-combat-refresh'),
        playerPanel: root.querySelector('#side-combat-player-panel'),
        playerHp: root.querySelector('#side-combat-player-hp'),
        playerHpBar: root.querySelector('#side-combat-player-hp-bar'),
        playerStatus: root.querySelector('#side-combat-player-status'),
        guard: root.querySelector('#side-combat-skill-guard'),
        execute: root.querySelector('#side-combat-skill-execute'),
        enemyLayer: root.querySelector('#side-combat-enemy-layer'),
        hand: root.querySelector('#side-combat-hand'),
        log: root.querySelector('#side-combat-log'),
        endTurn: root.querySelector('#side-combat-end-turn'),
        stylePanel: root.querySelector('#side-combat-style-panel'),
        styleInput: root.querySelector('#side-combat-style-input'),
        start: root.querySelector('#side-combat-start'),
        rewardPanel: root.querySelector('#side-combat-reward-panel'),
        rewardTitle: root.querySelector('#side-combat-reward-title'),
        rewardText: root.querySelector('#side-combat-reward-text'),
        continue: root.querySelector('#side-combat-continue'),
        completePanel: root.querySelector('#side-combat-complete-panel'),
        completeTitle: root.querySelector('#side-combat-complete-title'),
        completeText: root.querySelector('#side-combat-complete-text'),
        restart: root.querySelector('#side-combat-restart'),
        tooltip: root.querySelector('#side-combat-tooltip')
    };
}

function bindEvents() {
    if (state.root?.dataset.bound === '1') return;
    state.root.dataset.bound = '1';
    state.els.start?.addEventListener('click', () => void startRun());
    state.els.refresh?.addEventListener('click', () => void refreshCards({ consume: true, reason: 'manual' }));
    state.els.guard?.addEventListener('click', useGuardSkill);
    state.els.execute?.addEventListener('click', armExecuteSkill);
    state.els.endTurn?.addEventListener('click', () => void endPlayerTurn());
    state.els.continue?.addEventListener('click', continueWalking);
    state.els.restart?.addEventListener('click', openSideScrollerCombat);
    state.els.playerPanel?.addEventListener('click', () => handleTargetSelection('self'));
    state.els.playerPanel?.addEventListener('pointerup', event => {
        const cardId = state.root?.dataset.dragCardId;
        if (!cardId) return;
        event.preventDefault();
        state.root.dataset.dragCardId = '';
        state.selectedCardId = cardId;
        handleTargetSelection('self');
    });
}

async function startRun() {
    if (state.busy) return;
    state.styleText = state.els.styleInput?.value?.trim() || '';
    state.events = createEventRoute();
    const battleCount = state.events.filter(event => event.kind === 'enemy' || event.kind === 'boss').length;
    state.refreshCount = battleCount + 2;
    state.phase = 'loading';
    state.busy = true;
    state.log = ['正在整理战术卡组。'];
    renderCombat();
    await refreshCards({ consume: false, reason: 'start' });
    if (!state.visible) return;
    state.busy = false;
    state.phase = 'walk';
    pushLog('向右前进，雪原信号会自动接入。');
    renderCombat();
}

function createEventRoute() {
    const events = [];
    for (let i = 0; i < EVENT_COUNT - 1; i += 1) {
        const roll = Math.random();
        if (roll < 0.72) events.push({ kind: 'enemy', level: i + 1 });
        else if (roll < 0.95) events.push({ kind: 'supply', level: i + 1 });
        else events.push({ kind: 'rare', level: i + 1 });
    }
    events.push({ kind: 'boss', level: EVENT_COUNT });
    return events;
}

async function triggerNextEvent() {
    if (state.phase !== 'walk' || state.busy) return;
    const event = state.events[state.eventIndex];
    state.eventIndex += 1;
    state.nextEventAt += EVENT_DISTANCE;
    if (!event) {
        completeRun(true);
        return;
    }
    if (event.kind === 'supply') {
        state.phase = 'reward';
        const heal = Math.min(36, state.player.maxHp - state.player.hp);
        state.player.hp += heal;
        pushLog(`补给点恢复 ${heal} HP。`);
        showReward('SUPPLY POINT', heal > 0 ? `补给完成，芙提雅恢复 ${heal} HP。` : '补给点已清理，当前生命值已满。');
        return;
    }
    if (event.kind === 'rare') {
        state.phase = 'reward';
        state.refreshCount += 1;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + 18);
        pushLog('稀有信标：获得 1 次全局刷新并恢复 18 HP。');
        showReward('RARE SIGNAL', '获得 1 次全局刷新，并恢复 18 HP。');
        return;
    }
    await startBattle(event);
}

async function startBattle(event) {
    state.phase = 'loading';
    state.busy = true;
    state.enemies = createEnemies(event);
    state.playsUsed = 0;
    state.selectedCardId = '';
    state.pendingSkill = '';
    pushLog(event.kind === 'boss' ? 'Boss 信号锁定。' : '敌对反应接近。');
    renderCombat();
    await refreshCards({ consume: false, reason: event.kind });
    if (!state.visible) return;
    state.busy = false;
    state.phase = 'battle';
    pushLog('玩家回合开始。拖动或点击卡牌选择目标。');
    renderCombat();
}

function createEnemies(event) {
    if (event.kind === 'boss') {
        return [{
            id: `boss-${Date.now()}`,
            name: BOSS_NAME,
            boss: true,
            maxHp: 360,
            hp: 360,
            attack: 18,
            statuses: []
        }];
    }
    const count = event.level >= 5 ? 3 : (event.level >= 3 ? 2 : 1);
    return Array.from({ length: count }, (_, index) => {
        const hp = 58 + event.level * 9 + index * 10;
        return {
            id: `enemy-${Date.now()}-${index}`,
            name: ENEMY_NAMES[(event.level + index) % ENEMY_NAMES.length],
            boss: false,
            maxHp: hp,
            hp,
            attack: 9 + event.level * 2 + index,
            statuses: []
        };
    });
}

async function refreshCards({ consume, reason }) {
    if (state.busy && reason === 'manual') return;
    if (consume && state.refreshCount <= 0) {
        pushLog('全局刷新次数不足。');
        renderCombat();
        return;
    }
    if (consume) state.refreshCount -= 1;
    const previousBusy = state.busy;
    state.busy = true;
    renderCombat();
    const batch = await buildSideScrollerCardBatch({ styleText: state.styleText, reason });
    state.hand = batch.cards.slice(0, HAND_SIZE);
    state.deck = batch.cards.slice(HAND_SIZE);
    if (batch.source === 'llm') pushLog('战术卡组已由模型命名。');
    else if (batch.message) pushLog('使用本地战术卡组。');
    state.selectedCardId = '';
    state.busy = previousBusy && reason !== 'manual';
    if (reason === 'manual') state.busy = false;
    renderCombat();
}

function handleCardClick(cardId) {
    if (state.phase !== 'battle' || state.busy) return;
    state.pendingSkill = '';
    state.selectedCardId = state.selectedCardId === cardId ? '' : cardId;
    renderHand();
}

function handleTargetSelection(targetId) {
    if (state.phase !== 'battle' || state.busy) return;
    if (state.pendingSkill === 'execute') {
        const enemy = state.enemies.find(item => item.id === targetId);
        if (enemy) useExecuteSkill(enemy);
        return;
    }
    const card = state.hand.find(item => item.id === state.selectedCardId);
    if (!card) return;
    if (card.targetMode === 'self' && targetId !== 'self') {
        pushLog('这张牌需要对芙提雅使用。');
        renderCombat();
        return;
    }
    if (card.targetMode === 'enemy' && targetId === 'self') {
        pushLog('这张牌需要选择敌方目标。');
        renderCombat();
        return;
    }
    const target = targetId === 'self' ? state.player : state.enemies.find(item => item.id === targetId);
    if (!target) return;
    void playCard(card, target);
}

async function playCard(card, target) {
    if (!card.instant && state.playsUsed >= PLAYER_CARD_LIMIT) {
        pushLog('本回合出牌次数已满。');
        renderCombat();
        return;
    }
    state.hand = state.hand.filter(item => item.id !== card.id);
    state.selectedCardId = '';
    if (!card.instant) state.playsUsed += 1;
    applyCardEffect(card, target);
    drawUntilHandSize();
    if (isBattleWon()) {
        finishBattle();
        return;
    }
    if (state.playsUsed >= PLAYER_CARD_LIMIT) await endPlayerTurn();
    else renderCombat();
}

function applyCardEffect(card, target) {
    if (card.category === 'heal') {
        const before = state.player.hp;
        state.player.hp = Math.min(state.player.maxHp, state.player.hp + card.value);
        floatAtPlayer(`+${state.player.hp - before}`, 'heal');
        pushLog(`${card.name}：恢复 ${state.player.hp - before} HP。`);
        return;
    }
    if (card.category === 'buff') {
        if (card.effectKind === 'focus') addStatus(state.player, 'focus', card.duration, card.value);
        else addStatus(state.player, 'shield', card.duration, card.value);
        pushLog(`${card.name}：获得${card.effectKind === 'focus' ? '专注' : '护盾'}。`);
        return;
    }
    if (card.category === 'control') {
        if (card.effectKind === 'freeze') addStatus(target, 'freeze', card.duration, 0);
        else if (card.effectKind === 'silence') addStatus(target, 'silence', card.duration, 0);
        else addStatus(target, 'vulnerable', card.duration, card.value);
        floatAtEnemy(target.id, '状态', 'status');
        pushLog(`${card.name}：施加${statusLabel(card.effectKind)}。`);
        return;
    }
    if (card.category === 'summon') {
        state.enemies.filter(isAlive).forEach(enemy => {
            dealDamage(enemy, card.value, card);
            fireRayToEnemy(enemy.id);
        });
        pushLog(`${card.name}：火种协同攻击全体敌人。`);
        return;
    }
    dealDamage(target, computeOutgoingDamage(card.value), card);
    pushLog(`${card.name}：造成 ${computeOutgoingDamage(card.value)} 伤害。`);
}

function computeOutgoingDamage(base) {
    const focus = sumStatusValue(state.player, 'focus');
    return Math.max(1, Math.round(base * (1 + focus)));
}

function dealDamage(enemy, amount, card = null) {
    const vulnerable = sumStatusValue(enemy, 'vulnerable');
    const damage = Math.max(1, Math.round(amount * (1 + vulnerable)));
    enemy.hp = Math.max(0, enemy.hp - damage);
    floatAtEnemy(enemy.id, `-${damage}`, card?.category === 'summon' ? 'fire' : 'damage');
    shakeEnemy(enemy.id);
}

async function endPlayerTurn() {
    if (state.phase !== 'battle' || state.busy) return;
    state.selectedCardId = '';
    state.pendingSkill = '';
    state.busy = true;
    renderCombat();
    await wait(260);
    pushLog('敌方回合。');
    for (const enemy of state.enemies.filter(isAlive)) {
        if (hasStatus(enemy, 'freeze') || hasStatus(enemy, 'silence')) {
            pushLog(`${enemy.name} 行动受阻。`);
            continue;
        }
        const damage = computeIncomingDamage(enemy.attack);
        state.player.hp = Math.max(0, state.player.hp - damage);
        floatAtPlayer(`-${damage}`, 'damage');
        if (state.player.hp <= 0) {
            completeRun(false);
            return;
        }
        await wait(180);
    }
    tickStatuses(state.enemies);
    tickStatuses([state.player]);
    state.playsUsed = 0;
    drawUntilHandSize();
    state.busy = false;
    pushLog('玩家回合开始。');
    renderCombat();
}

function computeIncomingDamage(base) {
    const defense = sumStatusValue(state.player, 'shield') + sumStatusValue(state.player, 'guard_defense');
    const vulnerability = sumStatusValue(state.player, 'guard_vulnerable');
    return Math.max(1, Math.round(base * (1 + vulnerability) * Math.max(0.18, 1 - defense)));
}

function drawUntilHandSize() {
    while (state.hand.length < HAND_SIZE && state.deck.length > 0) {
        state.hand.push(state.deck.shift());
    }
}

function finishBattle() {
    state.phase = 'reward';
    state.enemies = [];
    state.playsUsed = 0;
    state.pendingSkill = '';
    state.selectedCardId = '';
    pushLog('战斗完成。');
    if (state.eventIndex >= EVENT_COUNT) {
        completeRun(true);
        return;
    }
    showReward('BATTLE CLEAR', '敌对信号已清除，向前继续搜索。');
}

function continueWalking() {
    if (state.phase !== 'reward') return;
    state.els.rewardPanel?.classList.add('hidden');
    state.phase = 'walk';
    renderCombat();
}

function completeRun(victory) {
    state.phase = victory ? 'complete' : 'defeat';
    state.busy = false;
    state.els.rewardPanel?.classList.add('hidden');
    state.els.completePanel?.classList.remove('hidden');
    if (state.els.completeTitle) state.els.completeTitle.textContent = victory ? 'RUN COMPLETE' : 'RUN FAILED';
    if (state.els.completeText) {
        state.els.completeText.textContent = victory
            ? '雪原路线完成，芙提雅安全返回信标点。'
            : '芙提雅生命值归零，路线已中断。';
    }
    pushLog(victory ? '雪原路线完成。' : '路线中断。');
    renderCombat();
}

function showReward(title, text) {
    if (state.els.rewardTitle) state.els.rewardTitle.textContent = title;
    if (state.els.rewardText) state.els.rewardText.textContent = text;
    state.els.rewardPanel?.classList.remove('hidden');
    renderCombat();
}

function useGuardSkill() {
    if (state.phase !== 'battle' || state.busy || state.guardUses <= 0) return;
    state.guardUses -= 1;
    state.player.hp = state.player.maxHp;
    addStatus(state.player, 'guard_defense', 3, 0.35);
    addStatus(state.player, 'guard_vulnerable', 3, 0.25);
    state.enemies.filter(isAlive).forEach(enemy => addStatus(enemy, 'silence', 1, 0));
    floatAtPlayer('FULL', 'heal');
    pushLog('神之守护：生命全满，敌方下回合沉默。');
    renderCombat();
}

function armExecuteSkill() {
    if (state.phase !== 'battle' || state.busy || state.executeUses <= 0) return;
    state.pendingSkill = state.pendingSkill === 'execute' ? '' : 'execute';
    state.selectedCardId = '';
    pushLog(state.pendingSkill ? '选择御驾亲征目标。' : '取消御驾亲征。');
    renderCombat();
}

function useExecuteSkill(enemy) {
    if (state.executeUses <= 0 || !isAlive(enemy)) return;
    if (enemy.boss && enemy.hp / enemy.maxHp > 0.5) {
        pushLog('Boss 生命高于 50%，御驾亲征暂不可用。');
        state.pendingSkill = '';
        renderCombat();
        return;
    }
    state.executeUses -= 1;
    state.pendingSkill = '';
    enemy.hp = 0;
    floatAtEnemy(enemy.id, '-99999999', 'execute');
    shakeEnemy(enemy.id);
    fireRayToEnemy(enemy.id);
    pushLog('御驾亲征：目标已清除。');
    if (isBattleWon()) finishBattle();
    else renderCombat();
}

function renderCombat() {
    if (!state.root) return;
    state.root.classList.toggle('is-battle', state.phase === 'battle');
    state.root.classList.toggle('is-loading', state.busy || state.phase === 'loading');
    state.els.stylePanel?.classList.toggle('hidden', state.phase !== 'intro');
    state.els.rewardPanel?.classList.toggle('hidden', state.phase !== 'reward');
    state.els.completePanel?.classList.toggle('hidden', state.phase !== 'complete' && state.phase !== 'defeat');
    renderProgressOnly();
    renderPlayer();
    renderSkills();
    renderEnemies();
    renderHand();
    renderLog();
}

function renderProgressOnly() {
    if (state.els.progress) state.els.progress.textContent = `事件 ${Math.min(state.eventIndex, EVENT_COUNT)}/${EVENT_COUNT}`;
    if (state.els.distance) {
        const remain = Math.max(0, state.nextEventAt - state.forwardDistance);
        state.els.distance.textContent = state.phase === 'walk' ? `距下个信号 ${Math.ceil(remain)}m` : phaseLabel(state.phase);
    }
    if (state.els.refreshCount) state.els.refreshCount.textContent = String(state.refreshCount);
}

function renderPlayer() {
    const pct = clamp01(state.player.hp / state.player.maxHp);
    if (state.els.playerHp) state.els.playerHp.textContent = `${state.player.hp}/${state.player.maxHp}`;
    if (state.els.playerHpBar) state.els.playerHpBar.style.width = `${pct * 100}%`;
    renderStatusIcons(state.els.playerStatus, state.player.statuses);
}

function renderSkills() {
    if (state.els.guard) {
        state.els.guard.textContent = `神之守护 ${state.guardUses}`;
        state.els.guard.disabled = state.phase !== 'battle' || state.guardUses <= 0 || state.busy;
    }
    if (state.els.execute) {
        state.els.execute.textContent = `御驾亲征 ${state.executeUses}`;
        state.els.execute.disabled = state.phase !== 'battle' || state.executeUses <= 0 || state.busy;
        state.els.execute.classList.toggle('is-armed', state.pendingSkill === 'execute');
    }
    if (state.els.refresh) {
        state.els.refresh.disabled = state.refreshCount <= 0 || state.busy || !['battle', 'walk'].includes(state.phase);
    }
    if (state.els.endTurn) {
        state.els.endTurn.disabled = state.phase !== 'battle' || state.busy;
    }
}

function renderEnemies() {
    const layer = state.els.enemyLayer;
    if (!layer) return;
    layer.textContent = '';
    if (state.phase !== 'battle' && state.phase !== 'loading') return;
    state.enemies.forEach((enemy, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-enemy${enemy.boss ? ' side-combat-enemy--boss' : ''}`;
        button.dataset.enemyId = enemy.id;
        button.dataset.combatTarget = 'enemy';
        button.disabled = !isAlive(enemy) || state.busy;
        button.style.setProperty('--enemy-index', String(index));
        const name = document.createElement('span');
        name.className = 'side-combat-enemy__name';
        name.textContent = enemy.name;
        const hp = document.createElement('strong');
        hp.textContent = `${enemy.hp}/${enemy.maxHp}`;
        const bar = document.createElement('i');
        bar.className = 'side-combat-enemy__hp';
        bar.style.width = `${clamp01(enemy.hp / enemy.maxHp) * 100}%`;
        const status = document.createElement('div');
        status.className = 'side-combat-status-icons';
        renderStatusIcons(status, enemy.statuses);
        button.append(name, hp, bar, status);
        button.addEventListener('click', () => handleTargetSelection(enemy.id));
        button.addEventListener('pointerup', event => {
            const cardId = state.root?.dataset.dragCardId;
            if (!cardId) return;
            event.preventDefault();
            state.root.dataset.dragCardId = '';
            state.selectedCardId = cardId;
            handleTargetSelection(enemy.id);
        });
        layer.appendChild(button);
    });
}

function renderHand() {
    const hand = state.els.hand;
    if (!hand) return;
    hand.textContent = '';
    if (state.phase !== 'battle' && state.phase !== 'loading') return;
    state.hand.forEach(card => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `side-combat-card side-combat-card--${card.rarity}`;
        button.dataset.cardId = card.id;
        button.disabled = state.phase !== 'battle' || state.busy;
        button.classList.toggle('is-selected', state.selectedCardId === card.id);
        button.title = `${card.categoryLabel} / ${card.rarityLabel}：${mechanicsText(card)}`;
        const top = document.createElement('span');
        top.className = 'side-combat-card__top';
        top.textContent = `${SIDE_CARD_RARITY_LABELS[card.rarity] || card.rarity} · ${SIDE_CARD_CATEGORY_LABELS[card.category] || card.category}`;
        const name = document.createElement('strong');
        name.textContent = card.name;
        const desc = document.createElement('small');
        desc.textContent = card.description;
        const value = document.createElement('span');
        value.className = 'side-combat-card__value';
        value.textContent = mechanicsText(card);
        button.append(top, name, desc, value);
        button.addEventListener('click', () => handleCardClick(card.id));
        button.addEventListener('pointerdown', event => {
            if (state.phase !== 'battle' || state.busy) return;
            state.root.dataset.dragCardId = card.id;
            button.setPointerCapture?.(event.pointerId);
            button.classList.add('is-dragging');
        });
        button.addEventListener('pointerup', event => {
            button.releasePointerCapture?.(event.pointerId);
            button.classList.remove('is-dragging');
            const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-combat-target]');
            const cardId = state.root.dataset.dragCardId;
            state.root.dataset.dragCardId = '';
            if (!cardId || !target) return;
            state.selectedCardId = cardId;
            if (target.dataset.combatTarget === 'self') handleTargetSelection('self');
            else handleTargetSelection(target.dataset.enemyId);
        });
        button.addEventListener('pointercancel', () => {
            state.root.dataset.dragCardId = '';
            button.classList.remove('is-dragging');
        });
        hand.appendChild(button);
    });
}

function renderStatusIcons(container, statuses) {
    if (!container) return;
    container.textContent = '';
    statuses.filter(status => status.turns > 0).forEach(status => {
        const span = document.createElement('span');
        span.className = `side-combat-status side-combat-status--${status.id}`;
        span.textContent = statusIcon(status.id);
        span.title = `${statusLabel(status.id)} ${status.turns}回合`;
        container.appendChild(span);
    });
}

function renderLog() {
    if (!state.els.log) return;
    state.els.log.textContent = state.log.slice(-4).join('\n');
}

function mechanicsText(card) {
    if (card.category === 'heal') return `+${card.value}`;
    if (card.category === 'control') return `${statusLabel(card.effectKind)}${card.duration}`;
    if (card.category === 'summon') return `群体${card.value}`;
    if (card.category === 'buff') return card.effectKind === 'focus'
        ? `伤害+${Math.round(card.value * 100)}%`
        : `减伤${Math.round(card.value * 100)}%`;
    return `${card.value}`;
}

function addStatus(target, id, turns, value) {
    const existing = target.statuses.find(status => status.id === id);
    if (existing) {
        existing.turns = Math.max(existing.turns, turns);
        existing.value = Math.max(existing.value || 0, value || 0);
    } else {
        target.statuses.push({ id, turns, value });
    }
}

function tickStatuses(targets) {
    targets.forEach(target => {
        target.statuses.forEach(status => { status.turns -= 1; });
        target.statuses = target.statuses.filter(status => status.turns > 0);
    });
}

function hasStatus(target, id) {
    return target.statuses.some(status => status.id === id && status.turns > 0);
}

function sumStatusValue(target, id) {
    return target.statuses
        .filter(status => status.id === id && status.turns > 0)
        .reduce((sum, status) => sum + (Number(status.value) || 0), 0);
}

function isBattleWon() {
    return state.enemies.length > 0 && state.enemies.every(enemy => !isAlive(enemy));
}

function isAlive(entity) {
    return Number(entity?.hp || 0) > 0;
}

function pushLog(text) {
    state.log.push(text);
    if (state.log.length > 12) state.log.shift();
}

function phaseLabel(phase) {
    if (phase === 'intro') return '等待设定';
    if (phase === 'loading') return '整理卡组';
    if (phase === 'battle') return `出牌 ${state.playsUsed}/${PLAYER_CARD_LIMIT}`;
    if (phase === 'reward') return '事件完成';
    if (phase === 'complete') return '路线完成';
    if (phase === 'defeat') return '路线中断';
    return '前进中';
}

function statusLabel(id) {
    return {
        freeze: '冻结',
        silence: '沉默',
        vulnerable: '易伤',
        shield: '护盾',
        focus: '专注',
        guard_defense: '守护减伤',
        guard_vulnerable: '守护易伤'
    }[id] || id;
}

function statusIcon(id) {
    return {
        freeze: '冻',
        silence: '默',
        vulnerable: '破',
        shield: '盾',
        focus: '准',
        guard_defense: '守',
        guard_vulnerable: '险'
    }[id] || '?';
}

function floatAtEnemy(enemyId, text, type) {
    const target = findEnemyElement(enemyId);
    floatAtElement(target, text, type);
}

function floatAtPlayer(text, type) {
    floatAtElement(state.els.playerPanel, text, type);
}

function floatAtElement(target, text, type) {
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const floater = document.createElement('span');
    floater.className = `side-combat-float side-combat-float--${type}`;
    floater.textContent = text;
    floater.style.left = `${targetRect.left - rootRect.left + targetRect.width * 0.5}px`;
    floater.style.top = `${targetRect.top - rootRect.top + targetRect.height * 0.22}px`;
    state.root.appendChild(floater);
    setTimeout(() => floater.remove(), 900);
}

function shakeEnemy(enemyId) {
    const target = findEnemyElement(enemyId);
    if (!target) return;
    target.classList.remove('is-hit');
    void target.offsetWidth;
    target.classList.add('is-hit');
}

function fireRayToEnemy(enemyId) {
    const target = findEnemyElement(enemyId);
    if (!target || !state.root) return;
    const targetRect = target.getBoundingClientRect();
    const rootRect = state.root.getBoundingClientRect();
    const fire = state.getFireScreenPosition?.() || {
        x: rootRect.width * 0.5 - state.getFacing() * 92,
        y: rootRect.height * 0.46
    };
    const end = {
        x: targetRect.left - rootRect.left + targetRect.width * 0.5,
        y: targetRect.top - rootRect.top + targetRect.height * 0.45
    };
    const dx = end.x - fire.x;
    const dy = end.y - fire.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const ray = document.createElement('i');
    ray.className = 'side-combat-ray';
    ray.style.left = `${fire.x}px`;
    ray.style.top = `${fire.y}px`;
    ray.style.width = `${length}px`;
    ray.style.transform = `rotate(${angle}rad)`;
    state.root.appendChild(ray);
    setTimeout(() => ray.remove(), 360);
}

function findEnemyElement(enemyId) {
    const id = String(enemyId || '');
    return [...(state.root?.querySelectorAll('[data-enemy-id]') || [])]
        .find(element => element.dataset.enemyId === id) || null;
}

function updateEffectTimers() {
    renderProgressOnly();
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}
