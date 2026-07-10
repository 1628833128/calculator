let currentExpr = '';
let currentResult = '0';
let isRadians = true;
let calcHistory = JSON.parse(localStorage.getItem('calcHistory') || '[]');
let savedFormulas = JSON.parse(localStorage.getItem('savedFormulas') || '[]');
let plotFunctions = [];
const COLORS = ['#f59e0b','#06b6d4','#22c55e','#ef4444','#a855f7','#ec4899','#14b8a6','#f97316'];

function switchTab(btn, tabName) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tabName).classList.add('active');
  if (tabName === 'history') renderHistory();
  if (tabName === 'formula') renderSavedFormulas();
  if (tabName === 'plot' && plotFunctions.length > 0) setTimeout(redrawPlot, 100);
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}

function insertNum(n) { currentExpr += n; updateDisplay(); previewCalc(); }
function insertOp(o) { currentExpr += o; updateDisplay(); }
function insertFunc(f) {
  if (f === 'pi') currentExpr += 'pi';
  else if (f === 'e') currentExpr += 'e';
  else currentExpr += f;
  updateDisplay();
}
function clearAll() { currentExpr = ''; currentResult = '0'; updateDisplay(); }
function deleteLast() { currentExpr = currentExpr.slice(0, -1); updateDisplay(); previewCalc(); }

function toggleAngle() {
  isRadians = !isRadians;
  document.getElementById('angleToggle').textContent = isRadians ? 'RAD' : 'DEG';
}

function updateDisplay() {
  document.getElementById('exprLine').textContent = currentExpr || '';
  document.getElementById('resultLine').textContent = currentResult;
}

function previewCalc() {
  try { const r = safeEval(currentExpr); currentResult = fmtNum(r); } catch(e) {}
  updateDisplay();
}

function calculate() {
  try {
    const r = safeEval(currentExpr);
    currentResult = fmtNum(r);
    addHistory('计算器', currentExpr, currentResult);
    updateDisplay();
  } catch(e) { currentResult = '错误'; updateDisplay(); }
}

function safeEval(expr) {
  if (!expr) return 0;
  let p = expr
    .replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/pi/g, String(Math.PI))
    .replace(/(?<![a-zA-Z])e(?![a-zA-Z])/g, String(Math.E));
  p = p.replace(/(\d+)%/g, '($1/100)').replace(/\^/g, '**')
    .replace(/fact\(([^)]+)\)/g, '_fact($1)');
  ['sin','cos','tan','asin','acos','atan'].forEach(fn => {
    const re = new RegExp(fn + '\\(([^)]+)\\)', 'g');
    if (isRadians) p = p.replace(re, 'Math.' + fn + '($1)');
    else p = p.replace(re, 'Math.' + fn + '($1 * Math.PI / 180)');
  });
  p = p.replace(/ln\(([^)]+)\)/g, 'Math.log($1)')
    .replace(/log\(([^)]+)\)/g, 'Math.log10($1)')
    .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
    .replace(/abs\(([^)]+)\)/g, 'Math.abs($1)');
  const fn = new Function('_fact', 'return (' + p + ');');
  return fn(_fact);
}

