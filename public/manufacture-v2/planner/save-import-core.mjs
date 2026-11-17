// Local-only X-Piratez v.o2 save reader for the manufacturing planner.
// Deliberately parses a strict, indentation-based subset of the OXCE save
// instead of feeding arbitrary user-supplied YAML into a general YAML loader.
// No network, persistent storage, or save-file writes.
const MAX_SAVE_BYTES = 24 * 1024 * 1024;
const MAX_LINES = 300000;
const MAX_BASES = 32;
const MAX_ITEMS_PER_BASE = 20000;
const MAX_RESEARCH_IDS = 120000;
const ITEM_ID = /^[A-Za-z0-9_.-]+$/;
const TOP_KEY = /^[A-Za-z_][A-Za-z0-9_]*:/;
const ITEM_LINE = /^      ([A-Za-z0-9_.-]+):\s*(\d+)\s*(?:#.*)?$/;
const MAX_VALUE = 10000000;

const stripScalar = input => {
  const value = String(input ?? '').trim();
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    // Decode the quoting used by OXCE output; never interpret executable tags.
    const inner = value.slice(1, -1);
    return value.startsWith("'") ? inner.replaceAll("''", "'") :
      inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
};
const safeScalar = (value, max = 160) => stripScalar(value).slice(0, max);
const isDocumentDivider = line => /^---\s*$/.test(line);
const positiveStoreCount = value => Number.isSafeInteger(value) && value > 0 && value <= MAX_VALUE;

export function parsePiratezV2Save(text, { itemIds, researchIds } = {}) {
  if (typeof text !== 'string' || text.length === 0)
    throw new Error('읽을 수 있는 OXCE 세이브 텍스트가 아닙니다.');
  if (text.length > MAX_SAVE_BYTES)
    throw new Error('세이브 텍스트가 24MB 제한을 초과했습니다.');
  if (!(itemIds instanceof Set) || !(researchIds instanceof Set))
    throw new Error('비교할 X-Piratez 2.1 아이템·연구 인덱스가 필요합니다.');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length > MAX_LINES) throw new Error('세이브의 줄 수가 허용 범위를 초과했습니다.');
  const split = lines.findIndex(isDocumentDivider);
  if (split < 1) throw new Error('OXCE 세이브의 메타데이터/본문 경계를 찾지 못했습니다.');
  const header = lines.slice(0, split);
  const metadata = { version: null, engine: null, mods: [] };
  let inMods = false;
  for (const line of header) {
    if (line.startsWith('version:')) metadata.version = stripScalar(line.slice(8));
    if (line.startsWith('engine:')) metadata.engine = stripScalar(line.slice(7));
    if (line === 'mods:') { inMods = true; continue; }
    if (!inMods) continue;
    if (TOP_KEY.test(line)) inMods = false;
    else if (/^  -\s+/.test(line))
      metadata.mods.push(stripScalar(line.replace(/^  -\s+/, '')));
  }
  // This is intentionally strict: an old save is never used as evidence for
  // the public v.o2 index, even if some item names look identical.
  if (metadata.version !== 'Extended 8.7.1' || metadata.engine !== 'Extended' ||
      !metadata.mods.includes('piratez ver: v.o2')) {
    throw new Error('이 세이브는 Extended 8.7.1 + piratez v.o2 조합으로 확인되지 않았습니다.');
  }

  const bases = [];
  const discovered = new Set();
  const warnings = [];
  let section = '', currentBase = null, inStores = false, seenStores = false;
  let seenDiscovered = false;
  let ignoredItemEntries = 0, ignoredResearchEntries = 0, counted = 0;
  for (let index = split + 1; index < lines.length; index++) {
    const line = lines[index];
    if (TOP_KEY.test(line)) {
      section = line.slice(0, line.indexOf(':'));
      if (section === 'discovered') seenDiscovered = true;
      currentBase = null; inStores = false; seenStores = false;
      continue;
    }
    if (section === 'bases') {
      const newBase = line.match(/^  -(?:\s|$)/);
      if (newBase) {
        if (bases.length >= MAX_BASES) throw new Error('세이브에 기지가 32개를 초과합니다.');
        currentBase = { index: bases.length, name: '기지 ' + (bases.length + 1),
          items: Object.create(null), knownKinds: 0, excludedKinds: 0,
          missingStores: true };
        bases.push(currentBase);
        inStores = false;seenStores = false;
        continue;
      }
      if (!currentBase) continue;
      const name = line.match(/^    name:\s*(.*?)\s*$/);
      if (name) currentBase.name = safeScalar(name[1], 120) || currentBase.name;
      const stores = line.match(/^    items:\s*(.*?)\s*$/);
      if (stores) {
        if (seenStores) throw new Error('기지의 items 저장구역이 중복되었습니다.');
        seenStores = true;
        currentBase.missingStores = false;
        inStores = stores[1] === '';
        if (stores[1] !== '' && stores[1] !== '{}')
          throw new Error('지원하지 않는 기지 items 표현 방식입니다.');
        continue;
      }
      if (inStores && (/^    [^ ]/.test(line) || /^  -\s/.test(line))) {
        inStores = false;
      }
      if (!inStores) continue;
      if (!line.trim() || /^\s*#/.test(line)) continue;
      if (!line.startsWith('      ') || line.startsWith('       '))
        throw new Error('지원하지 않는 items 들여쓰기입니다.');
      const item = line.match(ITEM_LINE);
      if (!item) throw new Error('기지 items의 수량/ID 형식을 해석할 수 없습니다.');
      const [, id, raw] = item, quantity = Number(raw);
      if (!positiveStoreCount(quantity)) {
        if (quantity === 0) continue;
        throw new Error('세이브 재고가 범위를 초과하거나 정수가 아닙니다: ' + id);
      }
      counted++;
      if (counted > MAX_ITEMS_PER_BASE * Math.max(bases.length, 1))
        throw new Error('기지 재고 항목이 허용 범위를 초과했습니다.');
      if (!itemIds.has(id)) {
        currentBase.excludedKinds++; ignoredItemEntries++; continue;
      }
      if (Object.hasOwn(currentBase.items, id))
        throw new Error('세이브에 중복된 기지 재고 ID가 있습니다: ' + id);
      currentBase.items[id] = quantity;
    } else if (section === 'discovered') {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const m = line.match(/^  -\s+(.+?)\s*$/);
      if (!m) throw new Error('discovered 목록에서 지원하지 않는 표현을 발견했습니다.');
      const id = stripScalar(m[1]);
      if (!ITEM_ID.test(id)) throw new Error('연구 ID 형식이 유효하지 않습니다.');
      if (discovered.size + ignoredResearchEntries > MAX_RESEARCH_IDS)
        throw new Error('연구 항목이 너무 많습니다.');
      if (researchIds.has(id)) discovered.add(id);
      else ignoredResearchEntries++;
    }
  }
  if (bases.length === 0) throw new Error('세이브에서 기지를 찾지 못했습니다.');
  if (!seenDiscovered) throw new Error('세이브에서 discovered 연구 목록을 찾지 못했습니다.');
  if (bases.some(x => x.missingStores))
    throw new Error('일부 기지의 items 저장구역을 찾지 못해 재고를 정확히 가져올 수 없습니다.');
  for (const base of bases) base.knownKinds = Object.keys(base.items).length;
  warnings.push('세이브 헤더에서 버전을 확인했지만 룰셋 SHA-256은 포함되어 있지 않습니다. 정확히 동일한 게임 규칙을 사용했다고 확정할 수는 없습니다.');
  if (ignoredItemEntries)
    warnings.push('현재 2.1 아이템 목록에서 확인되지 않는 기지 재고 ' +
      ignoredItemEntries + '개 항목은 가져오지 않았습니다 (추가 모드/바닐라 항목일 수 있음).');
  if (ignoredResearchEntries)
    warnings.push('2.1 연구 목록에 없는 discovered ID ' +
      ignoredResearchEntries + '개는 완료 연구 판정에서 제외했습니다.');
  if (metadata.mods.length > 1)
    warnings.push('다른 모드가 함께 활성화된 세이브입니다. 이 계산기는 별도 모드의 제조식 변경을 반영하지 않습니다.');
  return {
    schema: 'xpiratez-v2-local-save-preview/v1',
    gameVersion: metadata.version, modVersion: 'v.o2',
    additionalMods: metadata.mods.filter(x => x !== 'piratez ver: v.o2'),
    bases,
    discovered: [...discovered].sort((a,b)=>a.localeCompare(b, 'en')),
    excludedItemKinds: ignoredItemEntries,
    excludedResearchCount: ignoredResearchEntries,
    warnings
  };
}

export function selectSaveInventory(preview, baseSelection = '0') {
  if (preview?.schema !== 'xpiratez-v2-local-save-preview/v1')
    throw new Error('올바른 2.1 세이브 미리보기가 아닙니다.');
  if (baseSelection !== 'all' &&
      (!/^\d+$/.test(String(baseSelection)) ||
       Number(baseSelection) >= preview.bases.length))
    throw new Error('존재하지 않는 기지입니다.');
  const bases = baseSelection === 'all'
    ? preview.bases : [preview.bases[Number(baseSelection)]];
  const inventory = Object.create(null);
  for (const base of bases) for (const [id, count] of Object.entries(base.items)) {
    inventory[id] = (inventory[id] || 0) + count;
    if (!Number.isSafeInteger(inventory[id]) || inventory[id] > MAX_VALUE)
      throw new Error('합산 재고가 10,000,000을 초과합니다: ' + id);
  }
  return inventory;
}
