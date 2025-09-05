const posInfoEl = document.getElementById('field-pos-info');

function updateFieldPosInfo(id) {
  const field = getField(id);
  if (!field) { posInfoEl.textContent = ''; return; }
  posInfoEl.textContent = `X: ${field.x} mm　Y: ${field.y} mm`;
}
const state = {
  fields: [],
  page: { widthMm: 148, heightMm: 210, dpi: 300 },
  selectedId: null,
  background: { dataUrl: null, opacity: 0.35, scalePercent: 100, x:0, y:0, widthMm:148, heightMm:210 },
  ui: { zoom: 1 },
  batchAddingFields: false
};

let idSeq = 1;


const el = sel => document.querySelector(sel);
const listEl = el('#field-list');
const canvas = el('#bag-canvas');
const bgLayer = document.getElementById('bg-layer');

// -------- 左側面板拖曳寬度 --------
window.addEventListener('DOMContentLoaded', () => {
  const wrap = document.querySelector('.left-panel-resize-wrap');
  const panel = document.querySelector('.left-panel');
  const resizer = document.querySelector('.left-panel-resizer');
  if (!wrap || !panel || !resizer) return;
  // 載入寬度
  const saved = localStorage.getItem('leftPanelWidth');
  if (saved) panel.style.width = saved + 'px';
  let dragging = false;
  let startX = 0;
  let startW = 0;
  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = panel.offsetWidth;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (!dragging) return;
    let newW = Math.max(320, Math.min(900, startW + (e.clientX - startX)));
    panel.style.width = newW + 'px';
  });
  window.addEventListener('mouseup', e => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    let w = parseInt(panel.offsetWidth);
    localStorage.setItem('leftPanelWidth', w);
  });
});

const mmToPx = (mm) => {
  // Assume 1 inch = 25.4 mm, DPI setting
  const { dpi } = state.page;
  return (mm / 25.4) * dpi * canvasScale();
};

const canvasScale = () => {
  // canvas (px) currently displayed vs real mm size -> we keep width in mm -> convert to px for display using base 300dpi then scaled
  // Actually easier: derive scale so that canvas width in px equals current CSS width.
  // Real width px @ dpi = widthMm/25.4*dpi. Display width (clientWidth) -> scale.
  const realPx = (state.page.widthMm / 25.4) * state.page.dpi;
  return canvas.clientWidth / realPx;
};

function getPxPerMm(){
  const scale = canvasScale();
  return (state.page.dpi / 25.4) * scale;
}

function addField(data = {}) {
  let value = data.value || '';
  if (data.type === 'table') {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch(e) { value = [[""]]; }
    }
    if (!Array.isArray(value)) value = [[""]];
  }
  let colWidths;
  if (data.type === 'table') {
    const cols = value[0]?.length || 2;
    if (Array.isArray(data.colWidths) && data.colWidths.length === cols) {
      colWidths = [...data.colWidths];
    } else {
      colWidths = Array(cols).fill(Math.round(100/cols));
    }
  }
  // 將所有屬性展開，保留所有自訂欄位資訊
  const field = Object.assign({}, data, {
    id: data.id || ('F' + (idSeq++)),
    value: data.type === 'table' ? value : value,
    colWidths: data.type === 'table' ? colWidths : data.colWidths,
    colLocked: data.type === 'table' ? (data.colLocked || (Array.isArray(colWidths) ? colWidths.map(()=>false) : undefined)) : data.colLocked,
    showBorder: data.type === 'table' ? (data.showBorder !== undefined ? data.showBorder : true) : data.showBorder,
    label: data.label || '新欄位',
    key: data.key || '',
    type: data.type || 'text',
    x: data.x ?? 10,
    y: data.y ?? 10,
    w: data.w ?? 40,
    h: data.h ?? 10,
    font: data.font ?? 14,
    bold: data.bold ?? false,
    align: data.align || 'left',
  });
  state.fields.push(field);
  renderFieldItem(field);
  renderCanvasField(field);
  // 新增後自動選取高亮
  if (!state.batchAddingFields) {
    setTimeout(()=>{
      state.selectedId = field.id;
      canvas.querySelectorAll('.canvas-field').forEach(el => el.classList.toggle('selected', el.dataset.id === field.id));
      const item = listEl.querySelector(`.field-item[data-id="${field.id}"]`);
      item?.scrollIntoView({behavior:'smooth', block:'center'});
      item?.classList.add('highlight');
      setTimeout(()=> item?.classList.remove('highlight'), 1200);
    }, 10);
  }
}