function _fact(n) {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  if (n <= 1) return 1;
  let r = 1; for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function fmtNum(n) {
  if (isNaN(n) || !isFinite(n)) return '错误';
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  return parseFloat(n.toPrecision(12)).toString();
}

document.addEventListener('keydown', e => {
  if (!document.getElementById('tab-calculator').classList.contains('active')) return;
  if (e.key >= '0' && e.key <= '9') insertNum(e.key);
  else if (['+','-','*','/','(',')','.','%'].includes(e.key)) insertOp(e.key);
  else if (e.key === 'Enter') calculate();
  else if (e.key === 'Escape') clearAll();
  else if (e.key === 'Backspace') deleteLast();
});

let parsedVars = [];

function parseFormula() {
  const expr = document.getElementById('formulaInput').value.trim();
  if (!expr) { document.getElementById('variablesPanel').style.display = 'none'; parsedVars = []; return; }
  const reserved = ['sin','cos','tan','ln','log','sqrt','abs','fact','pi','e'];
  const matches = expr.match(/[a-zA-Z]+/g) || [];
  parsedVars = [...new Set(matches.filter(v => !reserved.includes(v.toLowerCase())))];
  if (parsedVars.length === 0) { document.getElementById('variablesPanel').style.display = 'none'; return; }
  document.getElementById('variablesPanel').style.display = 'block';
  renderVarTags();
  renderVarInputs();
}

function renderVarTags() {
  document.getElementById('variableTags').innerHTML = parsedVars.map(v =>
    '<span class="variable-tag" onclick="fillVar(\'' + v + '\')">' + v + '</span>'
  ).join('');
}

function renderVarInputs() {
  document.getElementById('variableInputs').innerHTML = parsedVars.map(v =>
    '<div class="var-input-group"><label>' + v + '</label><input type="number" id="var_' + v + '" placeholder="输入 ' + v + ' 的值" step="any"></div>'
  ).join('');
}

function fillVar(name) { document.getElementById('var_' + name).focus(); }

function calculateFormula() {
  const expr = document.getElementById('formulaInput').value.trim();
  if (!expr || parsedVars.length === 0) { showToast('请先输入有效的公式'); return; }
  const vals = {};
  for (const v of parsedVars) {
    const inp = document.getElementById('var_' + v);
    if (!inp || inp.value === '') { showToast('请输入变量 ' + v + ' 的值'); inp.focus(); return; }
    vals[v] = parseFloat(inp.value);
  }
  let p = expr;
  for (const [v, val] of Object.entries(vals)) {
    p = p.replace(new RegExp('\\\\b' + v + '\\\\b', 'g'), '(' + val + ')');
  }
  try {
    const r = safeEval(p);
    const resultStr = fmtNum(r);
    document.getElementById('formulaResult').style.display = 'block';
    document.getElementById('resultValue').textContent = resultStr;
    let proc = '公式: ' + expr + '\n';
    for (const [v, val] of Object.entries(vals)) proc += v + ' = ' + val + '\n';
    proc += '\n结果: ' + resultStr;
    document.getElementById('resultProcess').textContent = proc;
    addHistory('公式', expr, resultStr);
  } catch(e) { showToast('计算出错，请检查公式'); }
}

function resetFormula() {
  document.getElementById('formulaInput').value = '';
  document.getElementById('variablesPanel').style.display = 'none';
  document.getElementById('formulaResult').style.display = 'none';
  parsedVars = [];
}

function saveFormula() {
  const expr = document.getElementById('formulaInput').value.trim();
  if (!expr) { showToast('没有可保存的公式'); return; }
  showPrompt('保存公式', '请输入公式名称:', '', name => {
    if (!name) { showToast('请输入公式名称'); return; }
    savedFormulas.unshift({ id: Date.now(), name, expression: expr, variables: [...parsedVars], time: new Date().toLocaleString('zh-CN') });
    localStorage.setItem('savedFormulas', JSON.stringify(savedFormulas));
    renderSavedFormulas();
    showToast('公式保存成功');
  });
}

function renderSavedFormulas() {
  const el = document.getElementById('savedFormulasList');
  if (savedFormulas.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">暂无保存的公式</div></div>';
    return;
  }
  el.innerHTML = savedFormulas.map(f =>
    '<div class="formula-item"><div class="formula-info"><div class="formula-name">' + f.name + '</div><div class="formula-expr">' + f.expression + ' <span style="color:var(--text-dim);font-size:0.75rem">' + f.time + '</span></div></div><div class="formula-actions"><button class="btn btn-primary" onclick="loadFormula(' + f.id + ')">加载</button><button class="btn btn-danger" onclick="delFormula(' + f.id + ')">删除</button></div></div>'
  ).join('');
}

function loadFormula(id) {
  const f = savedFormulas.find(x => x.id === id);
  if (!f) return;
  document.getElementById('formulaInput').value = f.expression;
  parseFormula();
  f.variables.forEach(v => { const inp = document.getElementById('var_' + v); if (inp) inp.focus(); });
  showToast('已加载: ' + f.name);
}

function delFormula(id) {
  savedFormulas = savedFormulas.filter(x => x.id !== id);
  localStorage.setItem('savedFormulas', JSON.stringify(savedFormulas));
  renderSavedFormulas();
  showToast('公式已删除');
}

function showPrompt(title, label, defaultVal, cb) {
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.innerHTML = '<div class="modal"><h3>' + title + '</h3><label style="font-size:0.9rem;color:var(--text-dim);display:block;margin-bottom:8px">' + label + '</label><input type="text" class="modal-input" id="mpInput" value="' + (defaultVal || '') + '"><div class="modal-buttons"><button class="btn" id="mpCancel">取消</button><button class="btn btn-primary" id="mpOk">确定</button></div></div>';
  document.body.appendChild(ov);
  const inp = ov.querySelector('#mpInput');
  inp.focus(); inp.select();
  ov.querySelector('#mpOk').onclick = () => { cb(inp.value); ov.remove(); };
  ov.querySelector('#mpCancel').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { cb(inp.value); ov.remove(); } });
}

