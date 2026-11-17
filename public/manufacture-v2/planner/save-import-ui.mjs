import { parsePiratezV2Save, selectSaveInventory } from './save-import-core.mjs';

// Only a user-selected File is read. No remote requests, browser storage,
// mutation of the save, or publication of its contents.
export function initV2SaveImportUI({ itemIds, researchIds, onApply, onDisconnect }) {
  const $ = id => document.getElementById(id);
  const input = $('save-file'), status = $('save-message');
  const section = $('save-preview'), baseSelect = $('save-base');
  const active = $('save-active');
  let preview = null, fileName = '', request = 0;

  const text = (tag, body, parent) => {
    const element = document.createElement(tag);
    element.textContent = String(body);
    parent.appendChild(element);
    return element;
  };
  const count = n => Number(n).toLocaleString('ko-KR');
  const renderSelection = () => {
    if (!preview) return;
    const stock = selectSaveInventory(preview, baseSelect.value);
    const selected = baseSelect.value === 'all'
      ? '전체 ' + count(preview.bases.length) + '개 기지 (수송 가능 여부 미검증)'
      : preview.bases[Number(baseSelect.value)].name;
    $('save-metadata').textContent = '파일: ' + fileName +
      ' · 버전: Extended 8.7.1 / piratez v.o2 · ' +
      selected + ' · 적용 가능한 재고 ' + count(Object.keys(stock).length) + '종' +
      ' · 세이브 discovered 연구 ' + count(preview.discovered.length) + '개';
  };
  const resetPreview = () => {
    preview = null;
    section.hidden = true;
    $('save-warnings').replaceChildren();
    baseSelect.replaceChildren();
  };
  input.addEventListener('change', async () => {
    const seq = ++request;
    resetPreview();
    const file = input.files?.[0];
    if (!file) return;
    // Allow selecting the same file again after switching saves.
    input.value = '';
    if (!file.name.toLowerCase().endsWith('.sav')) {
      status.textContent = '확장자가 .sav인 OXCE 게임 세이브만 선택하세요.';
      return;
    }
    if (file.size > 24 * 1024 * 1024) {
      status.textContent = '파일이 24MB를 초과합니다. 선택한 파일은 읽지 않았습니다.';
      return;
    }
    status.textContent = '선택한 세이브를 이 브라우저에서 해석하는 중…';
    try {
      const raw = await file.text();
      if (seq !== request) return;
      const result = parsePiratezV2Save(raw, { itemIds, researchIds });
      preview = result;
      fileName = file.name;
      result.bases.forEach((base, index) => {
        const option = text('option', base.name + ' — 보관 재고 ' +
          count(base.knownKinds) + '종', baseSelect);
        option.value = String(index);
      });
      if (result.bases.length > 1) {
        const option = text('option', '모든 기지의 재고 합산 (기지 간 이동 조건 미검증)', baseSelect);
        option.value = 'all';
      }
      baseSelect.value = '0'; // one base; not an unjustified global pool
      const warningList = $('save-warnings');
      warningList.replaceChildren();
      for (const warning of result.warnings) text('p', warning, warningList);
      renderSelection();
      section.hidden = false;
      status.textContent = '2.1 세이브의 일부 자료를 해석했습니다. 기지를 선택한 뒤 적용하세요. ' +
        '현재 직접 입력한 재고는 아직 변경하지 않았습니다.';
    } catch (error) {
      resetPreview();
      status.textContent = '세이브 가져오기 중단: ' + error.message;
    }
  });
  baseSelect.addEventListener('change', () => {
    try { renderSelection(); } catch(error) {status.textContent = error.message;}
  });
  $('save-apply').addEventListener('click', () => {
    if (!preview) return;
    try {
      const inventory = selectSaveInventory(preview, baseSelect.value);
      onApply({
        inventory, discoveredResearchIds: preview.discovered,
        scope: baseSelect.value === 'all'
          ? '전체 기지 합산 (수송 조건 미반영)'
          : preview.bases[Number(baseSelect.value)].name,
        knownKinds: Object.keys(inventory).length,
        confirmedResearchCount: preview.discovered.length,
        additionalModCount: preview.additionalMods.length
      });
      active.hidden = false;
      $('save-active-text').textContent =
        '브라우저에 적용됨: ' +
        (baseSelect.value === 'all' ? '모든 기지' : preview.bases[Number(baseSelect.value)].name) +
        ' · 재고 ' + count(Object.keys(inventory).length) + '종 · discovered 연구 ' +
        count(preview.discovered.length) + '개. 이 데이터를 서버로 전송하지 않았습니다.';
      status.textContent = '선택한 세이브 재고로 현재 입력을 대체하고 연구 목록을 연결했습니다.';
    } catch (error) {
      status.textContent = '세이브 적용 중단: ' + error.message;
    }
  });
  $('save-disconnect').addEventListener('click', () => {
    ++request;
    onDisconnect();
    resetPreview();
    active.hidden = true;
    fileName = '';
    status.textContent = '세이브 연구 연결을 해제했습니다. 가져온 뒤 직접 수정한 재고는 유지했습니다.';
  });
}
