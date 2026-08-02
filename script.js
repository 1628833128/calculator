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
  if (tabName === 'plot') setTimeout(redrawPlot, 100);
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

/* ---- 数学表达式解析器：支持隐式乘法(2x)、无括号函数(lnx)、常量(pi/e/tau) ---- */
const FN_SET = new Set(['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','abs','exp','floor','ceil','round','sign','cbrt','sec','csc','cot','fact']);
const CONST_MAP = { pi: Math.PI, tau: 2 * Math.PI, e: Math.E };

function tokenizeExpr(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  const isDigit = c => c >= '0' && c <= '9';
  const isLetter = c => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '×' || c === '·' || c === '⋅' || c === '*') { tokens.push({ t: 'op', v: '*' }); i++; continue; }
    if (c === '÷' || c === '/') { tokens.push({ t: 'op', v: '/' }); i++; continue; }
    if (c === '−' || c === '-') { tokens.push({ t: 'op', v: '-' }); i++; continue; }
    if (c === '√') { tokens.push({ t: 'id', v: 'sqrt' }); i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let j = i;
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      if (j < n && (src[j] === 'e' || src[j] === 'E')) {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (k < n && isDigit(src[k])) {
          while (k < n && isDigit(src[k])) k++;
          j = k;
        }
      }
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j; continue;
    }
    if (isLetter(c) || c === '_' || c === 'π' || c === 'τ') {
      let j = i;
      while (j < n && /[a-zA-Z0-9_]/.test(src[j])) j++;
      let word = src.slice(i, j);
      if (word === 'π') word = 'pi';
      if (word === 'τ') word = 'tau';
      const lower = word.toLowerCase();
      if (!FN_SET.has(lower) && !(lower in CONST_MAP) && word.length > 1) {
        let splitLen = 0;
        for (let k = Math.min(lower.length - 1, 5); k >= 1; k--) {
          const prefix = lower.slice(0, k);
          if (FN_SET.has(prefix) || prefix in CONST_MAP) { splitLen = k; break; }
        }
        if (splitLen > 0) {
          tokens.push({ t: 'id', v: lower.slice(0, splitLen) });
          i = i + splitLen;
          continue;
        }
      }
      tokens.push({ t: 'id', v: lower });
      i = j; continue;
    }
    if ('+-*/^(),%!'.includes(c)) { tokens.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('无法识别的字符: ' + c);
  }
  return tokens;
}

function parseExpr(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (t, v) => t && t.t === 'op' && t.v === v;
  const isImplicitStart = t => t && (t.t === 'num' || t.t === 'id' || (t.t === 'op' && t.v === '('));

  function parseExpression() {
    let node = parseTerm();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      node = { op, lhs: node, rhs: parseTerm() };
    }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    while (peek() && ((peek().t === 'op' && (peek().v === '*' || peek().v === '/')) || isImplicitStart(peek()))) {
      const op = (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) ? next().v : '*';
      node = { op, lhs: node, rhs: parseUnary() };
    }
    return node;
  }
  function parseUnary() {
    if (peek() && peek().t === 'op' && (peek().v === '-' || peek().v === '+')) {
      const op = next().v;
      return { op: op === '-' ? 'neg' : 'pos', arg: parseUnary() };
    }
    return parsePower();
  }
  function parsePower() {
    let base = parsePrimary();
    if (isOp(peek(), '^')) {
      next();
      base = { op: '^', lhs: base, rhs: parseUnary() };
    }
    while (isOp(peek(), '%') || isOp(peek(), '!')) {
      const op = next().v;
      base = { op: op === '%' ? 'pct' : 'fact', arg: base };
    }
    return base;
  }
  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error('表达式不完整');
    if (t.t === 'num') { next(); return { type: 'num', value: t.v }; }
    if (t.t === 'op' && t.v === '(') {
      next();
      const inner = parseExpression();
      if (!isOp(peek(), ')')) throw new Error('缺少右括号');
      next();
      return inner;
    }
    if (t.t === 'op' && t.v === ')') throw new Error('多余的右括号');
    if (t.t === 'id') {
      next();
      if (t.v in CONST_MAP) return { type: 'num', value: CONST_MAP[t.v] };
      if (FN_SET.has(t.v)) {
        if (isOp(peek(), '^')) {
          const saved = pos - 1;
          next();
          const expNode = parseUnary();
          if (isOp(peek(), '(')) {
            next();
            const arg = parseExpression();
            if (!isOp(peek(), ')')) throw new Error('缺少右括号');
            next();
            return { type: 'powcall', name: t.v, arg, exp: expNode };
          }
          pos = saved;
        }
        if (isOp(peek(), '(')) {
          next();
          const args = [parseExpression()];
          while (isOp(peek(), ',')) { next(); args.push(parseExpression()); }
          if (!isOp(peek(), ')')) throw new Error('缺少右括号');
          next();
          return { type: 'call', name: t.v, args };
        }
        const arg = parseTerm();
        return { type: 'call', name: t.v, args: [arg] };
      }
      return { type: 'var', name: t.v };
    }
    throw new Error('无法解析的内容');
  }

  const node = parseExpression();
  if (pos < tokens.length) throw new Error('存在无法解析的内容');
  return node;
}

