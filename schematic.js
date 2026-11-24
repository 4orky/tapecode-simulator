/* 原理图渲染（SVG，D 形 NAND + 正交走线 + 信号流动画 + 开关/LED）
 *
 * 来源：从被否掉的 v2 闯关版 game.js 里抽出的纯渲染函数（与 app.js 的
 * layoutCircuit 常量 NW=74/NH=30 保持一致），与玩法逻辑解耦。
 * 线色沿用 Logisim：1 亮绿 #37d13a、0 暗绿 #127a15、未求值灰 #8a877c。
 * UMD：浏览器挂 window.TapeSchematic；Node 里 module.exports。
 *
 * renderSchematic(container, circuit, layout, signals, opts)
 *   opts: { flow: bool（默认 true，值为 1 的线上画流动脉冲）, highlight: 输入序号或 -1 }
 *   输入引脚带 data-input 属性，调用方自行在容器上委托 click 事件处理拨动。
 *   返回 { width, height }。
 * renderGateTable(container, circuit, signals)：节点+边 > 20000 时的降级门表。
 */
(function (global) {
  'use strict';

  var NW = 74, NH = 30;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* 目标门的输入引脚 Y：NAND 第 j 个输入在 y+9 / y+21；LATCH 单输入在 y+15 */
  function pinY(node, gate, sig) {
    if (!gate) return node.y + NH / 2;
    if (gate.op === 0x01) return node.y + NH / 2;
    var j = gate.w.indexOf(sig);
    return node.y + (j === 1 ? 21 : 9);
  }
  function orthoPath(x1, y1, x2, y2, bottomY) {
    if (x2 - x1 >= 8) {
      var mx = Math.round((x1 + x2) / 2);
      return 'M ' + x1 + ' ' + y1 + ' L ' + mx + ' ' + y1 + ' L ' + mx + ' ' + y2 + ' L ' + x2 + ' ' + y2;
    }
    // 反馈边：绕到底部再折回
    var bx = Math.max(8, x2 - 28);
    return 'M ' + x1 + ' ' + y1 + ' L ' + (x1 + 28) + ' ' + y1 + ' L ' + (x1 + 28) + ' ' + bottomY +
      ' L ' + bx + ' ' + bottomY + ' L ' + bx + ' ' + y2 + ' L ' + x2 + ' ' + y2;
  }

  function renderSchematic(container, circuit, layout, signals, opts) {
    opts = opts || {};
    var W = layout.width + 56, H = layout.height + 44;
    var bottomY = layout.height + 20;
    var nodeBySig = layout.nodeBySig;
    var s = '';
    s += '<svg class="schem" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" data-w="' + W + '" data-h="' + H + '">';
    s += '<defs>' +
      '<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">' +
      '<path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,0.10)" stroke-width="1"/></pattern>' +
      '<pattern id="gridbig" width="80" height="80" patternUnits="userSpaceOnUse">' +
      '<path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(148,163,184,0.16)" stroke-width="1"/></pattern>' +
      '<filter id="glow" x="-60%" y="-60%" width="220%" height="220%">' +
      '<feGaussianBlur stdDeviation="3" result="b"/>' +
      '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '</defs>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#grid)"/>' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#gridbig)"/>';
    // ---- 边（正交走线） ----
    var oneEdges = [];
    layout.edges.forEach(function (e, ei) {
      var a = nodeBySig[e.from], b = nodeBySig[e.to];
      if (!a || !b) return;
      var gate = circuit.gates[e.gate];
      var x1 = a.x + NW, y1 = a.y + NH / 2;
      var x2 = b.x, y2 = pinY(b, gate, e.from);
      var d = orthoPath(x1, y1, x2, y2, bottomY);
      var v = signals[e.from] ? 1 : 0;
      if (v === 1) oneEdges.push({ d: d, i: ei });
      s += '<path class="wire w' + v + (e.latch ? ' latch' : '') + '" d="' + d + '"/>';
    });
    // ---- 信号流动脉冲（只在值为 1 的线上，最多 120 个） ----
    if (opts.flow !== false && oneEdges.length) {
      var step = Math.max(1, Math.floor(oneEdges.length / 120));
      for (var pi = 0; pi < oneEdges.length; pi += step) {
        var pe = oneEdges[pi];
        var begin = (-(pe.i % 11) * 0.1).toFixed(1);
        s += '<circle class="pulse" r="2.6" fill="#bbf7d0"><animateMotion dur="1.1s" begin="' + begin +
          's" repeatCount="indefinite" path="' + pe.d + '"/></circle>';
      }
    }
    // ---- 节点 ----
    layout.nodes.forEach(function (n) {
      var v = signals[n.sig] ? 1 : 0;
      var x = n.x, y = n.y;
      if (n.kind === 'const0' || n.kind === 'const1') {
        s += '<g class="node const"><circle cx="' + (x + NW / 2) + '" cy="' + (y + NH / 2) + '" r="9" fill="#1e293b" stroke="#64748b"/>' +
          '<text x="' + (x + NW / 2) + '" y="' + (y + NH / 2 + 4) + '" text-anchor="middle" class="t-val">' + (n.kind === 'const1' ? '1' : '0') + '</text>' +
          '<line x1="' + (x + NW / 2 + 9) + '" y1="' + (y + NH / 2) + '" x2="' + (x + NW) + '" y2="' + (y + NH / 2) + '" class="stub w' + v + '"/></g>';
      } else if (n.kind === 'input') {
        var ii = n.sig - 2;
        var hl = opts.highlight === ii ? ' hl' : '';
        s += '<g class="node sw' + hl + '" data-input="' + ii + '">' +
          '<rect x="' + x + '" y="' + y + '" width="' + NW + '" height="' + NH + '" fill="transparent"/>' +
          '<text x="' + (x + NW / 2) + '" y="' + (y + 9) + '" text-anchor="middle" class="t-pin">I' + ii + '</text>' +
          '<rect x="' + (x + 12) + '" y="' + (y + 13) + '" width="50" height="9" rx="4.5" class="sw-track"/>' +
          '<circle cx="' + (x + (v ? 52 : 22)) + '" cy="' + (y + 17.5) + '" r="7" class="sw-knob ' + (v ? 'on' : 'off') + '"/>' +
          '<title>点击拨动 I' + ii + '（当前 ' + v + '）</title></g>';
      } else if (n.kind === 'nand') {
        // D 形门：左平右半圆 + 输出反相泡
        var gx = x + 6, gy = y + 3, gw = 40, gh = 24;
        s += '<g class="node gate"><title>NAND #' + n.gateIndex + ' → 信号 ' + n.sig + ' = ' + v + '</title>' +
          '<path d="M ' + gx + ' ' + gy + ' L ' + (gx + gw - 12) + ' ' + gy +
          ' A 12 12 0 0 1 ' + (gx + gw - 12) + ' ' + (gy + gh) + ' L ' + gx + ' ' + (gy + gh) + ' Z" class="gate-body"/>' +
          '<text x="' + (gx + 16) + '" y="' + (gy + 17) + '" text-anchor="middle" class="t-gate">&amp;</text>' +
          '<line x1="' + x + '" y1="' + (y + 9) + '" x2="' + gx + '" y2="' + (y + 9) + '" class="stub w' + signals[circuit.gates[n.gateIndex].w[0]] + '"/>' +
          '<line x1="' + x + '" y1="' + (y + 21) + '" x2="' + gx + '" y2="' + (y + 21) + '" class="stub w' + signals[circuit.gates[n.gateIndex].w[1]] + '"/>' +
          '<circle cx="' + (gx + gw + 4) + '" cy="' + (y + NH / 2) + '" r="3.5" class="bubble"/>' +
          '<line x1="' + (gx + gw + 7.5) + '" y1="' + (y + NH / 2) + '" x2="' + (x + NW) + '" y2="' + (y + NH / 2) + '" class="stub w' + v + '"/></g>';
      } else if (n.kind === 'latch') {
        s += '<g class="node gate latch-node"><title>LATCH #' + n.gateIndex + ' → 信号 ' + n.sig + ' = ' + v + '</title>' +
          '<rect x="' + (x + 6) + '" y="' + (y + 3) + '" width="52" height="24" rx="3" class="gate-body latch-body"/>' +
          '<text x="' + (x + 32) + '" y="' + (y + 19) + '" text-anchor="middle" class="t-gate">LATCH</text>' +
          '<line x1="' + x + '" y1="' + (y + NH / 2) + '" x2="' + (x + 6) + '" y2="' + (y + NH / 2) + '" class="stub w' + signals[circuit.gates[n.gateIndex].w[0]] + '"/>' +
          '<line x1="' + (x + 58) + '" y1="' + (y + NH / 2) + '" x2="' + (x + NW) + '" y2="' + (y + NH / 2) + '" class="stub w' + v + '"/></g>';
      } else { // ref：暂不支持，画虚线框
        s += '<g class="node gate"><rect x="' + (x + 6) + '" y="' + (y + 3) + '" width="52" height="24" rx="3" class="gate-body" stroke-dasharray="4 3"/>' +
          '<text x="' + (x + 32) + '" y="' + (y + 19) + '" text-anchor="middle" class="t-gate">REF</text></g>';
      }
      // 输出 LED（画在最右侧层）
      if (n.isOutput) {
        var lx = x + NW + 20, ly = y + NH / 2;
        s += '<g class="node led"><line x1="' + (x + NW) + '" y1="' + ly + '" x2="' + (lx - 10) + '" y2="' + ly + '" class="stub w' + v + '"/>' +
          '<circle cx="' + lx + '" cy="' + ly + '" r="9" class="led-dot ' + (v ? 'on' : 'off') + '"/>' +
          '<text x="' + lx + '" y="' + (y + 1) + '" text-anchor="middle" class="t-pin">O' + n.outIndex + '</text></g>';
      }
    });
    s += '</svg>';
    container.innerHTML = s;
    return { width: W, height: H };
  }

  /* 门表降级（节点+边 > 20000 时，沿用 v1 兜底） */
  function renderGateTable(container, circuit, signals) {
    var rows = circuit.gates.map(function (g, gi) {
      var val = signals[g.firstOut];
      var desc = g.op === 0x00 ? 'NAND(' + g.w[0] + ', ' + g.w[1] + ')' :
        (g.op === 0x01 ? 'LATCH(d=' + g.w[0] + ')' : 'REF（暂不支持）');
      return '<tr><td>' + gi + '</td><td>' + desc + '</td><td>→ 信号 ' + g.firstOut + '</td>' +
        '<td class="sig-' + val + '">' + val + '</td></tr>';
    }).join('');
    container.innerHTML = '<p class="hint">电路规模过大，自动降级为门表模式（不画图）。</p>' +
      '<table class="gates"><thead><tr><th>门 #</th><th>类型与输入</th><th>输出</th><th>当前值</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
  }

  var api = {
    NODE_W: NW, NODE_H: NH,
    esc: esc, pinY: pinY, orthoPath: orthoPath,
    renderSchematic: renderSchematic, renderGateTable: renderGateTable
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TapeSchematic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