function renderFieldItem(field) {
  const tpl = document.getElementById('tpl-field-item');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = field.id;
  node.querySelector('.fi-label').value = field.label;
  node.querySelector('.fi-key').value = field.key || '';
  node.querySelector('.fi-type').value = field.type;
  // 根據 type 顯示 textarea、table 編輯器或直線屬性
  const textarea = node.querySelector('.fi-value');
  const tableEditor = node.querySelector('.fi-table-editor');
  // 動態插入直線屬性編輯
  let lineEditor = node.querySelector('.fi-line-editor');
  if (!lineEditor) {
    lineEditor = document.createElement('div');
    lineEditor.className = 'fi-line-editor';
    lineEditor.style.display = 'none';
    lineEditor.innerHTML = `
      <label>方向
        <select class="fi-line-direction">
          <option value="horizontal">水平</option>
          <option value="vertical">垂直</option>
        </select>
      </label>
    `;
    textarea.parentNode.insertBefore(lineEditor, textarea);
  }
  function showEditor() {
    if (field.type === 'table') {
      textarea.style.display = 'none';
      tableEditor.style.display = '';
      lineEditor.style.display = 'none';
      renderTableEditor(tableEditor, field);
    } else if (field.type === 'line') {
      textarea.style.display = 'none';
      tableEditor.style.display = 'none';
      lineEditor.style.display = '';
      lineEditor.querySelector('.fi-line-direction').value = field.direction || 'horizontal';
    } else {
      textarea.style.display = '';
      tableEditor.style.display = 'none';
      lineEditor.style.display = 'none';
      textarea.value = field.value;
    }
  }
  showEditor();
  node.querySelector('.fi-type').addEventListener('change', (e) => {
    field.type = e.target.value;
    if (field.type === 'table' && !Array.isArray(field.value)) field.value = [["",""]];
    showEditor();
    updateCanvasField(field.id);
  });
  // 直線方向事件
  if (lineEditor) {
    lineEditor.querySelector('.fi-line-direction').addEventListener('change', (e) => {
      field.direction = e.target.value;
      // 自動調整 w/h
      if (field.direction === 'vertical') {
        if (field.w < 2) field.w = 2;
        if (field.h < 20) field.h = 40;
      } else {
        if (field.h < 2) field.h = 2;
        if (field.w < 20) field.w = 60;
      }
      // 同步右側 input
      const wInput = node.querySelector('.fi-w');
      const hInput = node.querySelector('.fi-h');
      if (wInput) wInput.value = field.w;
      if (hInput) hInput.value = field.h;
      updateCanvasField(field.id);
    });
  }
  textarea.addEventListener('input', () => {
    field.value = textarea.value;
    updateCanvasField(field.id);
  });
  // 表格編輯器渲染
  function renderTableEditor(editor, field) {
    const grid = editor.querySelector('.table-edit-grid');
    grid.innerHTML = '';
    const rows = field.value;
    // 框線控制
    const borderCheckbox = editor.querySelector('.fi-table-border');
    if (borderCheckbox) {
      borderCheckbox.checked = field.showBorder !== false;
      borderCheckbox.onchange = () => {
        field.showBorder = borderCheckbox.checked;
        renderTableEditor(editor, field);
        updateCanvasField(field.id);
      };
    }
    // 欄寬控制
    const colWidthsDiv = editor.querySelector('.table-colwidths');
    if (colWidthsDiv && Array.isArray(field.colWidths)) {
  colWidthsDiv.innerHTML = field.colWidths.map((w, idx) => `<label>欄${idx+1}寬度(%) <input type="number" class="fi-colwidth" data-idx="${idx}" value="${w}" min="1" max="100" style="width:70px;" /></label>`).join(' ');
      colWidthsDiv.querySelectorAll('.fi-colwidth').forEach(input => {
        input.oninput = (e) => {
          const i = parseInt(e.target.dataset.idx);
          let v = parseInt(e.target.value);
          if (isNaN(v) || v < 1) v = 1;
          if (v > 100) v = 100;
          // 標記此欄已手動設定
          if (!field.colLocked) field.colLocked = field.colWidths.map(()=>false);
          field.colLocked[i] = true;
          // 計算剩餘百分比
          const totalCols = field.colWidths.length;
          field.colWidths[i] = v;
          // 計算剩餘百分比
          const lockedTotal = field.colWidths.reduce((sum, w, idx) => field.colLocked[idx] ? sum + w : sum, 0);
          const unlockedIdx = [];
          for (let j = 0; j < totalCols; j++) if (!field.colLocked[j]) unlockedIdx.push(j);
          const unlockedCount = unlockedIdx.length;
          const remain = 100 - lockedTotal;
          if (unlockedCount > 0) {
            // 其餘未鎖定欄位等分剩餘
            unlockedIdx.forEach((j, idx) => {
              field.colWidths[j] = Math.floor(remain / unlockedCount) + (idx === unlockedCount-1 ? remain % unlockedCount : 0);
            });
          } else {
            // 全部鎖定，最後一欄修正誤差
            let sum = field.colWidths.reduce((a,b)=>a+b,0);
            if (sum !== 100) field.colWidths[totalCols-1] += 100-sum;
          }
          renderTableEditor(editor, field);
          updateCanvasField(field.id);
        };
      });
    }
    const borderStyle = field.showBorder === false ? 'none' : '1px solid #ccc';
    // 標題列
    if (rows.length) {
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      for (let c = 0; c < rows[0].length; c++) {
        const th = document.createElement('th');
        th.textContent = `欄${c+1}`;
        th.style.border = borderStyle;
        th.style.background = '#f3f4f6';
        th.style.width = field.colWidths ? field.colWidths[c] + '%' : '';
        tr.appendChild(th);
      }
      thead.appendChild(tr);
      grid.appendChild(thead);
    }
    // 資料列
    const tbody = document.createElement('tbody');
    rows.forEach((row, rIdx) => {
      const tr = document.createElement('tr');
      row.forEach((cell, cIdx) => {
        const td = document.createElement('td');
        td.style.border = borderStyle;
        td.style.padding = '2px';
        td.style.width = field.colWidths ? field.colWidths[cIdx] + '%' : '';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = cell;
        inp.style.width = '100%';
        inp.addEventListener('input', (e) => {
          field.value[rIdx][cIdx] = e.target.value;
          updateCanvasField(field.id);
        });
        td.appendChild(inp);
        tr.appendChild(td);
      });
      // 刪除列按鈕
      const tdDel = document.createElement('td');
      tdDel.style.border = 'none';
      tdDel.style.padding = '0 2px';
      const btnDelRow = document.createElement('button');
      btnDelRow.textContent = '✕';
      btnDelRow.type = 'button';
      btnDelRow.style.fontSize = '12px';
      btnDelRow.addEventListener('click', () => {
        field.value.splice(rIdx,1);
        renderTableEditor(editor, field);
        updateCanvasField(field.id);
      });
      tdDel.appendChild(btnDelRow);
      tr.appendChild(tdDel);
      tbody.appendChild(tr);
    });
    grid.appendChild(tbody);
    // 新增欄/列（每次渲染都重新綁定）
    const btnAddRow = editor.querySelector('.btn-add-row');
    const btnAddCol = editor.querySelector('.btn-add-col');
    if (btnAddRow) btnAddRow.onclick = () => {
      const cols = rows[0]?.length || 2;
      field.value.push(Array(cols).fill(''));
      // 新增列時自動補齊欄寬
      if (Array.isArray(field.colWidths) && field.colWidths.length < cols) {
        field.colWidths = Array(cols).fill(Math.round(100/cols));
      }
      renderTableEditor(editor, field);
      updateCanvasField(field.id);
    };
    if (btnAddCol) btnAddCol.onclick = () => {
      field.value.forEach(row => row.push(''));
      // 新增欄時自動補齊欄寬
      if (Array.isArray(field.colWidths)) {
        field.colWidths.push(Math.round(100/(field.colWidths.length+1)));
        // 重新均分
        const total = field.colWidths.length;
        field.colWidths = Array(total).fill(Math.round(100/total));
      }
      renderTableEditor(editor, field);
      updateCanvasField(field.id);
    };
  }
  node.querySelector('.fi-x').value = field.x;
  node.querySelector('.fi-y').value = field.y;
  node.querySelector('.fi-w').value = field.w;
  node.querySelector('.fi-h').value = field.h;
  node.querySelector('.fi-font').value = field.font;
  node.querySelector('.fi-bold').checked = field.bold;
  node.querySelector('.fi-align').value = field.align;

  node.addEventListener('input', (e) => {
    const f = getField(field.id);
    f.label = node.querySelector('.fi-label').value;
    f.key = node.querySelector('.fi-key').value;
    f.type = node.querySelector('.fi-type').value;
    // 判斷是否為 table 欄位
    if (f.type === 'table') {
      // table value 已由 table 編輯器即時同步
    } else {
      f.value = node.querySelector('.fi-value').value;
    }
    f.x = parseFloat(node.querySelector('.fi-x').value) || 0;
    f.y = parseFloat(node.querySelector('.fi-y').value) || 0;
    f.w = parseFloat(node.querySelector('.fi-w').value) || 10;
    f.h = parseFloat(node.querySelector('.fi-h').value) || 10;
    f.font = parseInt(node.querySelector('.fi-font').value) || 14;
    f.bold = node.querySelector('.fi-bold').checked;
    f.align = node.querySelector('.fi-align').value;
    updateCanvasField(f.id);
    updateFieldPosInfo(f.id);
    // 若是 x, y 輸入則高亮右側欄位
    if (e.target.classList.contains('fi-x') || e.target.classList.contains('fi-y')) {
      state.selectedId = field.id;
      canvas.querySelectorAll('.canvas-field').forEach(el => el.classList.toggle('selected', el.dataset.id === field.id));
    }
  });

  node.querySelector('.btn-del').addEventListener('click', () => {
    deleteField(field.id);
  });

  // 點選左側欄位時，右側畫布同步高亮
  node.addEventListener('click', () => {
          state.selectedId = field.id;
          // 左側高亮
          listEl.querySelectorAll('.field-item').forEach(el => el.classList.toggle('selected', el.dataset.id === field.id));
          // 右側高亮
          canvas.querySelectorAll('.canvas-field').forEach(el => el.classList.toggle('selected', el.dataset.id === field.id));
          updateFieldPosInfo(field.id);
  });

  listEl.appendChild(node);
  // 批次新增時，將所有 input/textarea/select 取消 focus
  if (state.batchAddingFields) {
    node.querySelectorAll('input,textarea,select').forEach(el => el.blur && el.blur());
  }
}