function compileExpr(src) {
  return parseExpr(tokenizeExpr(src));
}

function evalExpr(node, vars, radians) {
  switch (node.op) {
    case 'neg': return -evalExpr(node.arg, vars, radians);
    case 'pos': return evalExpr(node.arg, vars, radians);
    case 'pct': return evalExpr(node.arg, vars, radians) / 100;
    case 'fact': return _fact(evalExpr(node.arg, vars, radians));
  }
  switch (node.type) {
    case 'num': return node.value;
    case 'var': {
      if (Object.prototype.hasOwnProperty.call(vars, node.name)) return vars[node.name];
      throw new Error('未定义的变量: ' + node.name);
    }
    case 'call': return evalCall(node, vars, radians);
    case 'powcall': {
      const base = evalCall({ type: 'call', name: node.name, args: [node.arg] }, vars, radians);
      return Math.pow(base, evalExpr(node.exp, vars, radians));
    }
  }
  const lhs = evalExpr(node.lhs, vars, radians);
  const rhs = evalExpr(node.rhs, vars, radians);
  switch (node.op) {
    case '+': return lhs + rhs;
    case '-': return lhs - rhs;
    case '*': return lhs * rhs;
    case '/': return lhs / rhs;
    case '^': return Math.pow(lhs, rhs);
  }
  throw new Error('表达式错误');
}

function evalCall(node, vars, radians) {
  const a = node.args.map(x => evalExpr(x, vars, radians));
  const toRad = radians ? 1 : Math.PI / 180;
  const toDeg = radians ? 1 : 180 / Math.PI;
  switch (node.name) {
    case 'sin': return Math.sin(a[0] * toRad);
    case 'cos': return Math.cos(a[0] * toRad);
    case 'tan': return Math.tan(a[0] * toRad);
    case 'sec': return 1 / Math.cos(a[0] * toRad);
    case 'csc': return 1 / Math.sin(a[0] * toRad);
    case 'cot': return 1 / Math.tan(a[0] * toRad);
    case 'asin': return Math.asin(a[0]) * toDeg;
    case 'acos': return Math.acos(a[0]) * toDeg;
    case 'atan': return Math.atan(a[0]) * toDeg;
    case 'sinh': return Math.sinh(a[0]);
    case 'cosh': return Math.cosh(a[0]);
    case 'tanh': return Math.tanh(a[0]);
    case 'ln': return Math.log(a[0]);
    case 'log': return a.length > 1 ? Math.log(a[0]) / Math.log(a[1]) : Math.log10(a[0]);
    case 'sqrt': return Math.sqrt(a[0]);
    case 'abs': return Math.abs(a[0]);
    case 'exp': return Math.exp(a[0]);
    case 'floor': return Math.floor(a[0]);
    case 'ceil': return Math.ceil(a[0]);
    case 'round': return Math.round(a[0]);
    case 'sign': return Math.sign(a[0]);
    case 'cbrt': return Math.cbrt(a[0]);
    case 'fact': return _fact(a[0]);
    default: throw new Error('未知函数: ' + node.name);
  }
}

