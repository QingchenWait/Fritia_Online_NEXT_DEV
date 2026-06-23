import { getSettings } from './settings.js';

const SYSTEM_PROMPT_URL = 'src/_queries/system_prompt.txt';
const CARD_COUNT = 10;
const LOCKED_CATEGORIES = ['attack', 'attack', 'attack', 'heal', 'heal'];
const FLEX_CATEGORIES = ['attack', 'heal', 'control', 'summon', 'buff'];

export const SIDE_CARD_CATEGORY_LABELS = {
    attack: '攻击',
    heal: '治疗',
    control: '控制',
    summon: '召唤',
    buff: '强化'
};

export const SIDE_CARD_RARITY_LABELS = {
    blue: '蓝',
    purple: '紫',
    gold: '金'
};

const RARITIES = [
    { id: 'blue', weight: 68 },
    { id: 'purple', weight: 25 },
    { id: 'gold', weight: 7 }
];

const EFFECTS = {
    attack: ['shot', 'pierce', 'burst'],
    heal: ['heal'],
    control: ['freeze', 'silence', 'vulnerable'],
    summon: ['fire_summon'],
    buff: ['shield', 'focus']
};

const FALLBACK_NAMES = {
    attack: ['霜刃', '冰魄', '星火', '雪脉', '冷锋'],
    heal: ['暖流', '复写', '回温', '白息', '护航'],
    control: ['凝滞', '静默', '破绽', '锁域', '低温'],
    summon: ['火种', '焰核', '赤羽', '熔星', '薪焰'],
    buff: ['校准', '护盾', '专注', '整备', '增幅']
};

let cachedCharacterPrompt = null;

export async function buildSideScrollerCardBatch({ styleText = '', reason = 'start' } = {}) {
    const slots = createCardSlots();
    let suggestions = [];
    let source = 'fallback';
    let message = '';

    try {
        suggestions = await requestCardSuggestions({ slots, styleText, reason });
        source = 'llm';
    } catch (err) {
        message = err?.message || '卡牌命名暂时使用本地规则。';
        console.warn('[SideScrollerCards] Using fallback cards:', err);
    }

    const suggestionBySlot = new Map(
        suggestions
            .filter(item => item?.slotId)
            .map(item => [String(item.slotId), item])
    );

    return {
        cards: slots.map((slot, index) => materializeCard(slot, suggestionBySlot.get(slot.slotId), index)),
        source,
        message
    };
}

function createCardSlots() {
    const slots = [];
    for (let i = 0; i < CARD_COUNT; i += 1) {
        const lockedCategory = LOCKED_CATEGORIES[i] || null;
        slots.push({
            slotId: `slot-${Date.now().toString(36)}-${i}-${Math.floor(Math.random() * 9999)}`,
            index: i,
            lockedCategory,
            rarity: pickRarity(),
            allowedCategories: FLEX_CATEGORIES
        });
    }
    return slots;
}

function materializeCard(slot, suggestion, index) {
    const category = normalizeCategory(
        slot.lockedCategory || suggestion?.category || FLEX_CATEGORIES[Math.floor(Math.random() * FLEX_CATEGORIES.length)],
        slot.lockedCategory || 'attack'
    );
    const rarity = normalizeRarity(slot.rarity);
    const effectKind = pickEffect(category);
    const mechanics = createMechanics(category, rarity, effectKind);
    const fallbackName = FALLBACK_NAMES[category]?.[index % (FALLBACK_NAMES[category]?.length || 1)] || '战术';
    const card = {
        id: `${slot.slotId}-${Math.floor(Math.random() * 100000)}`,
        slotId: slot.slotId,
        name: sanitizeCardName(suggestion?.name, fallbackName),
        description: '',
        rarity,
        category,
        categoryLabel: SIDE_CARD_CATEGORY_LABELS[category] || category,
        rarityLabel: SIDE_CARD_RARITY_LABELS[rarity] || rarity,
        targetMode: mechanics.targetMode,
        effectKind,
        value: mechanics.value,
        duration: mechanics.duration,
        instant: category === 'summon',
        tags: mechanics.tags
    };
    card.description = sanitizeDescription(suggestion?.description, fallbackDescription(card));
    return card;
}