function addFunction() {
  const inp = document.getElementById('plotFunctionInput');
  const expr = inp.value.trim();
  if (!expr) { showToast('请输入函数表达式'); return; }
  plotFunctions.push({ id: Date.now(), expression: expr, color: COLORS[plotFunctions.length % COLORS.length], visible: true });
  inp.value = '';
  renderPlotList();
  redrawPlot();
  showToast('函数已添加');
}

function removeFunc(id) {
  plotFunctions = plotFunctions.filter(f => f.id !== id);
  renderPlotList();
  redrawPlot();
}

function toggleVis(id) {
  const f = plotFunctions.find(x => x.id === id);
  if (f) { f.visible = !f.visible; redrawPlot(); }
}

function renderPlotList() {
  const el = document.getElementById('functionsList');
  el.innerHTML = plotFunctions.map(f =>
    '<div class="function-entry"><div class="function-color" style="background:' + f.color + ';opacity:' + (f.visible ? 1 : 0.3) + '"></div><div class="function-text" style="opacity:' + (f.visible ? 1 : 0.4) + '">' + f.expression + '</div><button class="btn" style="padding:4px 10px;font-size:0.8rem" onclick="toggleVis(' + f.id + ')">' + (f.visible ? '隐藏' : '显示') + '</button><button class="function-delete" onclick="removeFunc(' + f.id + ')">✕</button></div>'
  ).join('');
}