function safeEval(expr, vars) {
  if (!expr) return 0;
  return evalExpr(compileExpr(expr), vars || {}, isRadians);
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

const PRESETS = [
  {
    id: 'heron',
    icon: '△',
    name: '海伦公式',
    desc: '已知三角形三边 a、b、c，求面积',
    expression: 'sqrt((a+b+c)/2*((a+b+c)/2-a)*((a+b+c)/2-b)*((a+b+c)/2-c))',
    values: { a: '3', b: '4', c: '5' }
  }
];

function renderPresets() {
  const el = document.getElementById('presetList');
  if (!el) return;
  el.innerHTML = PRESETS.map(p =>
    '<button class="preset-chip" onclick="loadPreset(\'' + p.id + '\')">' +
      '<span class="preset-icon">' + p.icon + '</span>' +
      '<span class="preset-text"><span class="preset-name">' + p.name + '</span><span class="preset-desc">' + p.desc + '</span></span>' +
    '</button>'
  ).join('');
}

function loadPreset(id) {
  const p = PRESETS.find(x => x.id === id);
  if (!p) return;
  document.getElementById('formulaInput').value = p.expression;
  parseFormula();
  Object.entries(p.values).forEach(([v, val]) => {
    const inp = document.getElementById('var_' + v);
    if (inp) inp.value = val;
  });
  calculateFormula();
  showToast('已载入预设：' + p.name);
}
let parsedVars = [];

function parseFormula() {
  const expr = document.getElementById('formulaInput').value.trim();
  if (!expr) { document.getElementById('variablesPanel').style.display = 'none'; parsedVars = []; return; }
  const reserved = ['sin','cos','tan','asin','acos','atan','sinh','cosh','tanh','ln','log','sqrt','abs','exp','floor','ceil','round','sign','cbrt','sec','csc','cot','fact','pi','tau','e'];
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
  try {
    const r = safeEval(expr, vals);
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

/* ---- 图像模块（GeoGebra 风格） ---- */
const PLOT_DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -8, yMax: 8 };
let plotView = { ...PLOT_DEFAULT_VIEW };
let plotCursor = null;
let plotDrag = null;
let plotRaf = null;
let plotSnap = null;
let plotPoints = [];
let plotPointIndex = 0;
let plotLastDrag = 0;
let plotDownStart = null;

function addFunction() {
  const inp = document.getElementById('plotFunctionInput');
  const expr = inp.value.trim();
  if (!expr) { showToast('请输入函数表达式'); return; }
  let ast;
  try {
    ast = compileExpr(expr);
    evalExpr(ast, { x: 0 }, true);
  } catch (e) {
    showToast('无法解析表达式：' + e.message);
    return;
  }
  plotFunctions.push({ id: Date.now(), expression: expr, color: COLORS[plotFunctions.length % COLORS.length], visible: true, ast });
  inp.value = '';
  renderPlotList();
  if (plotFunctions.length === 1) plotFit(); else redrawPlot();
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
  if (!el) return;
  if (plotFunctions.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = plotFunctions.map(f =>
    '<div class="function-entry">' +
      '<span class="function-color" style="background:' + f.color + ';opacity:' + (f.visible ? 1 : 0.3) + '"></span>' +
      '<span class="function-text" id="fnText_' + f.id + '" onclick="editFunction(' + f.id + ')" title="点击编辑表达式">' + escHtml(f.expression) + '</span>' +
      '<button class="function-eye" onclick="toggleVis(' + f.id + ')" title="显示/隐藏">' + (f.visible ? '👁' : '◌') + '</button>' +
      '<button class="function-delete" onclick="removeFunc(' + f.id + ')">✕</button>' +
    '</div>'
  ).join('');
}

function editFunction(id) {
  const f = plotFunctions.find(x => x.id === id);
  if (!f) return;
  const span = document.getElementById('fnText_' + id);
  if (!span) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'function-edit';
  input.value = f.expression;
  span.replaceWith(input);
  input.focus();
  input.select();
  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    const val = input.value.trim();
    if (val) {
      try {
        const ast = compileExpr(val);
        evalExpr(ast, { x: 0 }, true);
        f.expression = val;
        f.ast = ast;
      } catch (e) {
        showToast('无法解析表达式：' + e.message);
      }
    }
    renderPlotList();
    redrawPlot();
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    renderPlotList();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') cancel();
  });
  input.addEventListener('blur', commit);
}

function plotZoom(factor) {
  const v = plotView;
  zoomAt((v.xMin + v.xMax) / 2, (v.yMin + v.yMax) / 2, factor);
}

function zoomAt(wx, wy, factor) {
  const v = plotView;
  const nxMin = wx - (wx - v.xMin) * factor;
  const nxMax = wx + (v.xMax - wx) * factor;
  const nyMin = wy - (wy - v.yMin) * factor;
  const nyMax = wy + (v.yMax - wy) * factor;
  if (nxMax - nxMin < 1e-10 || nyMax - nyMin < 1e-10) return;
  if (nxMax - nxMin > 1e12 || nyMax - nyMin > 1e12) return;
  plotView = { xMin: nxMin, xMax: nxMax, yMin: nyMin, yMax: nyMax };
  clearPlotCursor();
  redrawPlot();
}

function plotFit() {
  const visible = plotFunctions.filter(f => f.visible);
  if (visible.length === 0) { plotReset(); return; }
  const span = plotView.xMax - plotView.xMin;
  let yMin = Infinity, yMax = -Infinity;
  for (const f of visible) {
    for (let i = 0; i <= 400; i++) {
      const x = plotView.xMin + span * i / 400;
      try {
        const y = evalExpr(f.ast, { x }, true);
        if (isFinite(y)) { if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
      } catch (e) {}
    }
  }
  if (!isFinite(yMin)) { plotReset(); return; }
  const pad = (yMax - yMin) * 0.12 || 1;
  plotView = { ...plotView, yMin: yMin - pad, yMax: yMax + pad };
  clearPlotCursor();
  redrawPlot();
}

function plotReset() {
  plotView = { ...PLOT_DEFAULT_VIEW };
  clearPlotCursor();
  redrawPlot();
}

function fmtCoord(v) {
  if (!isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-6 && v !== 0)) return v.toExponential(4);
  return String(parseFloat(v.toPrecision(6)));
}

function redrawPlot() {
  const canvas = document.getElementById('plotCanvas');
  const vp = document.getElementById('plotViewport');
  if (!canvas || !vp) return;
  const rect = vp.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width));
  const H = Math.max(1, Math.round(rect.height));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const v = plotView;
  const X = wx => (wx - v.xMin) / (v.xMax - v.xMin) * W;
  const Y = wy => H - (wy - v.yMin) / (v.yMax - v.yMin) * H;
  drawPlotGrid(ctx, W, H, X, Y, v);
  plotFunctions.forEach(f => { if (f.visible) drawPlotCurve(ctx, W, H, X, Y, f); });
  drawPlotPoints(ctx, W, H, X, Y);
  if (plotFunctions.length === 0) {
    ctx.fillStyle = 'rgba(245,245,247,0.45)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('在上方输入函数，例如 2x、sin(x)、lnx、x^2+1', W / 2, H / 2);
  }
  drawPlotCursor(ctx, W, H, X, Y);
}