function renderCanvasField(field) {
  const div = document.createElement('div');
  div.className = 'canvas-field';
  div.dataset.id = field.id;
  if (field.type === 'line') {
    // 用 SVG 畫直線，支援水平/垂直
    const realPxPerMm = getPxPerMm();
    const x = field.x * realPxPerMm;
    const y = field.y * realPxPerMm;
    let w = field.w * realPxPerMm;
    let h = field.h * realPxPerMm;
    const direction = field.direction || 'horizontal';
    let svg, width, height;
    if (direction === 'vertical') {
      width = Math.abs(w)||2;
      height = Math.abs(h)||40;
      svg = `<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0;overflow:visible;">
        <line x1="${width/2}" y1="0" x2="${width/2}" y2="${height}"
          stroke="#222" stroke-width="2" />
      </svg>`;
    } else {
      width = Math.abs(w)||40;
      height = Math.abs(h)||2;
      svg = `<svg width="${width}" height="${height}" style="position:absolute;left:0;top:0;overflow:visible;">
        <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}"
          stroke="#222" stroke-width="2" />
      </svg>`;
    }
    div.innerHTML = svg + '<div class="resize-handle" title="拖曳調整大小"></div>';
    div.style.left = x + 'px';
    div.style.top = y + 'px';
    div.style.width = width + 'px';
    div.style.height = height + 'px';
  } else {
    // 只加入一個 resize-handle，確保每個元件都能拖曳調整長寬
    div.innerHTML = `<span class="cf-label"></span><div class="resize-handle" title="拖曳調整大小"></div>`;
  }
  canvas.appendChild(div);
  div.addEventListener('mousedown', selectFieldFromCanvas);
  div.addEventListener('dblclick', () => scrollToFieldItem(field.id));
  makeDraggable(div);
  makeResizable(div);
  // line 初次渲染已就緒，避免遞迴重建
  if (field.type !== 'line') updateCanvasField(field.id);
}