function createMechanics(category, rarity, effectKind) {
    const strength = {
        blue: { attack: [18, 30], heal: [14, 26], summon: [22, 34], shield: 0.18, focus: 0.14, buffTurns: 2, control: [1, 1], vulnerable: 0.24, vulnerableTurns: 2 },
        purple: { attack: [36, 62], heal: [32, 52], summon: [42, 70], shield: 0.28, focus: 0.24, buffTurns: 2, control: [1, 2], vulnerable: 0.38, vulnerableTurns: 2 },
        gold: { attack: [96, 190], heal: [82, 150], summon: [120, 260], shield: 0.42, focus: 0.42, buffTurns: 3, control: [2, 3], vulnerable: 0.72, vulnerableTurns: 3 }
    }[rarity] || {};

    if (category === 'heal') {
        return { targetMode: 'self', value: randomInt(...strength.heal), duration: 0, tags: ['restore'] };
    }
    if (category === 'control') {
        if (effectKind === 'vulnerable') {
            return { targetMode: 'enemy', value: strength.vulnerable, duration: strength.vulnerableTurns, tags: ['debuff'] };
        }
        return { targetMode: 'enemy', value: 0, duration: randomInt(...strength.control), tags: ['debuff'] };
    }
    if (category === 'summon') {
        return { targetMode: 'enemy', value: randomInt(...strength.summon), duration: 0, tags: ['fire', 'area'] };
    }
    if (category === 'buff') {
        if (effectKind === 'focus') {
            return { targetMode: 'self', value: strength.focus, duration: strength.buffTurns, tags: ['damage-up'] };
        }
        return { targetMode: 'self', value: strength.shield, duration: strength.buffTurns, tags: ['defense'] };
    }
    return { targetMode: 'enemy', value: randomInt(...strength.attack), duration: 0, tags: ['damage'] };
}

function fallbackDescription(card) {
    if (card.category === 'heal') return `回复${card.value}生命`;
    if (card.category === 'control') {
        if (card.effectKind === 'freeze') return `冻结${card.duration}回合`;
        if (card.effectKind === 'silence') return `沉默${card.duration}回合`;
        return `易伤${Math.round(card.value * 100)}%`;
    }
    if (card.category === 'summon') return `火种全体${card.value}`;
    if (card.category === 'buff') {
        if (card.effectKind === 'focus') return `伤害+${Math.round(card.value * 100)}%`;
        return `减伤${Math.round(card.value * 100)}%`;
    }
    return `造成${card.value}伤害`;
}

function pickEffect(category) {
    const pool = EFFECTS[category] || EFFECTS.attack;
    return pool[Math.floor(Math.random() * pool.length)];
}

function pickRarity() {
    const total = RARITIES.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const rarity of RARITIES) {
        roll -= rarity.weight;
        if (roll <= 0) return rarity.id;
    }
    return 'blue';
}