function niceStep(unitsPerPixel, targetPx) {
  const step = (targetPx || 80) * unitsPerPixel;
  if (!(step > 0) || !isFinite(step)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(step)));
  for (const m of [1, 2, 5, 10]) if (step <= m * mag) return m * mag;
  return 10 * mag;
}

function fmtTick(v, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(decimals);
}

function drawPlotGrid(ctx, W, H, X, Y, v) {
  const stepX = niceStep((v.xMax - v.xMin) / W);
  const stepY = niceStep((v.yMax - v.yMin) / H);
  const zeroX = X(0), zeroY = Y(0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  for (let gx = Math.ceil(v.xMin / stepX) * stepX; gx <= v.xMax + stepX * 0.01; gx += stepX) {
    if (Math.abs(gx) < stepX * 1e-6) continue;
    const px = X(gx);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  for (let gy = Math.ceil(v.yMin / stepY) * stepY; gy <= v.yMax + stepY * 0.01; gy += stepY) {
    if (Math.abs(gy) < stepY * 1e-6) continue;
    const py = Y(gy);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = 1.6;
  if (zeroY >= 0 && zeroY <= H) {
    ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(W, zeroY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W - 8, zeroY - 5); ctx.lineTo(W, zeroY); ctx.lineTo(W - 8, zeroY + 5); ctx.stroke();
  }
  if (zeroX >= 0 && zeroX <= W) {
    ctx.beginPath(); ctx.moveTo(zeroX, H); ctx.lineTo(zeroX, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(zeroX - 5, 8); ctx.lineTo(zeroX, 0); ctx.lineTo(zeroX + 5, 8); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(245,245,247,0.55)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const labelY = (zeroY >= 0 && zeroY <= H) ? zeroY + 16 : H - 8;
  for (let gx = Math.ceil(v.xMin / stepX) * stepX; gx <= v.xMax + stepX * 0.01; gx += stepX) {
    if (Math.abs(gx) < stepX * 1e-6) continue;
    ctx.fillText(fmtTick(gx, stepX), X(gx), labelY);
  }
  ctx.textAlign = 'right';
  const labelX = (zeroX >= 0 && zeroX <= W) ? zeroX - 7 : 42;
  for (let gy = Math.ceil(v.yMin / stepY) * stepY; gy <= v.yMax + stepY * 0.01; gy += stepY) {
    if (Math.abs(gy) < stepY * 1e-6) continue;
    ctx.fillText(fmtTick(gy, stepY), labelX, Y(gy) + 4);
  }
  if (zeroX >= 0 && zeroX <= W && zeroY >= 0 && zeroY <= H) {
    ctx.textAlign = 'right';
    ctx.fillText('0', zeroX - 6, zeroY + 16);
  }
}

function drawPlotCurve(ctx, W, H, X, Y, f) {
  const v = plotView;
  const samples = Math.min(W, 1600);
  const dx = (v.xMax - v.xMin) / samples;
  let started = false;
  let lastPy = null;
  ctx.beginPath();
  for (let i = 0; i <= samples; i++) {
    const x = v.xMin + dx * i;
    let y;
    try { y = evalExpr(f.ast, { x }, true); } catch (e) { y = NaN; }
    if (!isFinite(y) || Math.abs(y) > 1e14) { started = false; lastPy = null; continue; }
    const px = X(x);
    const py = Y(y);
    if (py < -H || py > 2 * H) { started = false; lastPy = null; continue; }
    if (lastPy !== null && Math.abs(py - lastPy) > H * 0.6) started = false;
    if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
    lastPy = py;
  }
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = f.color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2.4;
  ctx.stroke();
}

function drawPlotCursor(ctx, W, H, X, Y) {
  if (!plotCursor) return;
  const { wx, px, py } = plotCursor;
  for (const f of plotFunctions) {
    if (!f.visible) continue;
    let y;
    try { y = evalExpr(f.ast, { x: wx }, true); } catch (e) { continue; }
    if (!isFinite(y)) continue;
    const pointPy = Y(y);
    if (Math.abs(pointPy - py) <= 12) {
      ctx.beginPath();
      ctx.arc(px, pointPy, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (plotSnap && plotSnap.color === f.color) {
        ctx.beginPath();
        ctx.arc(px, pointPy, 8, 0, Math.PI * 2);
        ctx.strokeStyle = f.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }
}

function findPlotSnap(wx, mousePy, rect, threshold) {
  const v = plotView;
  let best = null;
  let bestDy = threshold || 12;
  for (const f of plotFunctions) {
    if (!f.visible) continue;
    let y;
    try { y = evalExpr(f.ast, { x: wx }, true); } catch (e) { continue; }
    if (!isFinite(y)) continue;
    const pointPy = rect.height - (y - v.yMin) / (v.yMax - v.yMin) * rect.height;
    const dy = Math.abs(pointPy - mousePy);
    if (dy < bestDy) { bestDy = dy; best = { wx, y, color: f.color, py: pointPy }; }
  }
  return best;
}

function updatePlotCrosshair(px, py) {
  const xl = document.getElementById('plotCrossX');
  const yl = document.getElementById('plotCrossY');
  if (!xl || !yl) return;
  xl.style.display = 'block';
  yl.style.display = 'block';
  xl.style.transform = 'translate3d(0, ' + py + 'px, 0)';
  yl.style.transform = 'translate3d(' + px + 'px, 0, 0)';
}

function hidePlotCrosshair() {
  const xl = document.getElementById('plotCrossX');
  const yl = document.getElementById('plotCrossY');
  if (xl) xl.style.display = 'none';
  if (yl) yl.style.display = 'none';
}

function clearPlotCursor() {
  plotCursor = null;
  plotSnap = null;
  hidePlotCrosshair();
}

/* ---- 标注点 ---- */
function plotPointLabel() {
  const n = plotPointIndex;
  const letter = String.fromCharCode(65 + (n % 26));
  const suffix = n >= 26 ? Math.floor(n / 26) : '';
  return letter + suffix;
}

function addPlotPoint(x, y, color) {
  const label = plotPointLabel();
  plotPoints.push({ id: Date.now() + Math.random(), x, y, color, label });
  plotPointIndex++;
  redrawPlot();
  showToast('已标注点 ' + label + ' (' + fmtCoord(x) + ', ' + fmtCoord(y) + ')');
}

function removePlotPoint(id) {
  const p = plotPoints.find(q => q.id === id);
  plotPoints = plotPoints.filter(q => q.id !== id);
  redrawPlot();
  showToast('已删除标注点 ' + (p ? p.label : ''));
}

function findPlotPointAt(px, py) {
  const v = plotView;
  const canvas = document.getElementById('plotCanvas');
  const rect = canvas.getBoundingClientRect();
  for (const p of plotPoints) {
    const sx = (p.x - v.xMin) / (v.xMax - v.xMin) * rect.width;
    const sy = rect.height - (p.y - v.yMin) / (v.yMax - v.yMin) * rect.height;
    if (Math.hypot(sx - px, sy - py) <= 8) return p;
  }
  return null;
}

function handlePlotClick(e) {
  const canvas = document.getElementById('plotCanvas');
  const canvasRect = canvas.getBoundingClientRect();
  const px = e.clientX - canvasRect.left;
  const py = e.clientY - canvasRect.top;
  if (px < 0 || py < 0 || px > canvasRect.width || py > canvasRect.height) return;
  const v = plotView;
  const wx = v.xMin + (px / canvasRect.width) * (v.xMax - v.xMin);
  const wy = v.yMax - (py / canvasRect.height) * (v.yMax - v.yMin);
  const existing = findPlotPointAt(px, py);
  if (existing) { removePlotPoint(existing.id); return; }
  const snap = findPlotSnap(wx, py, canvasRect, 14);
  if (snap) { addPlotPoint(snap.wx, snap.y, snap.color); return; }
  addPlotPoint(wx, wy, '#8fd8ff');
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPlotPoints(ctx, W, H, X, Y) {
  if (plotPoints.length === 0) return;
  ctx.save();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const p of plotPoints) {
    const px = X(p.x);
    const py = Y(p.y);
    if (px < -40 || px > W + 40 || py < -40 || py > H + 40) continue;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const label = p.label + ' (' + fmtCoord(p.x) + ', ' + fmtCoord(p.y) + ')';
    const tw = ctx.measureText(label).width;
    const pad = 5;
    const bw = tw + pad * 2;
    const bh = 17;
    let lx = px + 10;
    let ly = py - bh - 8;
    if (lx + bw > W - 4) lx = px - 10 - bw;
    if (ly < 4) ly = py + 10;
    ctx.fillStyle = 'rgba(8,8,18,0.74)';
    fillRoundRect(ctx, lx, ly, bw, bh, 4);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.fillText(label, lx + pad, ly + bh / 2 + 0.5);
  }
  ctx.restore();
}

/* ---- 全屏 ---- */
function togglePlotFullscreen() {
  const vp = document.getElementById('plotViewport');
  if (!vp) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (vp.requestFullscreen) {
    vp.requestFullscreen().catch(() => showToast('当前环境不支持全屏'));
  }
}

document.addEventListener('fullscreenchange', () => {
  const btn = document.getElementById('plotFullscreenBtn');
  if (btn) {
    const isFs = !!document.fullscreenElement;
    btn.textContent = isFs ? '⤡' : '⤢';
    btn.title = isFs ? '退出全屏' : '全屏';
  }
  setTimeout(redrawPlot, 60);
});

function updatePlotReadout(wx, py, rect) {
  const ro = document.getElementById('plotReadout');
  if (!ro) return;
  const v = plotView;
  const wy = v.yMax - (py / rect.height) * (v.yMax - v.yMin);
  const parts = ['x = ' + fmtCoord(wx), 'y = ' + fmtCoord(wy)];
  for (const f of plotFunctions) {
    if (!f.visible) continue;
    let y;
    try { y = evalExpr(f.ast, { x: wx }, true); } catch (e) { continue; }
    if (!isFinite(y)) continue;
    const pointPy = rect.height - (y - v.yMin) / (v.yMax - v.yMin) * rect.height;
    if (Math.abs(pointPy - py) <= 12) {
      parts.push('<span style="color:' + f.color + '">f(x) = ' + fmtCoord(y) + '</span>');
    }
  }
  ro.innerHTML = parts.join('　');
}

function requestPlotRedraw() {
  if (plotRaf) return;
  plotRaf = requestAnimationFrame(() => { plotRaf = null; redrawPlot(); });
}

(function initPlot() {
  const vp = document.getElementById('plotViewport');
  if (!vp) return;
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const wx = plotView.xMin + ((e.clientX - rect.left) / rect.width) * (plotView.xMax - plotView.xMin);
    const wy = plotView.yMax - ((e.clientY - rect.top) / rect.height) * (plotView.yMax - plotView.yMin);
    zoomAt(wx, wy, e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });
  vp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    clearPlotCursor();
    plotDownStart = { x: e.clientX, y: e.clientY };
  });
  vp.addEventListener('pointermove', e => {
    if (plotDrag) {
      const rect = vp.getBoundingClientRect();
      const dx = (e.clientX - plotDrag.startX) / rect.width;
      const dy = (e.clientY - plotDrag.startY) / rect.height;
      const spanX = plotDrag.view.xMax - plotDrag.view.xMin;
      const spanY = plotDrag.view.yMax - plotDrag.view.yMin;
      plotView = {
        xMin: plotDrag.view.xMin - dx * spanX,
        xMax: plotDrag.view.xMax - dx * spanX,
        yMin: plotDrag.view.yMin + dy * spanY,
        yMax: plotDrag.view.yMax + dy * spanY
      };
      requestPlotRedraw();
      return;
    }
    if (plotDownStart) {
      const dx = e.clientX - plotDownStart.x;
      const dy = e.clientY - plotDownStart.y;
      if (Math.hypot(dx, dy) > 5) {
        plotDrag = { startX: plotDownStart.x, startY: plotDownStart.y, view: { ...plotView } };
        try { vp.setPointerCapture(e.pointerId); } catch (err) {}
        vp.classList.add('dragging');
        const rect = vp.getBoundingClientRect();
        const spanX = plotView.xMax - plotView.xMin;
        const spanY = plotView.yMax - plotView.yMin;
        plotView = {
          xMin: plotView.xMin - (dx / rect.width) * spanX,
          xMax: plotView.xMax - (dx / rect.width) * spanX,
          yMin: plotView.yMin + (dy / rect.height) * spanY,
          yMax: plotView.yMax + (dy / rect.height) * spanY
        };
        requestPlotRedraw();
        return;
      }
    }
    const canvas = document.getElementById('plotCanvas');
    const canvasRect = canvas.getBoundingClientRect();
    const vpRect = vp.getBoundingClientRect();
    const px = e.clientX - canvasRect.left;
    const py = e.clientY - canvasRect.top;
    if (px < 0 || py < 0 || px > canvasRect.width || py > canvasRect.height) return;
    const wx = plotView.xMin + (px / canvasRect.width) * (plotView.xMax - plotView.xMin);
    const borderX = canvasRect.left - vpRect.left;
    const borderY = canvasRect.top - vpRect.top;
    const snap = findPlotSnap(wx, py, canvasRect);
    if (snap) {
      plotSnap = snap;
      plotCursor = { wx: snap.wx, px, py: snap.py };
      updatePlotCrosshair(px + borderX, snap.py + borderY);
      updatePlotReadout(snap.wx, snap.py, canvasRect);
    } else {
      plotSnap = null;
      plotCursor = { wx, px, py };
      updatePlotCrosshair(px + borderX, py + borderY);
      updatePlotReadout(wx, py, canvasRect);
    }
    requestPlotRedraw();
  });
  const endDrag = e => {
    if (plotDrag) {
      plotLastDrag = Math.hypot(e.clientX - plotDrag.startX, e.clientY - plotDrag.startY);
    }
    plotDrag = null;
    plotDownStart = null;
    vp.classList.remove('dragging');
  };
  vp.addEventListener('pointerup', endDrag);
  vp.addEventListener('pointercancel', endDrag);
  vp.addEventListener('click', e => {
    if (plotLastDrag > 5) { plotLastDrag = 0; return; }
    if (e.target.closest && e.target.closest('.plot-zoom-controls, .plot-readout')) return;

    handlePlotClick(e);
  });
  vp.addEventListener('pointerleave', () => {
    if (plotDrag) return;
    clearPlotCursor();
    const ro = document.getElementById('plotReadout');
    if (ro) ro.innerHTML = '';
    redrawPlot();
  });
})();

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
  renderPresets();
  setTimeout(redrawPlot, 100);
});

window.addEventListener('resize', () => redrawPlot());