function redrawPlot() {
  const canvas = document.getElementById('plotCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  ctx.clearRect(0, 0, W, H);

  const xMin = parseFloat(document.getElementById('xMin').value) || -10;
  const xMax = parseFloat(document.getElementById('xMax').value) || 10;
  const N = parseInt(document.getElementById('samplePoints').value) || 500;
  const pad = 50;
  const pw = W - 2 * pad, ph = H - 2 * pad;

  let allData = [];
  plotFunctions.forEach(func => {
    if (!func.visible) return;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const x = xMin + (xMax - xMin) * i / N;
      try {
        let e = func.expression
          .replace(/\^/g, '**')
          .replace(/pi/g, String(Math.PI))
          .replace(/e(?![a-zA-Z])/g, String(Math.E))
          .replace(/x/g, '(' + x + ')')
          .replace(/sin\(/g, 'Math.sin(')
          .replace(/cos\(/g, 'Math.cos(')
          .replace(/tan\(/g, 'Math.tan(')
          .replace(/ln\(/g, 'Math.log(')
          .replace(/log\(/g, 'Math.log10(')
          .replace(/sqrt\(/g, 'Math.sqrt(')
          .replace(/abs\(/g, 'Math.abs(');
        const y = eval(e);
        if (isFinite(y)) pts.push({x, y});
      } catch(err) {}
    }
    allData.push({ data: pts, color: func.color });
  });

  if (allData.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('添加函数开始绘制图像', W / 2, H / 2);
    return;
  }

  let yMin = Infinity, yMax = -Infinity;
  allData.forEach(d => d.data.forEach(p => { if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y; }));
  if (!isFinite(yMin)) { yMin = -10; yMax = 10; }
  const yr = yMax - yMin || 20;
  yMin -= yr * 0.1; yMax += yr * 0.1;

  const toPx = (x, y) => [pad + pw * (x - xMin) / (xMax - xMin), H - pad - ph * (y - yMin) / (yMax - yMin)];

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const gx = pad + pw * i / 10, gy = pad + ph * i / 10;
    ctx.beginPath(); ctx.moveTo(gx, pad); ctx.lineTo(gx, H - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1.5;
  const [axX] = toPx(0, 0);
  const [, ayY] = toPx(0, 0);
  if (axX >= pad && axX <= W - pad) { ctx.beginPath(); ctx.moveTo(axX, pad); ctx.lineTo(axX, H - pad); ctx.stroke(); }
  if (ayY >= pad && ayY <= H - pad) { ctx.beginPath(); ctx.moveTo(pad, ayY); ctx.lineTo(W - pad, ayY); ctx.stroke(); }

  allData.forEach(d => {
    if (d.data.length < 2) return;
    ctx.strokeStyle = d.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let started = false;
    d.data.forEach(p => {
      const [px, py] = toPx(p.x, p.y);
      if (!started) { ctx.moveTo(px, py); started = true; }
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 10; i++) {
    const x = xMin + (xMax - xMin) * i / 10;
    const [px] = toPx(x, 0);
    ctx.fillText(fmtLbl(x), px, H - pad + 18);
  }
  ctx.textAlign = 'right';
  for (let i = 0; i <= 10; i++) {
    const y = yMin + (yMax - yMin) * i / 10;
    const [, py] = toPx(0, y);
    ctx.fillText(fmtLbl(y), pad - 8, py + 4);
  }
}

function fmtLbl(n) {
  if (Math.abs(n) >= 1000 || (Math.abs(n) < 0.01 && n !== 0)) return n.toExponential(1);
  return n.toFixed(1);
}

function addHistory(type, expr, result) {
  calcHistory.unshift({ id: Date.now(), type, expression: expr, result, time: new Date().toLocaleString('zh-CN') });
  if (calcHistory.length > 100) calcHistory.pop();
  localStorage.setItem('calcHistory', JSON.stringify(calcHistory));
}

function renderHistory() {
  const el = document.getElementById('historyList');
  if (calcHistory.length === 0) {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📜</div><div class="empty-state-text">暂无历史记录</div></div>';
    return;
  }
  el.innerHTML = calcHistory.map(h =>
    '<div class="history-item"><div class="history-info"><div class="history-type">' + h.type + '</div><div class="history-expr">' + h.expression + '</div><div class="history-result">= ' + h.result + '</div><div class="history-time">' + h.time + '</div></div><div class="history-actions"><button class="btn btn-primary" onclick="copyText(\'' + escHtml(h.expression) + ' = ' + escHtml(h.result) + '\')">复制</button></div></div>'
  ).join('');
}

function escHtml(s) { return s.replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

function clearHistory() {
  if (confirm('确定要清空所有历史记录吗？')) {
    calcHistory = [];
    localStorage.setItem('calcHistory', '[]');
    renderHistory();
    showToast('历史记录已清空');
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => showToast('已复制到剪贴板')).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta); showToast('已复制到剪贴板');
  });
}

window.addEventListener('load', () => {
  renderSavedFormulas();
  renderHistory();
  setTimeout(() => {
    const canvas = document.getElementById('plotCanvas');
    if (canvas) {
      const rect = canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('添加函数开始绘制图像', rect.width / 2, rect.height / 2);
    }
  }, 200);
});

window.addEventListener('resize', () => { if (plotFunctions.some(f => f.visible)) redrawPlot(); });