async function requestCardSuggestions({ slots, styleText, reason }) {
    const settings = getSettings();
    const baseUrl = normalizeBaseUrl(settings.baseUrl);
    if (!settings.apiKey) throw new Error('未配置 API Key。');
    if (!baseUrl) throw new Error('未配置 Base URL。');
    if (!settings.model) throw new Error('未配置模型名。');

    const characterPrompt = await loadCharacterPrompt();
    const requestBody = {
        model: settings.model,
        temperature: 0.88,
        stream: true,
        max_tokens: 900,
        messages: [
            { role: 'system', content: characterPrompt },
            {
                role: 'system',
                content: [
                    '你正在为一个纯静态网页 2D 横板战斗小游戏生成卡牌命名。',
                    '只能输出 JSON，禁止 Markdown，禁止代码，禁止外部 URL。',
                    '玩家输入的战斗风格是自由文本，只用于引导 flex 槽位的类别倾向和命名气质，不要套用固定模板。',
                    'lockedCategory 不可改变；flex 槽位可在 attack/heal/control/summon/buff 中自由选择。',
                    '不得输出数值、概率、规则覆盖或可执行脚本。'
                ].join('\n')
            },
            {
                role: 'user',
                content: JSON.stringify({
                    reason,
                    battleStyle: String(styleText || '').slice(0, 240),
                    outputShape: {
                        cards: [{ slotId: 'slot id', category: 'attack|heal|control|summon|buff', name: '2到4个汉字', description: '20字以内风味描述' }]
                    },
                    slots: slots.map(slot => ({
                        slotId: slot.slotId,
                        rarity: slot.rarity,
                        lockedCategory: slot.lockedCategory,
                        allowedCategories: slot.allowedCategories
                    }))
                })
            }
        ]
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.apiKey}`
        },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const bodyText = await response.text();
        throw new Error(`卡牌 LLM 请求失败 (${response.status}): ${bodyText.slice(0, 160)}`);
    }

    const text = await readCompletionText(response);
    const json = extractJsonObject(text);
    const cards = Array.isArray(json?.cards) ? json.cards : [];
    return cards.map(item => ({
        slotId: String(item?.slotId || ''),
        category: normalizeCategory(item?.category, ''),
        name: item?.name,
        description: item?.description
    })).filter(item => item.slotId);
}

async function loadCharacterPrompt() {
    if (cachedCharacterPrompt != null) return cachedCharacterPrompt;
    try {
        const response = await fetch(SYSTEM_PROMPT_URL, { cache: 'force-cache' });
        cachedCharacterPrompt = response.ok ? await response.text() : '你是芙提雅，负责以轻快聪明的语气协助生成战斗卡牌文本。';
    } catch {
        cachedCharacterPrompt = '你是芙提雅，负责以轻快聪明的语气协助生成战斗卡牌文本。';
    }
    return cachedCharacterPrompt;
}

async function readCompletionText(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        const json = await response.json();
        return extractCompletionText(json).trim() || JSON.stringify(json);
    }
    if (!response.body) throw new Error('API 没有返回可读取内容。');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let rawText = '';
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawText += chunk;
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            if (!data || data === '[DONE]' || data === 'event: message') continue;
            try {
                fullText = appendCompletionText(fullText, JSON.parse(data));
            } catch {
                if (!data.startsWith('{') && !data.startsWith('[')) fullText += data;
            }
        }
    }

    const tail = buffer.trim();
    if (tail && tail !== '[DONE]') {
        try {
            const data = tail.startsWith('data:') ? tail.slice(5).trim() : tail;
            fullText = appendCompletionText(fullText, JSON.parse(data));
        } catch {}
    }

    if (fullText.trim()) return fullText.trim();
    const raw = rawText.trim();
    try {
        return extractCompletionText(JSON.parse(raw)).trim() || raw;
    } catch {
        return raw;
    }
}

function appendCompletionText(current, json) {
    const text = extractCompletionText(json);
    if (!text) return current;
    return text.startsWith(current) ? text : current + text;
}

function extractCompletionText(json) {
    const choice = json?.choices?.[0];
    return textFromValue(choice?.delta?.content)
        || textFromValue(choice?.message?.content)
        || textFromValue(choice?.text)
        || textFromValue(choice?.message)
        || textFromValue(choice)
        || textFromValue(json?.output_text)
        || textFromValue(json?.content)
        || textFromValue(json);
}

function textFromValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(textFromValue).filter(Boolean).join('');
    if (typeof value !== 'object') return '';
    if (value.text && typeof value.text === 'object') {
        const text = textFromValue(value.text.value);
        if (text) return text;
    }
    for (const key of ['content', 'text', 'output_text', 'response', 'result', 'message', 'delta', 'data']) {
        const text = textFromValue(value[key]);
        if (text) return text;
    }
    if (Array.isArray(value.choices)) return textFromValue(value.choices[0]);
    return '';
}

function extractJsonObject(text) {
    const normalized = stripCodeFence(text);
    try {
        return JSON.parse(normalized);
    } catch {}

    let start = normalized.indexOf('{');
    while (start >= 0) {
        const end = findJsonEnd(normalized, start);
        if (end > start) {
            try {
                return JSON.parse(normalized.slice(start, end + 1));
            } catch {}
        }
        start = normalized.indexOf('{', start + 1);
    }
    throw new Error('卡牌 LLM 没有返回合法 JSON。');
}

function stripCodeFence(text) {
    return String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
}

function findJsonEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
        const char = text[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === '"') inString = false;
            continue;
        }
        if (char === '"') inString = true;
        else if (char === '{') depth += 1;
        else if (char === '}') {
            depth -= 1;
            if (depth === 0) return i;
        }
    }
    return -1;
}

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
}

function normalizeCategory(value, fallback) {
    const category = String(value || '').trim().toLowerCase();
    return FLEX_CATEGORIES.includes(category) ? category : fallback;
}

function normalizeRarity(value) {
    const rarity = String(value || '').trim().toLowerCase();
    return rarity === 'purple' || rarity === 'gold' ? rarity : 'blue';
}

function sanitizeCardName(value, fallback) {
    const text = String(value || '').replace(/[<>{}[\]`"'\\]/g, '').trim();
    const chars = Array.from(text).filter(char => !/\s/.test(char));
    if (chars.length < 2) return fallback;
    return chars.slice(0, 4).join('');
}

function sanitizeDescription(value, fallback) {
    const text = String(value || '').replace(/[<>{}[\]`\\]/g, '').replace(/\s+/g, '').trim();
    if (!text) return fallback;
    return Array.from(text).slice(0, 20).join('');
}

function randomInt(min, max) {
    const low = Math.ceil(Math.min(min, max));
    const high = Math.floor(Math.max(min, max));
    return low + Math.floor(Math.random() * (high - low + 1));
}