function getField(id) { return state.fields.find(f => f.id === id); }

function deleteField(id) {
  state.fields = state.fields.filter(f => f.id !== id);
  const item = listEl.querySelector(`.field-item[data-id="${id}"]`);
  item?.remove();
  const cf = canvas.querySelector(`.canvas-field[data-id="${id}"]`);
  cf?.remove();
  if (state.selectedId === id) state.selectedId = null;
}

function updateCanvasField(id) {
  const field = getField(id);
  if (!field) return;
  const elem = canvas.querySelector(`.canvas-field[data-id="${id}"]`);
  const realPxPerMm = getPxPerMm();
  if (field.type === 'line') {
    // 直線：直接更新/重建其內部 SVG 避免呼叫 renderCanvasField 造成遞迴
    if (!elem) return;
    // 清空後重建 SVG
    const direction = field.direction || 'horizontal';
    let wPx = Math.abs(field.w * realPxPerMm) || (direction==='vertical'?2:40);
    let hPx = Math.abs(field.h * realPxPerMm) || (direction==='vertical'?40:2);
    const svg = direction === 'vertical'
      ? `<svg width="${wPx}" height="${hPx}" style="position:absolute;left:0;top:0;overflow:visible;">
          <line x1="${wPx/2}" y1="0" x2="${wPx/2}" y2="${hPx}" stroke="#222" stroke-width="2" />
        </svg>`
      : `<svg width="${wPx}" height="${hPx}" style="position:absolute;left:0;top:0;overflow:visible;">
          <line x1="0" y1="${hPx/2}" x2="${wPx}" y2="${hPx/2}" stroke="#222" stroke-width="2" />
        </svg>`;
    elem.innerHTML = svg + '<div class="resize-handle" title="拖曳調整大小"></div>';
    elem.style.left = (field.x * realPxPerMm) + 'px';
    elem.style.top = (field.y * realPxPerMm) + 'px';
    elem.style.width = wPx + 'px';
    elem.style.height = hPx + 'px';
    // 重新綁定拖曳與縮放
    makeDraggable(elem);
    makeResizable(elem);
    return;
  }
  elem.style.left = (field.x * realPxPerMm) + 'px';
  elem.style.top = (field.y * realPxPerMm) + 'px';
  elem.style.width = (field.w * realPxPerMm) + 'px';
  elem.style.height = (field.h * realPxPerMm) + 'px';
  elem.style.fontSize = field.font + 'px';
  elem.style.fontWeight = field.bold ? '700' : '400';
  elem.style.textAlign = field.align;
  if (field.type === 'table') {
    // 表格渲染
    const borderStyle = field.showBorder === false ? 'none' : '1px solid #888';
    let html = '<table style="width:100%;border-collapse:collapse;font-size:'+field.font+'px;text-align:'+field.align+'">';
    field.value.forEach((row, rIdx) => {
      html += '<tr>' + row.map((cell, cIdx) => `<td style="border:${borderStyle};padding:2px;width:${field.colWidths ? field.colWidths[cIdx] + '%' : ''}">${cell}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    elem.querySelector('.cf-label').innerHTML = html;
    elem.querySelector('.cf-label').classList.remove('is-label');
  } else {
    const cfLabel = elem.querySelector('.cf-label');
    let showLabel = false;
    if (field.type === 'multiline') {
      if (field.value) {
        cfLabel.innerHTML = field.value.replace(/\n/g,'<br>');
        cfLabel.classList.remove('is-label');
      } else {
        cfLabel.textContent = field.label;
        showLabel = true;
      }
    } else {
      if (field.value) {
        cfLabel.textContent = field.value;
        cfLabel.classList.remove('is-label');
      } else {
        cfLabel.textContent = field.label;
        showLabel = true;
      }
    }
    if (showLabel) cfLabel.classList.add('is-label');
    else cfLabel.classList.remove('is-label');
  }
}

function selectFieldFromCanvas(e) {
  if (state.isResizing) return; // 拖曳縮放時不觸發選取
  const id = e.currentTarget.dataset.id;
  state.selectedId = id;
  // 畫布高亮
  canvas.querySelectorAll('.canvas-field').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  listEl.querySelectorAll('.field-item').forEach(el => el.classList.toggle('selected', el.dataset.id === id));
  scrollToFieldItem(id);
  updateFieldPosInfo(id);
}

function scrollToFieldItem(id) {
  const item = listEl.querySelector(`.field-item[data-id="${id}"]`);
  item?.scrollIntoView({behavior:'smooth', block:'center'});
  item?.classList.add('highlight');
  setTimeout(()=> item?.classList.remove('highlight'), 1200);
}

function makeDraggable(elem) {
  let startX, startY, origX, origY;
  function onMouseDown(e) {
    if (e.target.classList.contains('resize-handle')) return;
    if (state.isResizing) return; // 拖曳縮放時不觸發拖曳
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    const id = elem.dataset.id;
    const f = getField(id);
    const unit = getPxPerMm(); // px per mm on screen
    origX = f.x; origY = f.y;
    function onMove(ev) {
      const dx = (ev.clientX - startX) / unit;
      const dy = (ev.clientY - startY) / unit;
      f.x = parseFloat((origX + dx).toFixed(2));
      f.y = parseFloat((origY + dy).toFixed(2));
      syncFieldInputs(f);
      updateCanvasField(f.id);
      updateFieldPosInfo(f.id);
    }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  elem.addEventListener('mousedown', onMouseDown);
}

function makeResizable(elem) {
  const handle = elem.querySelector('.resize-handle');
  let startX, startY, origW, origH, field;
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    document.body.style.userSelect = 'none';
    state.isResizing = true;
    startX = e.clientX; startY = e.clientY;
    field = getField(elem.dataset.id);
    const unit = getPxPerMm();
    origW = field.w; origH = field.h;
    function onMove(ev) {
      const dx = (ev.clientX - startX) / unit;
      const dy = (ev.clientY - startY) / unit;
      field.w = Math.max(5, parseFloat((origW + dx).toFixed(2)));
      field.h = Math.max(5, parseFloat((origH + dy).toFixed(2)));
      syncFieldInputs(field);
      updateCanvasField(field.id);
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      state.isResizing = false;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function syncFieldInputs(field) {
  const item = listEl.querySelector(`.field-item[data-id="${field.id}"]`);
  if (!item) return;
  item.querySelector('.fi-x').value = field.x;
  item.querySelector('.fi-y').value = field.y;
  item.querySelector('.fi-w').value = field.w;
  item.querySelector('.fi-h').value = field.h;
}

function exportJSON() {
  // 深拷貝 table 欄位 value
  const fields = state.fields.map(f => {
    if (f.type === 'table' && Array.isArray(f.value)) {
      return { ...f, value: JSON.parse(JSON.stringify(f.value)) };
    }
    return { ...f };
  });
  // 取得樣板名稱
  const nameInput = document.getElementById('template-name');
  const templateName = nameInput ? nameInput.value.trim() : '';
  const data = {
    name: templateName,
    page: state.page,
    fields,
    background: state.background,
    generatedAt: new Date().toISOString(),
    version:1
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = templateName + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadJSONFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      if (!json.fields) throw new Error('格式不正確');
      loadDataObject(json);
    } catch(err) { alert('讀取失敗: '+ err.message); }
  };
  reader.readAsText(file,'utf-8');
}

function resizeCanvas() {
  // set canvas pixel size proportional to page mm using fixed 4px per mm baseline so feel reasonable
  const scale = 4; // px per mm (arbitrary for design view)
  canvas.style.width = (state.page.widthMm * scale) + 'px';
  canvas.style.height = (state.page.heightMm * scale) + 'px';
  // 設計區放大縮小
  canvas.style.transform = `scale(${state.ui.zoom})`;
  canvas.style.transformOrigin = 'top left';
  state.fields.forEach(f=> updateCanvasField(f.id));
}

function initPageControls() {
  el('#page-width').addEventListener('input', () => { state.page.widthMm = parseFloat(el('#page-width').value)||148; resizeCanvas(); });
  el('#page-height').addEventListener('input', () => { state.page.heightMm = parseFloat(el('#page-height').value)||210; resizeCanvas(); });
  el('#dpi').addEventListener('input', () => { state.page.dpi = parseInt(el('#dpi').value)||300; state.fields.forEach(f=> updateCanvasField(f.id)); });

  // 範本選單：選擇時自動帶入寬高
  const templateMap = {
    bag: { width: 148, height: 210, dpi: 300 },
    receipt: { width: 216, height: 94, dpi: 300 },
    receipt2: { width: 216, height: 188, dpi: 300 }
  };
  const pageTemplate = el('#page-template');
  if (pageTemplate) {
    pageTemplate.addEventListener('change', (e) => {
      const val = e.target.value;
      const tpl = templateMap[val];
      if (tpl) {
        el('#page-width').value = tpl.width;
        el('#page-height').value = tpl.height;
        el('#dpi').value = tpl.dpi;
        state.page.widthMm = tpl.width;
        state.page.heightMm = tpl.height;
        state.page.dpi = tpl.dpi;
        resizeCanvas();
        state.fields.forEach(f=> updateCanvasField(f.id));
      }
    });
  }
}

function printPreview() { window.print(); }

function init() {
  initPageControls();
  el('#btn-add-field').addEventListener('click', () => addField());
  // 新增直線按鈕
  const btnAddLine = el('#btn-add-line');
  if (btnAddLine) {
    btnAddLine.addEventListener('click', () => addField({ type: 'line', direction: 'horizontal', w: 60, h: 0.5 }));
  }
  el('#btn-export-json').addEventListener('click', exportJSON);
  el('#btn-load-json').addEventListener('click', ()=> el('#file-json').click());
  el('#file-json').addEventListener('change', (e)=> { if (e.target.files[0]) loadJSONFile(e.target.files[0]); });
//   el('#btn-print-preview').addEventListener('click', printPreview);
  // background controls
  const bgFile = el('#file-bg');
  el('#btn-bg-upload').addEventListener('click', ()=> bgFile.click());
  bgFile.addEventListener('change', (e)=> { if(e.target.files[0]) loadBackgroundImage(e.target.files[0]); });
  el('#btn-bg-clear').addEventListener('click', ()=> { state.background.dataUrl=null; updateBackgroundRender(); });
  ['#bg-opacity','#bg-scale','#bg-x','#bg-y','#bg-width','#bg-height'].forEach(sel=> {
    const control = el(sel);
    control.addEventListener('input', ()=> {
      const bg = state.background;
      bg.opacity = parseFloat(el('#bg-opacity').value)||0.3;
      bg.scalePercent = parseFloat(el('#bg-scale').value)||100;
      bg.x = parseFloat(el('#bg-x').value)||0;
      bg.y = parseFloat(el('#bg-y').value)||0;
      bg.widthMm = parseFloat(el('#bg-width').value)||state.page.widthMm;
      bg.heightMm = parseFloat(el('#bg-height').value)||state.page.heightMm;
      updateBackgroundRender();
    });
  });
  // Zoom bar 控制
  const zoomBar = document.getElementById('zoom-bar');
  if (zoomBar) {
    zoomBar.value = state.ui.zoom;
    zoomBar.addEventListener('input', (e) => {
      state.ui.zoom = parseFloat(e.target.value);
      resizeCanvas();
      // 顯示目前倍率
      const zoomLabel = document.getElementById('zoom-label');
      if (zoomLabel) zoomLabel.textContent = `${Math.round(state.ui.zoom*100)}%`;
    });
    // 初始顯示倍率
    const zoomLabel = document.getElementById('zoom-label');
    if (zoomLabel) zoomLabel.textContent = `${Math.round(state.ui.zoom*100)}%`;
  }
  // 顯示/隱藏底圖設定
  let bgPanelVisible = true;
  const bgControls = document.getElementById('bg-controls');
  const bgGrid = document.getElementById('bg-grid');
  const btnBgToggle = document.getElementById('btn-bg-toggle');
  btnBgToggle.addEventListener('click', ()=> {
    bgPanelVisible = !bgPanelVisible;
    bgControls.classList.toggle('hide', !bgPanelVisible);
    btnBgToggle.textContent = bgPanelVisible ? '隱藏設定' : '顯示設定';
  });
    // 範例選單自動載入 samples 資料夾所有 json 檔案
    const sampleSelect = document.getElementById('sample-select');
    async function loadSampleList() {
      // 取得所有 json 檔名（需 server 端支援列目錄，這裡用硬編碼，實際可用 window.__SAMPLES__ 注入）
      const files = ["藥袋1.json", "收據1.json"];
      const options = [];
      for(const f of files){
        try {
          const res = await fetch(`samples/${f}`);
          const json = await res.json();
          options.push({name: json.name || f, file: f, data: json});
        } catch(e){}
      }
      sampleSelect.innerHTML = options.map(opt => `<option value="${opt.file}">${opt.name}</option>`).join("");
      sampleSelect.options.length && (sampleSelect.selectedIndex = 0);
      // 預設載入第一個
      if(options[0]) loadSampleFromData(options[0].data);
      sampleSelect.onchange = ()=> {
        const sel = options.find(opt=>opt.file===sampleSelect.value);
        if(sel) loadSampleFromData(sel.data);
      };
    }
    loadSampleList();
  resizeCanvas();
  window.addEventListener('resize', ()=> state.fields.forEach(f=> updateCanvasField(f.id)));
}

init();

// ------------------------- 範例資料配置 ---------------------------
// 暫存功能
document.getElementById('btn-save-temp')?.addEventListener('click', () => {
  try {
    localStorage.setItem('fields-temp', JSON.stringify(state.fields));
    alert('暫存成功！');
  } catch(e) {
    alert('暫存失敗：' + e.message);
  }
});

document.getElementById('btn-load-temp')?.addEventListener('click', () => {
  try {
    const temp = localStorage.getItem('fields-temp');
    if (!temp) return alert('尚未暫存任何內容');
    const fields = JSON.parse(temp);
    state.fields = [];
    listEl.innerHTML = '';
    canvas.innerHTML = '';
    state.batchAddingFields = true;
    fields.forEach(f => addField(f));
    state.batchAddingFields = false;
    resizeCanvas();
    setTimeout(() => {
      listEl.scrollTop = 0;
      listEl.scrollTo({top:0,behavior:'auto'});
      setTimeout(() => {
        listEl.scrollTop = 0;
        listEl.scrollTo({top:0,behavior:'auto'});
        if (document.activeElement) document.activeElement.blur();
      }, 200);
    }, 200);
    alert('已還原暫存內容！');
  } catch(e) {
    alert('還原失敗：' + e.message);
  }
});
// 一鍵清除內容功能
document.getElementById('btn-clear-all')?.addEventListener('click', () => {
  if (window.confirm('確定要清除所有內容嗎？此操作無法復原！')) {
    state.fields = [];
    listEl.innerHTML = '';
    canvas.innerHTML = '';
    // 可選：清空樣板名稱
    const nameInput = document.getElementById('template-name');
    if (nameInput) nameInput.value = '';
    // 可選：重設 page 設定
    // Object.assign(state.page, { widthMm: 148, heightMm: 210, dpi: 300 });
    resizeCanvas();
    updateBackgroundRender();
  }
});
function loadSampleFromData(data) {
  loadDataObject(data);
}

function loadDataObject(data) {
  // 清空現有欄位
  state.fields = [];
  listEl.innerHTML = '';
  canvas.innerHTML = '';
  Object.assign(state.page, data.page || {});
  if (data.background) Object.assign(state.background, data.background);
  el('#page-width').value = state.page.widthMm;
  el('#page-height').value = state.page.heightMm;
  el('#dpi').value = state.page.dpi;
  // 先依新尺寸調整畫布，避免後續 addField 時使用舊寬度換算 px
  resizeCanvas();
  // 樣板名稱顯示
  const nameInput = document.getElementById('template-name');
  if (nameInput && typeof data.name === 'string') nameInput.value = data.name;
  state.batchAddingFields = true;
  (data.fields||[]).forEach(f=> addField(f));
  state.batchAddingFields = false;
  // 尺寸變更後再次刷新所有已加載欄位（確保縮放/換算同步）
  state.fields.forEach(f=> updateCanvasField(f.id));
  // 只高亮最後一個欄位
  if (state.fields.length > 0) {
    const lastId = state.fields[state.fields.length-1].id;
    state.selectedId = lastId;
    canvas.querySelectorAll('.canvas-field').forEach(el => el.classList.toggle('selected', el.dataset.id === lastId));
    const item = listEl.querySelector(`.field-item[data-id=\"${lastId}\"]`);
    item?.scrollIntoView({behavior:'smooth', block:'center'});
    item?.classList.add('highlight');
    setTimeout(()=> item?.classList.remove('highlight'), 1200);
  }
  // 再次調整（若欄位加入造成高度捲動等視覺需求）
  resizeCanvas();
  updateBackgroundRender();
  setTimeout(() => {
    listEl.scrollTop = 0;
    listEl.scrollTo({top:0,behavior:'auto'});
    setTimeout(() => {
      listEl.scrollTop = 0;
      listEl.scrollTo({top:0,behavior:'auto'});
      if (document.activeElement) document.activeElement.blur();
    }, 200);
  }, 200);
}

function clearAllFields() { state.fields = []; listEl.innerHTML=''; canvas.innerHTML=''; }

// ------------------------- 背景處理 ---------------------------
function loadBackgroundImage(file){
  const reader = new FileReader();
  reader.onload = ()=> {
    state.background.dataUrl = reader.result;
    updateBackgroundRender();
  };
  reader.readAsDataURL(file);
}

function updateBackgroundRender(){
  if(!bgLayer) return;
  bgLayer.innerHTML='';
  const bg = state.background;
  if(!bg.dataUrl){ return; }
  const img = document.createElement('img');
  img.src = bg.dataUrl;
  const pxPerMm = getPxPerMm();
  const wPx = bg.widthMm * pxPerMm * (bg.scalePercent/100);
  const hPx = bg.heightMm * pxPerMm * (bg.scalePercent/100);
  img.style.width = wPx + 'px';
  img.style.height = hPx + 'px';
  img.style.opacity = bg.opacity;
  img.style.transform = `translate(${bg.x * pxPerMm}px, ${bg.y * pxPerMm}px)`;
  bgLayer.appendChild(img);
}

// When resizing canvas or DPI changes background must update
const originalResizeCanvas = resizeCanvas;
resizeCanvas = function(){
  originalResizeCanvas();
  updateBackgroundRender();
};
