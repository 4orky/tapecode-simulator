/* 《链上造芯厂》TapeOut — From One NAND to a CPU
 * X Layer × TapeOut Accelerate 黑客松 P0（2026-11-24 用户批准方向）
 *
 * 结构（与 v1 app.js 同款 UMD）：
 *   1. 纯逻辑（无 DOM）：PoD 真题定义、迷你画布草稿（NAND 门拼电路）、
 *      tapnet 序列化（走 TapeSim.parseTapnet/peek 真仿真，不做假仿真）、
 *      真值表验货、星级、流片（NFT 卡 + 真实 SHA-256）、挖矿结算、
 *      图鉴数据、Test1 图鉴数据。Node 回归 test-factory.cjs 直接 require 检验。
 *   2. 界面（有 document 时才执行）：小镇地图、序章、第一章画布、
 *      流片仪式、矿场、Test1 图鉴 + 模拟器、图鉴。
 * 依赖：app.js（window.TapeSim：解析/仿真/取数链）、schematic.js
 * （window.TapeSchematic：D 形原理图渲染）。
 *
 * 诚实红线（写进代码与界面，不可绕过）：
 * - 游戏 BEM 与真实 BEM 严格区分，处处标“游戏币，不是真实 BEM”；
 * - 不连钱包、不花真钱、不承诺收益；
 * - 真实数字标快照时间（2026-11-24）；Test1 网表是随机分配的收藏品，
 *   不是任何 PoD 题的答案；
 * - 网表不在链上：信任根是链上 baseURI 指纹 + SHA-256 校验链；
 * - 不声称 TapeSend 集成。
 */
(function (global) {
  'use strict';
  var T = global.TapeSim || (typeof require !== 'undefined' ? require('./app.js') : null);

  /* ================= 工具 ================= */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function shortSha(sha) {
    if (!sha) return '—';
    sha = String(sha).replace(/^0x/, '');
    return '0x' + sha.slice(0, 10) + '…' + sha.slice(-6);
  }
  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function rarityOf(of) {
    if (of >= 1000) return { name: '普通', cls: 'common', stars: 1 };
    if (of >= 50) return { name: '稀有', cls: 'rare', stars: 2 };
    if (of >= 25) return { name: '史诗', cls: 'epic', stars: 3 };
    return { name: '传说', cls: 'legendary', stars: 4 };
  }
  function outputsMatch(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function hamDist(a, b) {
    var d = 0;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
    return d;
  }
  /* 星级：门数 <= par 3 星；<= par+2 2 星；<= limit 1 星；否则 0 */
  function starFor(steps, par, limit) {
    if (steps <= par) return 3;
    if (steps <= par + 2) return 2;
    if (steps <= limit) return 1;
    return 0;
  }

  /* ================= PoD 真题（第一章） ================= */
  // truth(inp) -> 期望输出数组；inp 位序与 inNames 一致（LSB-first 语义由题义定）。
  var PROBLEMS = [
    {
      id: 'fa', name: '全加器', sub: '教学关 · 4 位加法器的基本单元',
      teach: '全加器：3 个输入（a、b、进位 in），2 个输出（和、进位 out）。和 = a⊕b⊕进位；进位 = 三个输入里至少两个是 1。9 个 NAND 门就能拼出来——它是 4 位加法器的基本单元。',
      nIn: 3, inNames: ['a', 'b', '进位 in'],
      nOut: 2, outNames: ['和', '进位 out'],
      truth: function (inp) {
        var a = inp[0], b = inp[1], c = inp[2];
        return [a ^ b ^ c, (a & b) | (a & c) | (b & c)];
      },
      par: 9, limit: 12, rows: 'all'
    },
    {
      id: 'adder4', name: '4 位加法器', sub: 'PoD 真题 · 267 道题库之一',
      teach: '4 位加法器：a0–a3 与 b0–b3 相加（a0、b0 是最低位），再加进位 in，输出 s0–s3 与进位 out。它就是 4 个全加器串起来的“行波进位”：低位的进位一路传到高位。36 个 NAND 门是标准做法。',
      nIn: 9, inNames: ['a0', 'a1', 'a2', 'a3', 'b0', 'b1', 'b2', 'b3', '进位 in'],
      nOut: 5, outNames: ['s0', 's1', 's2', 's3', '进位 out'],
      truth: function (inp) {
        var a = inp[0] | (inp[1] << 1) | (inp[2] << 2) | (inp[3] << 3);
        var b = inp[4] | (inp[5] << 1) | (inp[6] << 2) | (inp[7] << 3);
        var s = a + b + inp[8];
        return [s & 1, (s >> 1) & 1, (s >> 2) & 1, (s >> 3) & 1, (s >> 4) & 1];
      },
      par: 36, limit: 44, rows: 'sample',
      // 展示用的 16 行抽查（a, b, cin），验货时仍全验 512 行
      sampleRows: [
        [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [2, 3, 0], [5, 7, 0],
        [8, 8, 0], [15, 1, 0], [15, 15, 0], [15, 15, 1], [9, 6, 0], [4, 11, 0],
        [13, 2, 1], [7, 7, 1], [10, 5, 0], [3, 12, 1]
      ]
    },
    {
      id: 'maj', name: '多数表决器', sub: 'PoD 真题 · 267 道题库之一',
      teach: '多数表决器：3 个输入里至少两个是 1，输出就是 1。它的输出正好是全加器的“进位”——所以会做表决器，就会做加法器的进位。6 个 NAND 门就能拼出来。',
      nIn: 3, inNames: ['a', 'b', 'c'],
      nOut: 1, outNames: ['表决结果'],
      truth: function (inp) {
        return [((inp[0] + inp[1] + inp[2]) >= 2) ? 1 : 0];
      },
      par: 6, limit: 9, rows: 'all'
    },
    {
      id: 'shifter', name: '桶形移位器', sub: 'PoD 真题 · 267 道题库之一',
      teach: '桶形移位器：4 位数据 d3d2d1d0 左移 s 位（s = s0 + 2×s1，0–3 位），移出去的丢掉，右边补 0。诀窍是分两级移：先按 s0 移 0 或 1 位，再按 s1 移 0 或 2 位——每级 4 个选择器，26 个 NAND 门是标准做法。',
      nIn: 6, inNames: ['d0', 'd1', 'd2', 'd3', 's0', 's1'],
      nOut: 4, outNames: ['y0', 'y1', 'y2', 'y3'],
      truth: function (inp) {
        var d = inp[0] | (inp[1] << 1) | (inp[2] << 2) | (inp[3] << 3);
        var s = inp[4] + 2 * inp[5];
        var y = (d << s) & 0xF;
        return [y & 1, (y >> 1) & 1, (y >> 2) & 1, (y >> 3) & 1];
      },
      par: 26, limit: 32, rows: 'all'
    },
    {
      id: 'cmp2', name: '2 位比较器', sub: 'PoD 真题 · 267 道题库之一',
      teach: '2 位比较器：a（a1a0）和 b（b1b0）比大小，输出三路：a>b、a=b、a<b。先比高位：高位分胜负就不用看低位；高位相等才看低位。相等用同或门（XNOR），大小用“高位赢，或高位平且低位赢”——34 个 NAND 门是标准做法。',
      nIn: 4, inNames: ['a1', 'a0', 'b1', 'b0'],
      nOut: 3, outNames: ['a>b', 'a=b', 'a<b'],
      truth: function (inp) {
        var a = 2 * inp[0] + inp[1], b = 2 * inp[2] + inp[3];
        return [a > b ? 1 : 0, a === b ? 1 : 0, a < b ? 1 : 0];
      },
      par: 34, limit: 40, rows: 'all'
    },
    {
      id: 'sbox', name: 'S 盒', sub: 'PoD 真题 · 267 道题库之一',
      teach: 'S 盒是密码学里的置换盒：4 位输入查表换成 4 位输出（PRESENT 密码的 S 盒），没有固定公式，只能按输入一位一位选。标准做法是 4 级选择器树：每级按一位输入二选一，16 个常数里选一个；四个输出位共用同一棵树的选择信号，184 个 NAND 门是标准做法。',
      nIn: 4, inNames: ['d0', 'd1', 'd2', 'd3'],
      nOut: 4, outNames: ['y0', 'y1', 'y2', 'y3'],
      truth: function (inp) {
        var sbox = [0xC, 0x5, 0x6, 0xB, 0x9, 0x0, 0xA, 0xD, 0x3, 0xE, 0xF, 0x8, 0x4, 0x7, 0x1, 0x2];
        var x = inp[0] | (inp[1] << 1) | (inp[2] << 2) | (inp[3] << 3);
        var y = sbox[x];
        return [y & 1, (y >> 1) & 1, (y >> 2) & 1, (y >> 3) & 1];
      },
      par: 184, limit: 240, rows: 'all'
    }
  ];
  function problemById(id) {
    for (var i = 0; i < PROBLEMS.length; i++) if (PROBLEMS[i].id === id) return PROBLEMS[i];
    return null;
  }
  function allInputRows(nIn) {
    var rows = [], total = 1 << nIn;
    for (var v = 0; v < total; v++) {
      var r = [];
      for (var i = 0; i < nIn; i++) r.push((v >> i) & 1);
      rows.push(r);
    }
    return rows;
  }
  function sampleInputRows(prob) {
    return prob.sampleRows.map(function (t) {
      var a = t[0], b = t[1], cin = t[2], r = [];
      for (var i = 0; i < 4; i++) r.push((a >> i) & 1);
      for (var j = 0; j < 4; j++) r.push((b >> j) & 1);
      r.push(cin);
      return r;
    });
  }

  /* ================= 迷你画布草稿 ================= */
  // src（信号源）：{k:'c', v:0|1} 常量 | {k:'i', idx} 电路输入 | {k:'g', id} 门输出
  // gate：{id, op:0(NAND)|1(LATCH), x, y, in0:src|null, in1:src|null}（LATCH 只用 in0）
  // draft：{problemId, gates:[], outputs:[src|null], nextId}
  // 不变量（connect() 强制）：输出脚是终点——接了输出脚的门不能再接给别的门
  // （tapnet 要求输出 = 最后 nOut 个门信号；此规则保证序列化时输出门可排最后）。
  function newDraft(problemId) {
    return { problemId: problemId, gates: [], outputs: [], nextId: 1 };
  }
  function draftProblem(draft) {
    if (draft.problemId === '__prologue__')
      return { id: '__prologue__', nIn: draft.nIn, nOut: draft.nOut, inNames: draft.inNames, outNames: draft.outNames };
    return problemById(draft.problemId);
  }
  function srcKey(s) {
    if (!s) return null;
    return s.k === 'c' ? 'c' + s.v : (s.k === 'i' ? 'i' + s.idx : 'g' + s.id);
  }
  function srcEquals(a, b) {
    if (!a || !b) return a === b;
    return srcKey(a) === srcKey(b);
  }
  function gateById(draft, id) {
    for (var i = 0; i < draft.gates.length; i++) if (draft.gates[i].id === id) return draft.gates[i];
    return null;
  }
  function gateUsesOutput(draft, gateId) {
    return draft.outputs.some(function (s) { return s && s.k === 'g' && s.id === gateId; });
  }
  function gateDependsOn(draft, gateId, targetId) {
    // gateId 是否（传递）依赖 targetId 的输出
    var seen = {}, stack = [gateId];
    while (stack.length) {
      var cur = stack.pop();
      if (seen[cur]) continue;
      seen[cur] = true;
      var g = gateById(draft, cur);
      if (!g) continue;
      [g.in0, g.in1].forEach(function (s) {
        if (s && s.k === 'g') {
          if (s.id === targetId) { stack.length = 0; seen.__hit = true; return; }
          stack.push(s.id);
        }
      });
    }
    return !!seen.__hit;
  }
  function addGate(draft, op, x, y) {
    var g = { id: draft.nextId++, op: op || 0, x: x || 0, y: y || 0, in0: null, in1: null };
    draft.gates.push(g);
    return g;
  }
  function removeGate(draft, gateId) {
    draft.gates = draft.gates.filter(function (g) { return g.id !== gateId; });
    draft.gates.forEach(function (g) {
      if (g.in0 && g.in0.k === 'g' && g.in0.id === gateId) g.in0 = null;
      if (g.in1 && g.in1.k === 'g' && g.in1.id === gateId) g.in1 = null;
    });
    draft.outputs = draft.outputs.map(function (s) {
      return (s && s.k === 'g' && s.id === gateId) ? null : s;
    });
  }
  // dest：{k:'gate', id, pin:0|1} | {k:'output', idx}
  // 返回 {ok:true} 或 {ok:false, reason}
  function connect(draft, src, dest) {
    if (!src) return { ok: false, reason: '先选一个信号源（输入脚、常量或门输出）' };
    if (dest.k === 'gate') {
      var g = gateById(draft, dest.id);
      if (!g) return { ok: false, reason: '目标门不存在' };
      if (g.op === 1 && dest.pin === 1) return { ok: false, reason: 'LATCH 只有一个输入' };
      if (src.k === 'g' && src.id === dest.id) return { ok: false, reason: '不能把门输出接回自己' };
      if (src.k === 'g' && gateDependsOn(draft, src.id, dest.id))
        return { ok: false, reason: '这样会形成环路：组合电路里信号只能向前流' };
      if (src.k === 'g' && gateUsesOutput(draft, src.id))
        return { ok: false, reason: '这个门的输出已经接了输出脚（输出脚是终点，不能再分给别的门）' };
      if (dest.pin === 0) g.in0 = src; else g.in1 = src;
      return { ok: true };
    }
    if (dest.k === 'output') {
      var prob = draftProblem(draft);
      if (dest.idx < 0 || dest.idx >= prob.nOut) return { ok: false, reason: '输出脚不存在' };
      if (src.k !== 'g') return { ok: false, reason: '输出脚只能接门的输出（直接连输入不算电路）' };
      var sg = gateById(draft, src.id);
      if (!sg) return { ok: false, reason: '信号源门不存在' };
      if (gateUsesOutput(draft, src.id))
        return { ok: false, reason: '这个门已经接了一个输出脚，一个门只能接一个输出脚' };
      // 该门若已接给别的门当输入，就不能再当输出脚（输出门必须是终点）
      var usedElsewhere = draft.gates.some(function (gg) {
        return (gg.in0 && gg.in0.k === 'g' && gg.in0.id === src.id) ||
          (gg.in1 && gg.in1.k === 'g' && gg.in1.id === src.id);
      });
      if (usedElsewhere) return { ok: false, reason: '这个门的输出已经接给别的门了，输出脚必须是终点' };
      draft.outputs[dest.idx] = src;
      return { ok: true };
    }
    return { ok: false, reason: '未知的连接目标' };
  }
  function disconnect(draft, dest) {
    if (dest.k === 'gate') {
      var g = gateById(draft, dest.id);
      if (!g) return;
      if (dest.pin === 0) g.in0 = null; else g.in1 = null;
    } else if (dest.k === 'output') {
      draft.outputs[dest.idx] = null;
    }
  }
  function draftMissing(draft) {
    var prob = draftProblem(draft), miss = [];
    draft.gates.forEach(function (g) {
      if (!g.in0) miss.push('门 #' + g.id + ' 的输入 1 没接');
      if (g.op === 0 && !g.in1) miss.push('门 #' + g.id + ' 的输入 2 没接');
    });
    for (var i = 0; i < prob.nOut; i++) {
      if (!draft.outputs[i]) miss.push('输出脚 ' + prob.outNames[i] + ' 没接');
    }
    return miss;
  }
  /* 拓扑排序：输出门（终点）强制排最后，保证 tapnet“输出=最后 nOut 个信号”。 */
  function topoOrder(draft) {
    var gates = draft.gates;
    var outIndex = {}; // gateId -> 输出脚序号（undefined 表示不是输出门）
    draft.outputs.forEach(function (s, i) { if (s && s.k === 'g') outIndex[s.id] = i; });
    var indeg = {}, adj = {};
    gates.forEach(function (g) { indeg[g.id] = 0; adj[g.id] = []; });
    gates.forEach(function (g) {
      [g.in0, g.in1].forEach(function (s) {
        if (s && s.k === 'g' && gateById(draft, s.id)) {
          adj[s.id].push(g.id);
          indeg[g.id]++;
        }
      });
    });
    var ready = gates.filter(function (g) { return indeg[g.id] === 0; }).map(function (g) { return g.id; });
    var order = [];
    while (ready.length) {
      // 优先取非输出门；只剩输出门时按输出脚序号取
      var idx = -1, bestOut = Infinity;
      for (var i = 0; i < ready.length; i++) {
        var oi = (outIndex[ready[i]] === undefined) ? -1 : outIndex[ready[i]];
        if (oi < 0) { idx = i; break; }
        if (oi < bestOut) { bestOut = oi; idx = i; }
      }
      var id = ready.splice(idx, 1)[0];
      order.push(id);
      adj[id].forEach(function (nx) {
        if (--indeg[nx] === 0) ready.push(nx);
      });
    }
    if (order.length !== gates.length) return { ok: false, reason: '电路里有环路，排不出顺序' };
    return { ok: true, order: order };
  }
  function u24beInto(buf, p, v) {
    buf[p] = (v >> 16) & 0xff; buf[p + 1] = (v >> 8) & 0xff; buf[p + 2] = v & 0xff;
  }
  /* 把草稿序列化成 tapnet/1 字节。返回 {ok, bytes, circuit, sigOf} 或 {ok:false, reason}。
   * 仿真用 TapeSim.parseTapnet + peek，和 v1 同一套真仿真。 */
  function compileDraft(draft) {
    var prob = draftProblem(draft);
    var miss = draftMissing(draft);
    if (miss.length) return { ok: false, reason: '还没接完：' + miss[0] + (miss.length > 1 ? '（等 ' + miss.length + ' 处）' : '') };
    var topo = topoOrder(draft);
    if (!topo.ok) return { ok: false, reason: topo.reason };
    var order = topo.order;
    var sigOf = {};
    order.forEach(function (id, i) { sigOf[id] = 2 + prob.nIn + i; });
    function sigOfSrc(s) {
      if (s.k === 'c') return s.v ? 1 : 0;
      if (s.k === 'i') return 2 + s.idx;
      return sigOf[s.id];
    }
    // 先算总长度：头 16 + 每门（NAND 7 / LATCH 4）
    var total = 16;
    order.forEach(function (id) { total += gateById(draft, id).op === 1 ? 4 : 7; });
    var bytes = new Uint8Array(total);
    bytes[0] = 0x54; bytes[1] = 0x41; bytes[2] = 0x50; bytes[3] = 0x4e;
    bytes[4] = 0x45; bytes[5] = 0x54; bytes[6] = 0x01; bytes[7] = 0x00;
    bytes[8] = 0; bytes[9] = 0; bytes[10] = 0; bytes[11] = prob.nIn;
    bytes[12] = 0; bytes[13] = 0; bytes[14] = 0; bytes[15] = prob.nOut;
    var p = 16;
    order.forEach(function (id) {
      var g = gateById(draft, id);
      if (g.op === 1) {
        bytes[p++] = 0x01;
        u24beInto(bytes, p, sigOfSrc(g.in0)); p += 3;
      } else {
        bytes[p++] = 0x00;
        u24beInto(bytes, p, sigOfSrc(g.in0)); p += 3;
        u24beInto(bytes, p, sigOfSrc(g.in1)); p += 3;
      }
    });
    var circuit;
    try { circuit = T.parseTapnet(bytes); }
    catch (e) { return { ok: false, reason: '序列化后解析失败（不该发生）: ' + e.message }; }
    // 输出脚必须对应最后 nOut 个门信号，且按脚序排列
    var outSig = [];
    for (var i = 0; i < prob.nOut; i++) outSig.push(sigOf[draft.outputs[i].id]);
    var lastSigs = [];
    for (var j = circuit.nSignals - prob.nOut; j < circuit.nSignals; j++) lastSigs.push(j);
    if (outSig.join(',') !== lastSigs.join(','))
      return { ok: false, reason: '输出门排布异常（不该发生），请重建草稿' };
    return { ok: true, bytes: bytes, circuit: circuit, sigOf: sigOf, order: order };
  }
  function evaluateCompiled(compiled, inputs) {
    var r = T.peek(compiled.circuit, new Array(compiled.circuit.nState).fill(0), inputs);
    return { signals: r.signals, outputs: r.outputs };
  }
  /* 验货：跑完整真值表。返回 {total, passed, failures:[{inputs, expected, actual}]}。
   * 4 位加法器全验 512 行（展示时只列抽查行，见 sampleInputRows）。 */
  function verifyTruthTable(draft) {
    var prob = draftProblem(draft);
    var comp = compileDraft(draft);
    if (!comp.ok) return { ok: false, reason: comp.reason };
    var rows = allInputRows(prob.nIn);
    var failures = [];
    rows.forEach(function (inp) {
      var actual = evaluateCompiled(comp, inp).outputs;
      var expected = prob.truth(inp);
      if (!outputsMatch(actual, expected)) failures.push({ inputs: inp, expected: expected, actual: actual });
    });
    return { ok: true, total: rows.length, passed: rows.length - failures.length, failures: failures };
  }

  /* ================= 流片（第二章） ================= */
  // 流片 = 把验货通过的草稿烧成一张游戏内电路卡。卡面 SHA-256 是该电路
  // tapnet 字节的真哈希（TapeSim.sha256Hex），门数/脚数来自解析结果。
  function tapeOutCard(draft, day) {
    var prob = draftProblem(draft);
    var comp = compileDraft(draft);
    if (!comp.ok) return { ok: false, reason: comp.reason };
    var sha = '0x' + T.sha256Hex(comp.bytes);
    return {
      ok: true,
      card: {
        id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        name: prob.name, problemId: prob.id,
        gates: comp.circuit.nNand + comp.circuit.nLatch,
        nand: comp.circuit.nNand, latch: comp.circuit.nLatch,
        nIn: prob.nIn, nOut: prob.nOut,
        sha: sha, day: day,
        stars: starFor(comp.circuit.nNand + comp.circuit.nLatch, prob.par, prob.limit)
      }
    };
  }

  /* ================= 挖矿（第三章） ================= */
  // 真实规则：权重 = 消耗的 NAND+LATCH 数 × 处理器系数（Behemoth ×6、TapeOut ×1），
  // 每天产出 = 你的权重 / 全网权重 × 7,200。门槛是游戏设定，已在界面写明。
  var DAILY_BEM = 7200;
  var PROCESSORS = {
    behemoth: { id: 'behemoth', name: 'Behemoth', coeff: 6, minGates: 20,
      note: '官方权重 ×6 的处理器。游戏规则：只接受 20 门以上的电路（真实规则只有系数，门槛是游戏设定）。' },
    tapeout: { id: 'tapeout', name: 'TapeOut', coeff: 1, minGates: 0,
      note: '官方权重 ×1 的处理器，任何电路都能入驻。' }
  };
  function minerWeight(card, procId) {
    return (card.nand + card.latch) * PROCESSORS[procId].coeff;
  }
  function dailyOutput(weight, totalWeight) {
    if (!totalWeight || totalWeight <= 0) return 0;
    return weight / totalWeight * DAILY_BEM;
  }
  // 结算一天：游戏时钟 +1 天，全网权重模拟增长 0.5%（其他矿工在加入），
  // 每台矿机按公式产游戏 BEM。返回结算明细（界面照实展示）。
  function settleDay(save) {
    save.day += 1;
    save.totalWeight = Math.round(save.totalWeight * 1.005);
    var total = 0, lines = [];
    save.miners.forEach(function (m) {
      var card = null;
      for (var i = 0; i < save.taped.length; i++) if (save.taped[i].id === m.cardId) card = save.taped[i];
      if (!card) return;
      var w = minerWeight(card, m.processor);
      var out = dailyOutput(w, save.totalWeight);
      total += out;
      lines.push({ cardName: card.name, processor: PROCESSORS[m.processor].name, weight: w, out: out });
    });
    save.bem += total;
    save.minedTotal = (save.minedTotal || 0) + total;
    // 第五章：开的处理器收流片费（每位来流片的设计师平均烧 10 个 NAND）
    var factoryTotal = 0;
    save.processors.forEach(function (p) {
      var n = processorArrivals(p.name, save.day);
      var rev = n * p.price * 10;
      p.tapeouts += n; p.earned += rev; factoryTotal += rev;
      if (n > 0) lines.push({ cardName: '🏭 ' + p.name, processor: '来流片 ' + n + ' 位设计师', out: rev });
    });
    save.bem += factoryTotal;
    // 已毕业的币：矿机同时挖你的币（当日矿机 BEM 产量的 10%）
    var tokenGain = 0;
    save.tokens.forEach(function (t) {
      if (t.graduated) { t.balance += total * TOKEN_MINE_SHARE; tokenGain += total * TOKEN_MINE_SHARE; }
    });
    // 结算账本（第 13 轮）：每天一行，只留最近 7 天——收入看得见，才知道哪条路在赚钱
    save.ledger = save.ledger || [];
    save.ledger.push({ day: save.day, mine: total, factory: factoryTotal, token: tokenGain, bem: save.bem });
    while (save.ledger.length > 7) save.ledger.shift();
    return { day: save.day, total: total, factoryTotal: factoryTotal, tokenGain: tokenGain, totalWeight: save.totalWeight, lines: lines };
  }

  /* ================= 第五章：开厂与发币（P2 起步） ================= */
  // 真实规则原样保留：X Layer 389 台处理器、111 台 0 产出（2026-10-23 真实统计）；
  // 开处理器真实约 0.0066 OKB，游戏里收 5 游戏 BEM（界面写明换算关系）。
  // 客流是确定性的：同一名字同一天永远同一结果（SHA-256 首位 hex % 4 → 0–3 位），
  // 回归可断言，不引入 Math.random（settleDay 的确定性不被打破）。
  var FACTORY_OPEN_COST_BEM = 5;
  var FACTORY_PRICES = [0.01, 0.02, 0.05]; // 每 NAND 的晶体管价（游戏 BEM）
  var TOKEN_MINT_COST_BEM = 1;
  var TOKEN_GRADUATE_COST_BEM = 5; // 毕业锁 5 游戏 BEM 做流动性
  var TOKEN_GRADUATE_MIN_AGE = 2; // 开币满 2 天才能毕业
  var TOKEN_MINE_SHARE = 0.1; // 毕业后矿机同时挖你的币：当日矿机 BEM 产量的 10%
  function processorArrivals(name, day) {
    var h = T.sha256Hex(new TextEncoder().encode(name + '|' + day));
    return parseInt(h[0], 16) % 4;
  }
  function openProcessor(save, name, price) {
    if (!name || name.length > 20) return { ok: false, reason: '处理器名字 1–20 字' };
    var dup = false;
    save.processors.forEach(function (p) { if (p.name === name) dup = true; });
    if (dup) return { ok: false, reason: '已有一台同名处理器' };
    if (FACTORY_PRICES.indexOf(price) < 0) return { ok: false, reason: '定价只能选 0.01 / 0.02 / 0.05 游戏 BEM 每 NAND' };
    if (save.bem < FACTORY_OPEN_COST_BEM) return { ok: false, reason: '开处理器要 5 游戏 BEM，你只有 ' + save.bem.toFixed(2) };
    save.bem -= FACTORY_OPEN_COST_BEM;
    save.processors.push({ name: name, price: price, dayOpened: save.day, tapeouts: 0, earned: 0 });
    return { ok: true };
  }
  function tokenByName(save, name) {
    var found = null;
    save.tokens.forEach(function (t) { if (t.name === name) found = t; });
    return found;
  }
  function launchToken(save, name) {
    if (!name || name.length > 20) return { ok: false, reason: '币名 1–20 字' };
    if (tokenByName(save, name)) return { ok: false, reason: '已发过同名币' };
    if (save.bem < TOKEN_MINT_COST_BEM) return { ok: false, reason: 'mint 晶体管要 1 游戏 BEM，你只有 ' + save.bem.toFixed(2) };
    save.bem -= TOKEN_MINT_COST_BEM;
    var sym = name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'CHIP';
    save.tokens.push({ name: name, symbol: sym, mintedDay: save.day, graduated: false, locked: 0, balance: 0 });
    return { ok: true, symbol: sym };
  }
  function graduateToken(save, name) {
    var t = tokenByName(save, name);
    if (!t) return { ok: false, reason: '没这个币' };
    if (t.graduated) return { ok: false, reason: '已经毕业了' };
    if (save.day - t.mintedDay < TOKEN_GRADUATE_MIN_AGE) return { ok: false, reason: '开币才 ' + (save.day - t.mintedDay) + ' 天，满 2 天才能毕业' };
    if (save.bem < TOKEN_GRADUATE_COST_BEM) return { ok: false, reason: '毕业要锁 5 游戏 BEM 做流动性，你只有 ' + save.bem.toFixed(2) };
    save.bem -= TOKEN_GRADUATE_COST_BEM;
    t.graduated = true; t.locked = TOKEN_GRADUATE_COST_BEM;
    return { ok: true };
  }

  /* ================= 终章：4 位二进制计数器（真 tapnet 电路） ================= */
  // 一台 4 位 CPU 的“心跳”：用 NAND + LATCH 搭的真计数器，0 输入、4 输出
  // （q0 是最低位）。25 NAND + 4 LATCH = 29 门，走同一套 TapeSim 解析 + peek/beat
  // 真仿真，不做假仿真。记录顺序：4 个 LATCH 在前（d 前向引用后面的 NAND 信号，
  // 解析器允许 LATCH 前向引用），25 个 NAND 在后，末尾 8 个是复制缓冲——
  // 最后 4 个门输出 c0..c3 恰好是最后 4 个信号 = 输出脚。
  // d0 = NOT q0；d1 = q1 XOR q0；d2 = q2 XOR (q0 AND q1)；d3 = q3 XOR (q0 AND q1 AND q2)。
  function buildCounterCircuit() {
    var recs = [];
    function L(d) { recs.push([1, d]); }
    function N(a, b) { recs.push([0, a, b]); }
    // NAND 输出信号号（按记录顺序）：6 NOT q0；7-10 xor1；11-12 and01；13-16 xor2；
    // 17-18 and012；19-22 xor3；23-26 b0..b3；27-30 c0..c3
    L(6); L(10); L(16); L(22);
    N(2, 2);
    N(3, 2); N(3, 7); N(2, 7); N(8, 9);
    N(2, 3); N(11, 11);
    N(4, 12); N(4, 13); N(12, 13); N(14, 15);
    N(12, 4); N(17, 17);
    N(5, 18); N(5, 19); N(18, 19); N(20, 21);
    N(2, 2); N(3, 3); N(4, 4); N(5, 5);
    N(23, 23); N(24, 24); N(25, 25); N(26, 26);
    var total = 16;
    recs.forEach(function (r) { total += r[0] === 1 ? 4 : 7; });
    var bytes = new Uint8Array(total);
    bytes[0] = 0x54; bytes[1] = 0x41; bytes[2] = 0x50; bytes[3] = 0x4e;
    bytes[4] = 0x45; bytes[5] = 0x54; bytes[6] = 0x01; bytes[7] = 0x00;
    bytes[11] = 0; bytes[15] = 4; // nIn = 0，nOut = 4
    var p = 16;
    recs.forEach(function (r) {
      bytes[p++] = r[0];
      for (var i = 1; i < r.length; i++) { u24beInto(bytes, p, r[i]); p += 3; }
    });
    var circuit;
    try { circuit = T.parseTapnet(bytes); }
    catch (e) { return { ok: false, reason: '计数器电路解析失败（不该发生）: ' + e.message }; }
    return { ok: true, bytes: bytes, circuit: circuit, sha: '0x' + T.sha256Hex(bytes) };
  }
  // outputs 是 LSB-first（outputs[0] = q0 最低位）→ 十进制计数值
  function counterValue(outputs) {
    var v = 0;
    for (var i = outputs.length - 1; i >= 0; i--) v = v * 2 + (outputs[i] ? 1 : 0);
    return v;
  }

  /* ================= 终章·其二：康威生命游戏（真 tapnet 电路） ================= */
  // 概念原文终章：“先是计数器，再是康威生命游戏。”生命游戏也是一台真电路：
  // 4×4 环面（上下左右都连通），16 格每格一个 LATCH 存活/死；下一代由 8 个邻居
  // 的 NAND 加法树算出来（3 邻居出生、2 邻居存活）。1,600 NAND + 16 LATCH，
  // 0 入 16 出，输出脚是 16 格状态的复制。生成器先占位 LATCH 再回填 d，
  // 复制链分两批写（先 16 个 NOT 再 16 个 NOT），保证最后 16 个信号恰好是输出脚。
  var LIFE_N = 4, LIFE_CELLS = 16;
  function lifeIndex(r, c, n) {
    n = n || LIFE_N;
    return ((r + n) % n) * n + ((c + n) % n);
  }
  function lifeNeighbors(i, n) {
    n = n || LIFE_N;
    var r = Math.floor(i / n), c = i % n, out = [];
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      out.push(lifeIndex(r + dr, c + dc, n));
    }
    return out;
  }
  var LIFE_PRESETS = {
    blinker: { name: '闪烁器', cells: [5, 6, 7], note: '横三格 → 竖三格，2 代一循环' },
    block: { name: '方块', cells: [5, 6, 9, 10], note: '2×2 方块，永远不变' },
    glider: { name: '滑翔机', cells: [1, 6, 8, 9, 10], note: '5 格小飞机，在环面上一直飞' }
  };
  var LIFE_PRESETS_6 = {
    blinker: { name: '闪烁器', cells: [14, 15, 16], note: '横三格 → 竖三格，2 代一循环' },
    block: { name: '方块', cells: [14, 15, 20, 21], note: '2×2 方块，永远不变' },
    glider: { name: '滑翔机', cells: [8, 15, 19, 20, 21], note: '5 格小飞机，在环面上一直飞' },
    lwss: { name: '轻型飞船', cells: [7, 10, 17, 19, 23, 26, 27, 28, 29], note: '9 格飞船；6×6 环面太小，它会撞上自己的尾迹——电路仍按规则真算' }
  };
  function buildLifeCircuit(size) {
    size = size || LIFE_N;
    var cells = size * size;
    var recs = [];
    var nextSig = 2 + cells;
    function N(a, b) { recs.push([0, a, b]); return nextSig++; }
    function NOT(a) { return N(a, a); }
    function AND(a, b) { return NOT(N(a, b)); }
    function OR(a, b) { return N(NOT(a), NOT(b)); }
    function XOR(a, b) { var t = N(a, b); return N(N(a, t), N(b, t)); }
    function HA(a, b) { return { s: XOR(a, b), c: AND(a, b) }; }
    function FA(a, b, cin) {
      var x = XOR(a, b);
      return { s: XOR(x, cin), c: OR(AND(a, b), AND(cin, x)) };
    }
    var latchIdx = [];
    for (var i = 0; i < cells; i++) { latchIdx.push(recs.length); recs.push([1, 0]); }
    function cellNext(i) {
      var nb = lifeNeighbors(i, size).map(function (j) { return 2 + j; });
      var alive = 2 + i;
      var f1 = FA(nb[0], nb[1], nb[2]);
      var f2 = FA(nb[3], nb[4], nb[5]);
      var h1 = HA(nb[6], nb[7]);
      var f3 = FA(f1.s, f2.s, h1.s);
      var f4 = FA(f1.c, f2.c, h1.c);
      var h2 = HA(f3.c, f4.s);
      var b0 = f3.s, b1 = h2.s, b2 = XOR(f4.c, h2.c), b3 = AND(f4.c, h2.c);
      var nb2 = NOT(b2), nb3 = NOT(b3), nb0 = NOT(b0);
      var eq3 = AND(AND(b0, b1), AND(nb2, nb3));
      var eq2 = AND(AND(nb0, b1), AND(nb2, nb3));
      return OR(eq3, AND(alive, eq2));
    }
    var nexts = [];
    for (var k = 0; k < cells; k++) nexts.push(cellNext(k));
    nexts.forEach(function (d, i) { recs[latchIdx[i]][1] = d; });
    var bs = [];
    for (var m = 0; m < cells; m++) bs.push(NOT(2 + m));
    bs.forEach(function (b) { NOT(b); });
    var total = 16;
    recs.forEach(function (r) { total += r[0] === 1 ? 4 : 7; });
    var bytes = new Uint8Array(total);
    bytes[0] = 0x54; bytes[1] = 0x41; bytes[2] = 0x50; bytes[3] = 0x4e;
    bytes[4] = 0x45; bytes[5] = 0x54; bytes[6] = 0x01; bytes[7] = 0x00;
    bytes[11] = 0; bytes[15] = cells; // nIn = 0，nOut = 格数
    var p = 16;
    recs.forEach(function (r) {
      bytes[p++] = r[0];
      for (var j = 1; j < r.length; j++) { u24beInto(bytes, p, r[j]); p += 3; }
    });
    var circuit;
    try { circuit = T.parseTapnet(bytes); }
    catch (e) { return { ok: false, reason: '生命游戏电路解析失败（不该发生）: ' + e.message }; }
    return { ok: true, bytes: bytes, circuit: circuit, sha: '0x' + T.sha256Hex(bytes) };
  }

  /* ================= 集市（第四章，P1） ================= */
  // BEM 在这里变成选择权：买零件（新处理器的晶体管只收 BEM，真实规则）、
  // 开 DeWEB 网站（tape:// 地址）、买 TapeRelay 超额存储（真实价 2 GiB/90 天 = 0.2 BEM）、
  // 参加 tapeXO 可验证抽奖（真实流程：名单哈希上链 → 种子承诺 → 区块哈希开奖）。
  // 全部是游戏 BEM（游戏币，不是真实 BEM），不连钱包、不花真钱。
  var MARKET_ITEMS = [
    { id: 'nand10', name: '10 个 NAND 晶体管', cost: 1, nand: 10, latch: 0 },
    { id: 'nand50', name: '50 个 NAND 晶体管', cost: 4, nand: 50, latch: 0 },
    { id: 'latch5', name: '5 个 LATCH 晶体管', cost: 1, nand: 0, latch: 5 },
    { id: 'latch20', name: '20 个 LATCH 晶体管', cost: 3, nand: 0, latch: 20 }
  ];
  var SITE_COST_BEM = 2;          // 开一家 DeWEB 网站：2 游戏 BEM（游戏设定）
  var RELAY_FREE_GIB = 5;         // TapeRelay 免费额度：每电路每节点 5 GiB（真实规则）
  var RELAY_EXTRA_GIB = 2;        // 每次加购 2 GiB
  var RELAY_EXTRA_COST_BEM = 0.2; // 真实价：2 GiB / 90 天 = 0.2 BEM
  var LOTTERY_PRIZE_BEM = 2;      // 抽奖亭中奖：+2 游戏 BEM（游戏设定）
  var LOTTERY_NPCS = ['小矿工阿杰', '电路猎手 Mia', 'Behemoth 粉', '造芯学徒', 'TapeUp 老张', '0x7a3f…c21e', '0xBEEF…09aa'];
  function marketItemById(id) {
    for (var i = 0; i < MARKET_ITEMS.length; i++) if (MARKET_ITEMS[i].id === id) return MARKET_ITEMS[i];
    return null;
  }
  function buyParts(save, itemId) {
    var item = marketItemById(itemId);
    if (!item) return { ok: false, reason: '没有这个商品' };
    if (save.bem < item.cost) return { ok: false, reason: '游戏 BEM 不够：要 ' + item.cost + '，你只有 ' + save.bem.toFixed(2) };
    save.bem -= item.cost;
    save.nand += item.nand;
    save.latch += item.latch;
    return { ok: true, item: item };
  }
  function siteSlug(name) {
    var s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'mysite';
  }
  function openSite(save, name) {
    name = String(name || '').trim();
    if (!name) return { ok: false, reason: '先给你的网站起个名字' };
    if (name.length > 20) return { ok: false, reason: '名字太长了，20 个字以内' };
    if (save.bem < SITE_COST_BEM) return { ok: false, reason: '游戏 BEM 不够：开网站要 ' + SITE_COST_BEM + '，你只有 ' + save.bem.toFixed(2) };
    var slug = siteSlug(name);
    var dup = save.sites.some(function (s) { return s.slug === slug; });
    if (dup) return { ok: false, reason: '这个名字已经开过一家店了，换个名字' };
    save.bem -= SITE_COST_BEM;
    var site = { name: name, slug: slug, addr: 'tape://' + slug + '.factory', day: save.day };
    save.sites.push(site);
    return { ok: true, site: site };
  }
  function relayBuyStorage(save) {
    if (save.bem < RELAY_EXTRA_COST_BEM) return { ok: false, reason: '游戏 BEM 不够：加 2 GiB 要 ' + RELAY_EXTRA_COST_BEM + '，你只有 ' + save.bem.toFixed(2) };
    save.bem -= RELAY_EXTRA_COST_BEM;
    save.relayGiB += RELAY_EXTRA_GIB;
    return { ok: true, totalGiB: RELAY_FREE_GIB + save.relayGiB };
  }
  // 加密消息“外观演示”：真实 TapeRelay 是端到端加密，这里只演示样子——
  // 明文经简单位移变成密文，并给出 SHA-256 指纹。界面必须标注“演示”。
  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    var out = [];
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }
  function relayEncryptDemo(text) {
    text = String(text || '');
    var cipher = '';
    for (var i = 0; i < text.length; i++) {
      var c = (text.charCodeAt(i) ^ 0x5a) & 0xff;
      cipher += (c < 16 ? '0' : '') + c.toString(16);
    }
    return { cipher: cipher, fingerprint: '0x' + T.sha256Hex(utf8Bytes(text)) };
  }
  // tapeXO 抽奖：名单哈希上链 → 种子承诺 → 揭示种子 → 区块哈希开奖。
  // winnerIndex = sha256(种子 + '|' + 名单) 前 8 位 hex % 人数，可重算验证。
  function lotteryParticipants() { return ['你'].concat(LOTTERY_NPCS); }
  function lotteryDraw(participants, seed) {
    var h = T.sha256Hex(utf8Bytes(String(seed) + '|' + participants.join(',')));
    var n = parseInt(h.slice(0, 8), 16);
    return { winnerIndex: n % participants.length, winner: participants[n % participants.length], hash: '0x' + h };
  }
  function lotteryEnter(save) {
    if (save.lottery.day === save.day) return { ok: false, reason: '今天已经参加过抽奖了，明天再来（每天限 1 次）' };
    var parts = lotteryParticipants();
    var seed = 'tapeXO-day-' + save.day + '-block-' + (100000 + save.day * 137);
    var listHash = '0x' + T.sha256Hex(utf8Bytes(parts.join(',')));
    var seedHash = '0x' + T.sha256Hex(utf8Bytes(seed));
    var draw = lotteryDraw(parts, seed);
    var won = draw.winnerIndex === 0;
    if (won) save.bem += LOTTERY_PRIZE_BEM;
    save.lottery = { day: save.day, entered: true, seed: seed, listHash: listHash, seedHash: seedHash,
      drawHash: draw.hash, winner: draw.winner, won: won };
    return { ok: true, won: won, winner: draw.winner, prize: won ? LOTTERY_PRIZE_BEM : 0,
      listHash: listHash, seedHash: seedHash, drawHash: draw.hash, participants: parts.length };
  }
  /* ================= 引导与里程碑（第 3 轮：学 Opus Magnum 与放置类） ================= */
  // Opus Magnum：指标即时可见，机器本身就是展品；放置类：节奏不能有沙漠——
  // 玩家永远看得见下一个门槛。nextStep() 按进度只给一句话；milestones() 是 8 个
  // 可见的里程碑，全部是生态真实步骤（不是凑数的成就）。
  function nextStep(save) {
    if (!save.visited.prologue) return { target: 'prologue', text: t('next.prologue') };
    if (Object.keys(save.passed).length === 0) return { target: 'ch1', text: t('next.ch1') };
    if (save.taped.length === 0) return { target: 'tapeout', text: t('next.tapeout') };
    if (save.miners.length === 0) return { target: 'mining', text: t('next.mining') };
    if (save.day === 0) return { target: 'mining', text: t('next.miningSettle') };
    if (!save.visited.market) return { target: 'market', text: t('next.market') };
    if (!save.cpu.lit) return { target: 'cpu', text: t('next.cpu') };
    if (save.processors.length === 0) return { target: 'factory', text: t('next.factory') };
    if (!save.visited.test1) return { target: 'test1', text: t('next.test1') };
    return { target: 'codex', text: t('next.done') };
  }
  function milestones(save) {
    return [
      { id: 'm-prologue', name: t('ms.prologue'), done: Object.keys(save.prologueDone).length >= 4 },
      { id: 'm-first-pass', name: t('ms.firstPass'), done: Object.keys(save.passed).length > 0 },
      { id: 'm-first-tape', name: t('ms.firstTape'), done: save.taped.length > 0 },
      { id: 'm-first-miner', name: t('ms.firstMiner'), done: save.miners.length > 0 },
      { id: 'm-first-bem', name: t('ms.firstBem'), done: (save.minedTotal || 0) > 0 },
      { id: 'm-first-site', name: t('ms.firstSite'), done: save.sites.length > 0 },
      { id: 'm-first-lottery', name: t('ms.firstLottery'), done: !!save.lottery.entered },
      { id: 'm-cpu-lit', name: t('ms.cpuLit'), done: !!save.cpu.lit },
      { id: 'm-first-factory', name: t('ms.firstFactory'), done: save.processors.length > 0 },
      { id: 'm-first-token', name: t('ms.firstToken'), done: save.tokens.length > 0 }
    ];
  }

  function marketUnlocked(save) { return save.taped.length > 0; }
  function cpuUnlocked(save) { return save.taped.length > 0; }

  /* ================= 存档 ================= */
  var SAVE_KEY = 'tapecode-factory-v1';
  var MEM = {};
  function defaultSave() {
    return {
      v: 1, nand: 200, latch: 20, bem: 0, day: 0, totalWeight: 100000,
      stars: {}, passed: {}, taped: [], miners: [],
      codex: [], visited: {}, prologueDone: {}, drafts: {},
      sites: [], relayGiB: 0, lottery: { day: -1, entered: false, winner: '', won: false, seed: '' },
      cpu: { powered: false, clock: 0, count: 0, best: 0, lit: false,
        life: { gen: 0, size: 4, cells: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
      processors: [], minedTotal: 0, tokens: [], ledger: [], sound: true
    };
  }
  function loadSave() {
    try {
      var raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(SAVE_KEY) : MEM.__save;
      if (!raw) return defaultSave();
      var s = JSON.parse(raw);
      var d = defaultSave();
      Object.keys(d).forEach(function (k) { if (s[k] !== undefined) d[k] = s[k]; });
      return d;
    } catch (e) { return defaultSave(); }
  }
  function storeSave(save) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      else MEM.__save = JSON.stringify(save);
    } catch (e) {}
  }
  function totalStars(save) {
    var n = 0;
    Object.keys(save.stars).forEach(function (k) { n += save.stars[k]; });
    return n;
  }
  // 总账（第 25 轮，Zachtronics 式“你的解 vs 标准解”）：标准解总门数 = 各题 par 之和；
  // 你的最佳总门数 = 每道已通过题的最佳门数之和。
  function parTotal() {
    return PROBLEMS.reduce(function (a, p) { return a + p.par; }, 0);
  }
  function bestGatesTotal(save) {
    var n = 0, done = 0;
    PROBLEMS.forEach(function (p) { if (save.passed[p.id]) { n += save.passed[p.id].gates; done++; } });
    return { gates: n, done: done };
  }

  /* ================= 序章实验（预制电路，用同一套 compileDraft） ================= */
  // 每个实验 = 一个“题目外”的小草稿：nIn/nOut + 门表 + 输出接法。
  function prologueDraft(kind) {
    var d = { problemId: '__prologue__', gates: [], outputs: [], nextId: 1 };
    function g(op, in0, in1, x, y) {
      var gate = { id: d.nextId++, op: op, x: x, y: y, in0: in0, in1: in1 };
      d.gates.push(gate);
      return gate;
    }
    var I = function (i) { return { k: 'i', idx: i }; };
    var G = function (id) { return { k: 'g', id: id }; };
    if (kind === 'not') {
      // 1 个 NAND，两个输入都接 I0 → 输出 = NOT I0
      var n0 = g(0, I(0), I(0), 0, 0);
      d.outputs = [G(n0.id)];
      d.nIn = 1; d.nOut = 1; d.inNames = ['I0']; d.outNames = ['NOT I0'];
    } else if (kind === 'and') {
      // 与门 = NAND + NOT：g0=NAND(a,b)，g1=NAND(g0,g0)
      var a0 = g(0, I(0), I(1), 0, 0);
      var a1 = g(0, G(a0.id), G(a0.id), 0, 0);
      d.outputs = [G(a1.id)];
      d.nIn = 2; d.nOut = 1; d.inNames = ['a', 'b']; d.outNames = ['a 与 b'];
    } else if (kind === 'or') {
      // 或门 = NOT( NOT a AND NOT b )：g0=NOT a，g1=NOT b，g2=NAND(g0,g1)
      var o0 = g(0, I(0), I(0), 0, 0);
      var o1 = g(0, I(1), I(1), 0, 0);
      var o2 = g(0, G(o0.id), G(o1.id), 0, 0);
      d.outputs = [G(o2.id)];
      d.nIn = 2; d.nOut = 1; d.inNames = ['a', 'b']; d.outNames = ['a 或 b'];
    } else if (kind === 'latch') {
      // 1 个 LATCH：输出 = 上一拍记住的值；新状态 = 当前 d
      var l0 = g(1, I(0), null, 0, 0);
      d.outputs = [G(l0.id)];
      d.nIn = 1; d.nOut = 1; d.inNames = ['d']; d.outNames = ['记住的值 q'];
    }
    return d;
  }
  // 序章草稿走同一条 compileDraft（draftProblem 对 '__prologue__' 返回
  // 草稿自带的 nIn/nOut/inNames/outNames），不用另写序列化。

  /* ================= 第五章：处理器工厂（开厂与发币） ================= */
  function renderFactory() {
    var box = $('factory-panel');
    if (!SAVE.cpu.lit) {
      box.innerHTML = '<p class="hint">🔒 先点亮 CPU（神殿），再来开厂——老板要先懂芯片是怎么跑起来的。</p>';
      return;
    }
    var html = '<p class="hint">📊 真实统计（2026-10-23 快照）：X Layer 389 台处理器，111 台 0 产出。开厂费真实约 0.0066 OKB，游戏里收 5 游戏 BEM。每天来流片的设计师 0–3 位（由名字+天数确定，不随机），每位平均烧 10 个 NAND，按你定的价收钱。</p>' +
      '<p>你现在有 <b>' + SAVE.bem.toFixed(2) + ' 游戏 BEM</b> · 第 ' + SAVE.day + ' 天。</p>';
    // 开处理器
    html += '<div class="panel"><h3>🏭 开一台处理器</h3>' +
      '<p>名字：<input id="in-factory-name" type="text" maxlength="20" placeholder="如：阿杰的芯片厂" style="width:180px"> ' +
      '晶体管价：<select id="in-factory-price">' + FACTORY_PRICES.map(function (p) {
        return '<option value="' + p + '">' + p + ' 游戏 BEM / NAND</option>';
      }).join('') + '</select> ' +
      '<button class="btn-primary" id="btn-open-factory">开厂（5 游戏 BEM）</button></p>' +
      '<p class="hint" id="factory-open-msg"></p>';
    if (SAVE.processors.length === 0) {
      html += '<p class="hint">你还没开过处理器。定价越低来的设计师越多（但每单赚得少）——价格档只有三档，0.01 / 0.02 / 0.05。</p>';
    } else {
      html += '<ul>' + SAVE.processors.map(function (p) {
        var today = processorArrivals(p.name, SAVE.day);
        return '<li><b>' + esc(p.name) + '</b> · ' + p.price + ' 游戏 BEM/NAND · 第 ' + p.dayOpened + ' 天开张 · 累计接待流片 ' +
          p.tapeouts + ' 次 · 累计收入 ' + p.earned.toFixed(2) + ' 游戏 BEM · 今天预计来 ' + today + ' 位设计师</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
    // 发币三步
    html += '<div class="panel"><h3>🪙 发自己的币（TapeHub 三步）</h3>' +
      '<p>① mint 晶体管 → ② 毕业上流动性 → ③ 矿机慢慢挖自己的币。</p>' +
      '<p>币名：<input id="in-token-name" type="text" maxlength="20" placeholder="如：阿杰币" style="width:140px"> ' +
      '<button class="btn-primary" id="btn-mint-token">① mint（1 游戏 BEM）</button></p>' +
      '<p class="hint" id="token-msg"></p>';
    if (SAVE.tokens.length === 0) {
      html += '<p class="hint">你还没发过币。毕业要锁 5 游戏 BEM 做流动性，且开币满 2 天；毕业后矿机每天同时挖你的币（当日 BEM 产量的 10%）。</p>';
    } else {
      html += '<ul>' + SAVE.tokens.map(function (t) {
        var age = SAVE.day - t.mintedDay;
        var status = t.graduated
          ? '✅ 已毕业 · 锁了 ' + t.locked + ' 游戏 BEM 流动性 · 持有 ' + t.balance.toFixed(2) + ' ' + t.symbol
          : '⏳ 未毕业 · 开币 ' + age + ' 天（满 2 天可毕业）';
        return '<li><b>' + esc(t.name) + '</b>（' + t.symbol + '）· ' + status +
          (t.graduated ? '' : ' <button data-graduate="' + esc(t.name) + '">② 毕业（锁 5 游戏 BEM）</button>') + '</li>';
      }).join('') + '</ul>';
    }
    html += '</div>';
    box.innerHTML = html;
    $('btn-open-factory').onclick = function () {
      var name = $('in-factory-name').value.trim();
      var price = parseFloat($('in-factory-price').value);
      var r = openProcessor(SAVE, name, price);
      if (r.ok) {
        save(); renderFactory(); refreshHud();
        setStatus('✓ 处理器「' + name + '」开张了！每天等设计师来流片，结算时收钱。');
      } else {
        $('factory-open-msg').textContent = r.reason;
        setStatus('开不了厂：' + r.reason);
      }
    };
    $('btn-mint-token').onclick = function () {
      var name = $('in-token-name').value.trim();
      var r = launchToken(SAVE, name);
      if (r.ok) {
        save(); renderFactory(); refreshHud();
        setStatus('✓ ' + name + '（' + r.symbol + '）mint 成功！满 2 天 + 锁 5 游戏 BEM 就能毕业。');
      } else {
        $('token-msg').textContent = r.reason;
        setStatus('发不了币：' + r.reason);
      }
    };
    Array.prototype.forEach.call(box.querySelectorAll('[data-graduate]'), function (b) {
      b.onclick = function () {
        var r = graduateToken(SAVE, b.getAttribute('data-graduate'));
        if (r.ok) {
          save(); renderFactory(); refreshHud();
          setStatus('✓ 毕业了！矿机从今天起同时挖你的币（当日 BEM 产量的 10%）。');
        } else {
          $('token-msg').textContent = r.reason;
          setStatus('毕不了业：' + r.reason);
        }
      };
    });
    refreshHud();
  }

  /* ================= 图鉴（Codex） ================= */
  // 事实来源：research/ECOSYSTEM.md。状态：live 已实现 / alpha 测试中 / draft 草案 / unverified 未核实。
  var CODEX = [
    { id: 'nand', name: 'NAND（与非门）', status: 'live', source: 'TapeOut 协议 · TAP-02',
      what: '最基础的逻辑门，“函数完备”：只用 NAND 就能拼出任何布尔函数。1 枚 NAND 代币 = 1 个晶体管（7 字节）。',
      unlock: 'always' },
    { id: 'latch', name: 'LATCH（锁存器）', status: 'live', source: 'TapeOut 协议 · TAP-02',
      what: '保存 1 位状态，每拍（区块）更新一次。和 NAND 一起构成电路的全部零件——NAND 算，LATCH 记。',
      unlock: 'prologue' },
    { id: 'transistor', name: '晶体管', status: 'live', source: 'ECOSYSTEM §3.1',
      what: 'NAND / LATCH 的统称，都是 ERC-1155 代币，可以买卖。不同处理器的晶体管互不通用（Behemoth NAND 与 TapeOut NAND 是两种币）。',
      unlock: 'always' },
    { id: 'circuit', name: '电路 / 电路 NFT', status: 'live', source: 'TapeOut 协议',
      what: '零件按连线拼成的数字电路。流片后变成电路 NFT（ERC-721）：链上记录的是一份网表 + SHA-256，可转让、可交易，还能被别的电路当黑盒引用。',
      unlock: 'ch1' },
    { id: 'processor', name: '处理器', status: 'live', source: 'ECOSYSTEM §3.1',
      what: '一组电路的集合与运行环境。任何人都能开一个处理器（X Layer 上约 0.0066 OKB）；处理器有自己的晶体管定价。X Layer 到 2026-10-23 已有 389 台，但 111 台从未产出过电路。',
      unlock: 'mining' },
    { id: 'factory', name: '工厂', status: 'live', source: 'TECH_BRIEF §3',
      what: '部署处理器的合约。X Layer 工厂 0x1f09…0761（446 个处理器，未密封，2026-11-24 实测）；BNB 工厂 1,169 个处理器。',
      unlock: 'mining' },
    { id: 'canvas', name: 'Canvas（画布）', status: 'live', source: 'TapeOut 官方',
      what: '在浏览器里拖零件、连线、实时仿真。设计阶段不花 gas、不烧币，改到满意再流片。新手的第一站。',
      unlock: 'always' },
    { id: 'tapeout', name: 'Tape Out（流片）', status: 'live', source: 'TapeOut 协议',
      what: '协议最核心的动作：确认设计后烧掉所需的 NAND/LATCH 代币，生成电路 NFT。一旦流片不可更改——像真芯片一样，错了只能重做。名字来自半导体行业，早期设计数据真是录在磁带上寄给工厂的。',
      unlock: 'tapeout' },
    { id: 'pod', name: 'PoD（设计挖矿）', status: 'live', source: 'ECOSYSTEM §3.1（2026-08-21 上线）',
      what: '不挖哈希，挖“设计得好不好”。官方出 267 道电路题，你的电路通过链上验证、注册成矿机后，按权重分每天固定的 7,200 BEM。权重 = 消耗的 NAND+LATCH 数 × 处理器系数（Behemoth ×6、TapeOut ×1）。',
      unlock: 'ch1' },
    { id: 'bem', name: 'BEM', status: 'live', source: 'ECOSYSTEM §3.1',
      what: 'PoD 的奖励资产。总量上限 2,100 万，无预挖、无团队预留，约 4 年减半。截至 2026-11-24：注册矿机 20,981 台、累计挖出 599,651.51 BEM。买卖收 1% 税。游戏里赚到的 BEM 是游戏币，不是真实 BEM。',
      unlock: 'mining' },
    { id: 'behemoth', name: 'Behemoth（巨兽）', status: 'live', source: 'ECOSYSTEM §3.1',
      what: '创始人用 TapeOut 造的第一台链上 CPU：4 位，对标 1971 年 Intel 4004，约 2,300 门；时钟 = 区块生产，约 2.22 Hz；永久运行、免费调用。也是 PoD 里权重 ×6 的处理器。',
      unlock: 'mining' },
    { id: 'taps', name: 'TAPs / TAP-02', status: 'live', source: 'github.com/TapeOutProtocol/TAPs',
      what: '开源的协议标准提案库。TAP-02 定义了网表格式 tapnet/1（本游戏模拟器用的就是它，CC0）；TAP-10 是容器、TAP-11 是服务清单。',
      unlock: 'always' },
    { id: 'test1', name: 'TapeCode-Test1', status: 'live', source: 'TECH_BRIEF §3',
      what: 'TapeCode 的演示 NFT：总量 10,000，其中 7,000 张已开图流通、3,000 张未开图；4,132 个持有钱包；地板约 1 OKB（2026-11-24）。每张背后是一份真实 tapnet/1 网表，多张 NFT 可共享同一份网表。网表是随机分配的收藏品，不是任何 PoD 题的答案。',
      unlock: 'test1' },
    { id: 'tapekit', name: 'TapeKit / DeWEB', status: 'live', source: 'ECOSYSTEM §3.2',
      what: 'TapeKit 是开源 DeWEB 浏览器内核：直读链上网站文件，逐字节验 SHA-256。DeWEB 是链上网站标准：网站文件存在电路容器里，地址格式 tape://…。',
      unlock: 'test1' },
    { id: 'taperelay', name: 'TapeRelay', status: 'alpha', source: 'ECOSYSTEM §3.2（2026-11-18 上线）',
      what: '去中心化文件与消息网络：5 台官方节点，电路 ID 就是身份；文件 1 MiB 切块、哈希命名；消息端到端加密、传送不花 gas。测试期每电路每节点 5 GiB 免费，超额用 BEM 买。',
      unlock: 'test1' },
    { id: 'tapexo', name: 'tapeXO', status: 'live', source: 'ECOSYSTEM §3.3',
      what: '链上可验证的 X 抽奖：参与名单事前固定、哈希上链；用承诺的随机种子哈希 → 延迟揭示种子 → 之后区块哈希算中奖者，第三方可用验证脚本重算。',
      unlock: 'test1' },
    { id: 'tapehub', name: 'TapeHub / TapeLaunch', status: 'alpha', source: 'ECOSYSTEM §3.3',
      what: '发币平台：把“晶体管 → 矿机 → 挖矿 → 上市”做成一条龙。参与者先 mint 项目的晶体管，达标毕业后上 PancakeSwap 流动性。TapeLaunch 是 AI 建站 + 发币的轻量版。',
      unlock: 'test1' },
    { id: 'tapeai', name: 'TapeAI（$TAI）', status: 'live', source: 'ECOSYSTEM §3.3',
      what: 'AI Agent 平台：检察官（Prosecutor）电路 NFT 质押分协议收入；Agent 广场里有 Alpha Hunters，按你的策略扫链上新项目，每笔交易需你手动确认。',
      unlock: 'test1' },
    { id: 'fabx', name: 'FabX（$FAB）', status: 'live', source: 'ECOSYSTEM §3.3',
      what: 'X Layer 上第一个社区矿工：每天固定发 7,200 FAB。FAB 不是 BEM——FAB 是社区项目 FabX 的币，BEM 是 TapeOut 协议的 PoD 奖励币，别混淆。',
      unlock: 'test1' },
    { id: 'tapemine', name: 'TapeMine（联合矿池）', status: 'live', source: 'ECOSYSTEM §3.3',
      what: '社区联合挖矿：凑晶体管一起组矿机，按凭证分 BEM。1 个 NAND = 1 张收益凭证，凭证可转让；收 5% 平台费。二期（仅 Behemoth NAND）2026-11-14–11-30。',
      unlock: 'mining' },
    { id: 'tap721', name: 'TAP-721', status: 'draft', source: 'ECOSYSTEM §3.1（草案，2026-10-18 起草未合并）',
      what: '电路 NFT 标准草案：NFT 绑定一份真实网表（可下载、可验证）；X Layer 合约能直接调用 NFT 绑定的电路。还是草案，别当成已上线。',
      unlock: 'test1' },
    { id: 'market', name: '集市', status: 'live', source: 'GAME_CONCEPT §4 第四章',
      what: 'BEM 的花法：零件铺、DeWEB 小镇、TapeRelay 中继站、tapeXO 抽奖亭。官方自己都在愁 BEM 能花的地方太少——集市就是答案的一半：挖出来的 BEM 要流回生态里，才有价值。',
      unlock: 'market' },
    { id: 'cpu4', name: '4 位 CPU（点亮）', status: 'live', source: 'ECOSYSTEM §3.1 · Behemoth',
      what: '把加法器、寄存器拼成一台 4 位 CPU：时钟一拍一拍走，区块就是时钟。Behemoth 是真的 4 位链上 CPU，约 2,300 门，对标 1971 年 Intel 4004，永久运行、免费调用。',
      unlock: 'cpu' },
    { id: 'factory-open', name: '处理器工厂（开厂）', status: 'live', source: 'GAME_CONCEPT §4 第五章 · ECOSYSTEM §3.3',
      what: '花一笔 BEM 开自己的处理器，自己定晶体管价，别人的电路来流片你就收钱。真实统计（2026-10-23）：X Layer 389 台处理器，111 台 0 产出——开厂不等于赚钱，长尾很残酷。',
      unlock: 'factory' },
    { id: 'token', name: '发币（TapeHub）', status: 'live', source: 'GAME_CONCEPT §4 第五章 · ECOSYSTEM §3.3',
      what: 'TapeHub 式发币三步：先 mint 自己项目的晶体管，达标“毕业”上流动性，再用矿机慢慢挖自己的币。游戏里：mint 1 游戏 BEM，开币满 2 天 + 锁 5 游戏 BEM 毕业，毕业后矿机每天同时挖你的币（当日 BEM 产量的 10%）。',
      unlock: 'factory' },
    { id: 'tapesend', name: 'TapeSend', status: 'unverified', source: 'ECOSYSTEM §3.2',
      what: '号称“多链端到端加密消息层”，但除一句话介绍外找不到仓库、文档、API 或演示，很可能已被 TapeRelay 的消息功能取代。本游戏不声称调用它。',
      unlock: 'test1' },
    { id: 'comparator', name: '比较器', status: 'live', source: 'GAME_CONCEPT §8 · PoD 题库真题',
      what: '两个数比大小的电路：输出三路——a>b、a=b、a<b。先比高位：高位分胜负就不用看低位；高位相等才看低位。游戏里是第五道真题，34 个 NAND 门是标准做法。',
      unlock: 'ch1' },
    { id: 'sbox', name: 'S 盒', status: 'live', source: 'GAME_CONCEPT §8 · PoD 题库真题',
      what: '密码学里的置换盒：4 位输入查表换成 4 位输出（PRESENT 密码的 S 盒），没有固定公式，只能按输入一位一位选。游戏里是第六道真题，4 级选择器树、184 个 NAND 门是标准做法。',
      unlock: 'ch1' },
    { id: 'life', name: '康威生命游戏', status: 'live', source: 'ECOSYSTEM §3.1 · Behemoth 标志性演示',
      what: 'CPU 的第二种程序：同一台 CPU，换一块电路跑生命游戏。规则只有三句：3 个邻居出生、2 个邻居存活，其余都死。4×4 是 1,600 个 NAND 门、6×6 是 3,600 个 NAND 门，都是真电路、真仿真。Behemoth 在链上跑生命游戏，是 TapeOut 生态的标志性演示。',
      unlock: 'cpu' },
    { id: 'tapeup', name: 'TapeUP', status: 'live', source: 'ECOSYSTEM §3.3',
      what: '全链账本 + PoB（Proof-of-Burn）交易引擎：UP 只能用 BEM 买；30,000+ BEM 已锁定在 TapeUP（交易池 10,000+、Bid Reservoir 排队 9,000+、质押合约 14,000+）。TAI 就在此发行、与 BEM 配对。',
      unlock: 'market' },
    { id: 'tapeliquid', name: 'TAPELIQUID / Circuit Punk', status: 'live', source: 'ECOSYSTEM §3.3',
      what: '生态里少数真把电路用起来、还有持续交易和销毁的第三方：交易台是生态唯一同时有现货 + 永续的市场，前端住在电路容器里。Circuit Punk 创世 NFT 共 1 万枚（TAP-721），每枚带一份完整网表 + SHA-256；目前 L0 阶段，电路暂不可调用。BOT 的收益说法未核实。',
      unlock: 'test1' },
    { id: 'tapestry', name: 'Tapestry', status: 'alpha', source: 'ECOSYSTEM §3.3',
      what: '完全链上的社交应用：身份、帖子、互动、审核全在链上，前端住在电路容器里。2026-10-17–18 上线。',
      unlock: 'market' },
    { id: 'silicube', name: 'SiliCube（$CUBE）', status: 'alpha', source: 'ECOSYSTEM §3.3',
      what: 'DeWEB 上的应用，经 TapeLaunch 发 $CUBE：烧 $CUBE 铸机器（官方叫 tape-out），一个区块后抽电路（官方叫校准）；电路越稀有、权重越高、分的 BNB 越多。4,444 台机器铸完后共烧掉 28.6% 总供应量。',
      unlock: 'factory' },
    { id: 'bemdraw', name: 'BEM-DRAW', status: 'alpha', source: 'ECOSYSTEM §3.3',
      what: '抽奖逻辑写进 TapeOut 电路里、链上开奖验证：每玩一次 0.1 BEM，分创世会员 / 普通会员 / 参与者档位。连抽奖规则本身都是电路。',
      unlock: 'market' },
    { id: 'tapefour', name: 'TapeFour', status: 'alpha', source: 'ECOSYSTEM §3.3',
      what: '与 Four.meme 合作的挖矿式发币：买晶体管 → 项目“毕业” → 发币（无团队份额）→ 再流片 5 个 NAND 门做成矿机来挖这个币。',
      unlock: 'factory' }
  ];
  var STATUS_LABEL = { live: '✅ 已实现', alpha: '🧪 测试中', draft: '📝 草案', unverified: '❓ 未核实' };
  // 解锁条件的人话（第 24 轮）：锁定卡片以前直接显示内部 key（如“🔒 ch1”），用户看不懂
  var UNLOCK_LABEL = {
    always: '一直可见', prologue: '去设计台逛逛', ch1: '去任务板通过一道题',
    tapeout: '去流片厂流一片', mining: '去矿场注册一台矿机', test1: '去卡片馆看看',
    market: '去集市逛逛', cpu: '去 CPU 神殿点亮 CPU', factory: '去处理器工厂开厂'
  };
  function codexUnlockLabel(unlock) { return UNLOCK_LABEL[unlock] || unlock; }
  function codexUnlocked(save, entry) {
    if (entry.unlock === 'always') return true;
    if (entry.unlock === 'prologue') return !!save.visited.prologue;
    if (entry.unlock === 'ch1') return !!save.visited.ch1;
    if (entry.unlock === 'tapeout') return !!save.visited.tapeout;
    if (entry.unlock === 'mining') return !!save.visited.mining;
    if (entry.unlock === 'test1') return !!save.visited.test1;
    if (entry.unlock === 'market') return !!save.visited.market;
    if (entry.unlock === 'cpu') return !!save.visited.cpu;
    if (entry.unlock === 'factory') return !!save.visited.factory;
    return false;
  }

  /* ================= Test1 图鉴数据 ================= */
  // 快照自 samples/test1-N-meta.json（2026-11-24 拉取，SHA-256 已逐项校验）。
  // 打开卡片馆时，界面会重新读本地样本文件核对一次；不一致时以文件为准并报错。
  var TEST1_CARDS = [
    { id: 1, editionIndex: 1, of: 2443, nIn: 17, nOut: 9, nand: 100, latch: 0,
      sha: '0xf669fd26c28e9de2199b3626bd632b0e9294fa49046d7833fd78cf6cc7b9a634',
      image: 'https://nft.taperelay.com/tct1/img/8bc4959e32b51a842b96f00291eab62ed1976ca1bedf2ed07b044ffc821e3136.png' },
    { id: 100, editionIndex: 26, of: 2443, nIn: 17, nOut: 9, nand: 100, latch: 0,
      sha: '0xf669fd26c28e9de2199b3626bd632b0e9294fa49046d7833fd78cf6cc7b9a634',
      image: 'https://nft.taperelay.com/tct1/img/7bf3f16ba060eea3c4057eca8b5e3a53efc7fd9717580833c8420155727790db.png' },
    { id: 1000, editionIndex: 6, of: 50, nIn: 8, nOut: 8, nand: 121, latch: 0,
      sha: '0x9219e2c1078d602da05c3e2b24d869b5cbd551d134f037be29b5da5500cdade5',
      image: 'https://nft.taperelay.com/tct1/img/7e8d9f5a39c09091c6649fcc5ae376a92e68241e6e8738bb06d43dbb7fb8018f.png' },
    { id: 3500, editionIndex: 13, of: 25, nIn: 16, nOut: 5, nand: 192, latch: 0,
      sha: '0xccc82b6e29e8fb69a02a328c92f329494a17fbbf4c6a4978fdce5674cd313fa5',
      image: 'https://nft.taperelay.com/tct1/img/9d6dcdfeed8e380fae7f51a6c8b842cab18d1ecc0861293b52296e94fe48722d.png' },
    { id: 9999, editionIndex: 5, of: 5, nIn: 12, nOut: 12, nand: 349, latch: 0,
      sha: '0x924979c00d86beeb02ab804687162863f87847f7e7fd3fe859ebca5228fb4644',
      image: 'https://nft.taperelay.com/tct1/img/12f4f7f510b56bc5a5e7502018a43af3bbea418a6810e0a8ee2cfc5acb6bf397.png' }
  ];

  /* ================= 导出 ================= */
  var pure = {
    esc: esc, shortSha: shortSha, formatTime: formatTime, rarityOf: rarityOf,
    outputsMatch: outputsMatch, hamDist: hamDist, starFor: starFor,
    PROBLEMS: PROBLEMS, problemById: problemById,
    allInputRows: allInputRows, sampleInputRows: sampleInputRows,
    newDraft: newDraft, draftProblem: draftProblem, srcKey: srcKey, srcEquals: srcEquals,
    gateById: gateById, addGate: addGate, removeGate: removeGate,
    connect: connect, disconnect: disconnect, draftMissing: draftMissing,
    topoOrder: topoOrder, compileDraft: compileDraft,
    evaluateCompiled: evaluateCompiled, verifyTruthTable: verifyTruthTable,
    tapeOutCard: tapeOutCard,
    DAILY_BEM: DAILY_BEM, PROCESSORS: PROCESSORS,
    minerWeight: minerWeight, dailyOutput: dailyOutput, settleDay: settleDay,
    MARKET_ITEMS: MARKET_ITEMS, SITE_COST_BEM: SITE_COST_BEM,
    RELAY_FREE_GIB: RELAY_FREE_GIB, RELAY_EXTRA_GIB: RELAY_EXTRA_GIB,
    RELAY_EXTRA_COST_BEM: RELAY_EXTRA_COST_BEM, LOTTERY_PRIZE_BEM: LOTTERY_PRIZE_BEM,
    LOTTERY_NPCS: LOTTERY_NPCS, marketItemById: marketItemById, buyParts: buyParts,
    siteSlug: siteSlug, openSite: openSite, relayBuyStorage: relayBuyStorage,
    relayEncryptDemo: relayEncryptDemo, lotteryParticipants: lotteryParticipants,
    lotteryDraw: lotteryDraw, lotteryEnter: lotteryEnter,
    marketUnlocked: marketUnlocked, cpuUnlocked: cpuUnlocked,
    test1Placeholder: test1Placeholder,
    buildCounterCircuit: buildCounterCircuit, counterValue: counterValue,
    LIFE_N: LIFE_N, LIFE_CELLS: LIFE_CELLS, lifeIndex: lifeIndex, lifeNeighbors: lifeNeighbors,
    LIFE_PRESETS: LIFE_PRESETS, LIFE_PRESETS_6: LIFE_PRESETS_6, buildLifeCircuit: buildLifeCircuit,
    FACTORY_OPEN_COST_BEM: FACTORY_OPEN_COST_BEM, FACTORY_PRICES: FACTORY_PRICES,
    TOKEN_MINT_COST_BEM: TOKEN_MINT_COST_BEM, TOKEN_GRADUATE_COST_BEM: TOKEN_GRADUATE_COST_BEM,
    TOKEN_GRADUATE_MIN_AGE: TOKEN_GRADUATE_MIN_AGE, TOKEN_MINE_SHARE: TOKEN_MINE_SHARE,
    processorArrivals: processorArrivals, openProcessor: openProcessor,
    launchToken: launchToken, graduateToken: graduateToken, tokenByName: tokenByName,
    nextStep: nextStep, milestones: milestones,
    SAVE_KEY: SAVE_KEY, defaultSave: defaultSave, loadSave: loadSave, storeSave: storeSave,
    exportSaveText: exportSaveText, importSaveText: importSaveText,
    totalStars: totalStars, parTotal: parTotal, bestGatesTotal: bestGatesTotal,
    prologueDraft: prologueDraft,
    CODEX: CODEX, STATUS_LABEL: STATUS_LABEL, codexUnlocked: codexUnlocked, codexUnlockLabel: codexUnlockLabel,
    TEST1_CARDS: TEST1_CARDS
  };
  // 多语言（第 58 轮）：纯逻辑也要用 t()（nextStep / milestones 的文案走词典），
  // 所以 I18N_API 必须在下面 Node 提前 return 之前就接好。浏览器走 window.TapeI18n，
  // Node 回归走 require；拿不到时 t() 返回 key 本身，界面不断。
  var I18N_API = null;
  try { I18N_API = (typeof module !== 'undefined' && module.exports) ? require('./i18n.js') : (typeof window !== 'undefined' ? window.TapeI18n : null); } catch (e) { I18N_API = null; }
  function t(key, vars) { return I18N_API ? I18N_API.t(key, vars) : key; }
  if (typeof module !== 'undefined' && module.exports) module.exports = pure;
  global.TapeFactory = pure;

  if (typeof document === 'undefined') return; // Node 只用纯逻辑

  /* ================= 界面：通用状态 ================= */
  var S = global.TapeSchematic;
  var SAVE = loadSave();
  function save() { storeSave(SAVE); }
  function $(id) { return document.getElementById(id); }
  function show(el, on) { if (el) el.style.display = on ? '' : 'none'; }
  function setStatus(msg) { var el = $('status-line'); if (el) el.textContent = msg; }

  /* ================= 音效（第 53 轮） ================= */
  // WebAudio 合成短音，无素材文件；首次交互后才能出声（浏览器规则），验货/结算/点亮
  // 都是点击触发的，正好合规。SAVE.sound === false 时静音，开关在 HUD 里。
  var SOUND_CTX = null;
  function playTone(freq, dur, delay) {
    try {
      if (SAVE.sound === false) return;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!SOUND_CTX) SOUND_CTX = new AC();
      if (SOUND_CTX.state === 'suspended') SOUND_CTX.resume();
      var t0 = SOUND_CTX.currentTime + (delay || 0);
      var o = SOUND_CTX.createOscillator(), g = SOUND_CTX.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(SOUND_CTX.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  function playChime(kind) {
    if (kind === 'pass') { playTone(660, 0.18, 0); playTone(880, 0.25, 0.12); }
    else if (kind === 'coin') { playTone(990, 0.12, 0); }
    else if (kind === 'lit') { playTone(523, 0.2, 0); playTone(659, 0.2, 0.12); playTone(784, 0.3, 0.24); }
  }

  /* ================= 黄金路径常驻指示（第 65 轮，WINNERS.md 第 54 轮：FabX 闭环 + AngelHack 一个用户一个动作一个可见结果） ================= */
  // 顶部常驻五步：设计台 → 流片厂 → 矿场 → 集市（BEM 花回生态）→ 点亮 CPU。
  // 走过的打勾、当前步高亮；点一步直达该视图。完成判定与 nextStep() 的进度口径一致，
  // 集市一步认“真把 BEM 花出去了”（开网站 / 参加抽奖 / 加购存储）。
  var GOLD_PATH = [
    { id: 'prologue', name: 'b.prologue.name', desc: 'b.prologue.desc', done: function () { return Object.keys(SAVE.passed).length > 0; } },
    { id: 'tapeout', name: 'b.tapeout.name', desc: 'b.tapeout.desc', done: function () { return SAVE.taped.length > 0; } },
    { id: 'mining', name: 'b.mining.name', desc: 'b.mining.desc', done: function () { return (SAVE.minedTotal || 0) > 0; } },
    { id: 'market', name: 'b.market.name', desc: 'b.market.desc', done: function () { return SAVE.sites.length > 0 || (SAVE.lottery && SAVE.lottery.entered) || SAVE.relayGiB > 0; } },
    { id: 'cpu', name: 'b.cpu.name', desc: 'b.cpu.desc', done: function () { return !!SAVE.cpu.lit; } }
  ];
  function renderGoldPath() {
    var bar = $('gold-path');
    if (!bar) return;
    var currentSet = false;
    bar.innerHTML = '<span class="gp-label">' + t('gold.label') + '</span>' + GOLD_PATH.map(function (s) {
      var done = s.done();
      var cls = done ? 'done' : (!currentSet ? 'now' : 'later');
      if (!done) currentSet = true;
      return '<button class="gp-step ' + cls + '" data-gp="' + s.id + '" title="' + esc(t(s.desc)) + '">' +
        (done ? '✓ ' : '') + t(s.name) + '</button>';
    }).join('<span class="gp-arrow">→</span>');
    Array.prototype.forEach.call(bar.querySelectorAll('[data-gp]'), function (b) {
      b.onclick = function () { switchView(b.getAttribute('data-gp')); };
    });
  }

  function refreshHud() {
    $('res-nand').textContent = SAVE.nand;
    $('res-latch').textContent = SAVE.latch;
    $('res-bem').textContent = SAVE.bem.toFixed(2);
    $('res-day').textContent = SAVE.day;
    $('res-stars').textContent = totalStars(SAVE);
    var max = $('res-stars-max');
    if (max) max.textContent = PROBLEMS.length * 3; // 满星 = 题数 × 3（曾写死 /9，题库扩到 6 道后过期）
    // HUD 当前目标（第 55 轮视觉简化）：只显示下一步去哪，点一下就去
    var goal = $('hud-goal');
    if (goal) {
      var ns = nextStep(SAVE), bn = null;
      BUILDINGS.forEach(function (x) { if (x.id === ns.target) bn = x; });
      goal.textContent = t('hud.nextPrefix') + (bn ? t(bn.name) : ns.target);
    }
    renderGoldPath(); // 第 65 轮：黄金路径常驻指示，HUD 每次刷新都同步
  }

  var VIEWS = ['town', 'prologue', 'ch1', 'tapeout', 'mining', 'market', 'cpu', 'factory', 'test1', 'codex', 'sim'];
  var CUR_VIEW = 'town'; // 当前视图（第 58 轮：语言切换后重画当前视图用）
  function switchView(name) {
    CUR_VIEW = name;
    if (typeof cpuStopAuto === 'function') cpuStopAuto(); // 离开 CPU 神殿就停掉自动跑
    VIEWS.forEach(function (v) { show($('view-' + v), v === name); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav') === name);
    });
    if (name === 'town') renderTown();
    if (name === 'prologue') { SAVE.visited.prologue = true; save(); renderPrologue(); }
    if (name === 'ch1') { SAVE.visited.ch1 = true; save(); renderCh1(); }
    if (name === 'tapeout') { SAVE.visited.tapeout = true; save(); renderTapeout(); }
    if (name === 'mining') { SAVE.visited.mining = true; save(); renderMining(); }
    if (name === 'market') { SAVE.visited.market = true; save(); renderMarket(); }
    if (name === 'cpu') { SAVE.visited.cpu = true; save(); renderCpu(); }
    if (name === 'factory') { SAVE.visited.factory = true; save(); renderFactory(); }
    if (name === 'test1') { SAVE.visited.test1 = true; save(); renderTest1(); }
    if (name === 'codex') renderCodex();
    window.scrollTo(0, 0);
  }

  /* ================= 弹窗 ================= */
  function showModal(html, bind) {
    var root = $('modal-root');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal">' + html + '</div></div>';
    root.style.display = 'block';
    if (bind) bind();
  }
  function closeModal() {
    var root = $('modal-root');
    root.style.display = 'none';
    root.innerHTML = '';
  }
  // 首次访问欢迎弹窗（第 16 轮）：只出现一次。讲清三件事：这是什么、怎么玩、诚实说明。
  // 第 65 轮（FabX 首屏做法）：第一句就是一句话价值主张（welcome.p1），下面挂一个
  // 极小可玩 NAND 门演示——拨动开关、看输出翻转，真 NAND 逻辑现场算，不做假演示。
  // 文案走 i18n 词典（第 58 轮），语言切换时若弹窗还开着就按新语言重画。
  function showWelcome() {
    if (SAVE.visited.welcome) return;
    showModal('<h2>' + t('welcome.title') + '</h2>' +
      '<p><b>' + t('welcome.p1') + '</b></p>' +
      '<div class="nand-demo"><p class="nd-title">' + t('welcome.demoTitle') + '</p>' +
      '<div class="nd-row"><button class="nd-sw" id="w-nand-a">A = 0</button>' +
      '<button class="nd-sw" id="w-nand-b">B = 0</button>' +
      '<span class="nd-out">' + t('welcome.demoOut') + ' <b id="w-nand-out">1</b></span>' +
      '<span class="nd-lamp on" id="w-nand-lamp"></span></div>' +
      '<p class="hint">' + t('welcome.demoHint') + '</p></div>' +
      '<p>' + t('welcome.p2') + '</p>' +
      '<p class="hint">' + t('welcome.p3') + '</p>' +
      '<div class="toolbar"><button class="btn-primary" id="btn-welcome-start">' + t('welcome.start') + '</button>' +
      '<button id="btn-welcome-later">' + t('welcome.later') + '</button></div>',
      function () {
        var a = 0, b = 0;
        function draw() {
          var out = (a && b) ? 0 : 1; // 真 NAND：只有 A、B 都是 1，输出才是 0
          $('w-nand-a').textContent = 'A = ' + a;
          $('w-nand-b').textContent = 'B = ' + b;
          $('w-nand-out').textContent = out;
          $('w-nand-lamp').className = 'nd-lamp' + (out ? ' on' : '');
        }
        $('w-nand-a').onclick = function () { a = a ? 0 : 1; draw(); };
        $('w-nand-b').onclick = function () { b = b ? 0 : 1; draw(); };
        function done(go) { SAVE.visited.welcome = true; save(); closeModal(); if (go) switchView('prologue'); }
        $('btn-welcome-start').onclick = function () { done(true); };
        $('btn-welcome-later').onclick = function () { done(false); };
      });
  }

  /* ================= 小镇地图 ================= */
  // 建筑图标（第 15 轮）：手绘风描边 SVG，每栋建筑一个专属图形（Shapez 的教训：
  // 每台机器要有自己的视觉身份）。用 currentColor 着色，跟随分类配色。
  function bIcon(paths) {
    return '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }
  var ICONS = {
    design: bIcon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 16L16 8"/><circle cx="8" cy="8" r="1.6"/><circle cx="16" cy="16" r="1.6"/>'),
    tasks: bIcon('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>'),
    chip: bIcon('<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="10" y="10" width="4" height="4"/><path d="M9 6V3M15 6V3M9 21v-3M15 21v-3M6 9H3M6 15H3M21 9h-3M21 15h-3"/>'),
    mountain: bIcon('<path d="M3 20l6-11 4 7 3-4 5 8H3z"/><circle cx="17.5" cy="6.5" r="2.5"/>'),
    store: bIcon('<path d="M4 9l1.2-4h13.6L20 9M4 9h16M4 9v11h16V9M9.5 20v-6h5v6"/>'),
    cpu: bIcon('<rect x="7" y="7" width="10" height="10" rx="1"/><path d="M10 7V3.5M14 7V3.5M10 20.5V17M14 20.5V17M7 10H3.5M7 14H3.5M20.5 10H17M20.5 14H17"/><path d="M12 10.2l-1.4 2.3h2l-1.2 2"/>'),
    factory: bIcon('<path d="M3 21V10l5 3.5V10l5 3.5V6h3.5V21H3z"/><path d="M6.5 17.5h1.5M11 17.5h1.5M15.5 17.5H17"/>'),
    cards: bIcon('<rect x="8" y="3.5" width="12" height="16" rx="2"/><rect x="3.5" y="7.5" width="12" height="12" rx="2"/>'),
    book: bIcon('<path d="M12 6.5C10 5 7 4.5 4 4.5v14c3 0 6 .5 8 2 2-1.5 5-2 8-2v-14c-3 0-6 .5-8 2z"/><path d="M12 6.5v14"/>')
  };
  // name/desc/hint/lock 存的是 i18n 键（第 58 轮），渲染时 t() 解析，别直接显示。
  var BUILDINGS = [
    { id: 'prologue', name: 'b.prologue.name', desc: 'b.prologue.desc', icon: ICONS.design, cat: 'design', group: 'main', open: function () { return true; }, hint: 'b.prologue.hint' },
    { id: 'ch1', name: 'b.ch1.name', desc: 'b.ch1.desc', icon: ICONS.tasks, cat: 'design', group: 'main', open: function () { return !!SAVE.visited.prologue; }, lock: 'b.ch1.lock' },
    { id: 'tapeout', name: 'b.tapeout.name', desc: 'b.tapeout.desc', icon: ICONS.chip, cat: 'design', group: 'main', open: function () { return Object.keys(SAVE.passed).length > 0; }, lock: 'b.tapeout.lock' },
    { id: 'mining', name: 'b.mining.name', desc: 'b.mining.desc', icon: ICONS.mountain, cat: 'mine', group: 'main', open: function () { return SAVE.taped.length > 0; }, lock: 'b.mining.lock' },
    { id: 'market', name: 'b.market.name', desc: 'b.market.desc', icon: ICONS.store, cat: 'trade', group: 'eco', open: function () { return SAVE.taped.length > 0; }, lock: 'b.market.lock' },
    { id: 'cpu', name: 'b.cpu.name', desc: 'b.cpu.desc', icon: ICONS.cpu, cat: 'cpu', group: 'main', open: function () { return SAVE.taped.length > 0; }, lock: 'b.cpu.lock' },
    { id: 'factory', name: 'b.factory.name', desc: 'b.factory.desc', icon: ICONS.factory, cat: 'trade', group: 'eco', open: function () { return SAVE.cpu.lit; }, lock: 'b.factory.lock' },
    { id: 'test1', name: 'b.test1.name', desc: 'b.test1.desc', icon: ICONS.cards, cat: 'cards', group: 'ref', open: function () { return true; }, hint: 'b.test1.hint' },
    { id: 'codex', name: 'b.codex.name', desc: 'b.codex.desc', icon: ICONS.book, cat: 'cards', group: 'ref', open: function () { return true; }, hint: 'b.codex.hint' }
  ];
  function renderTown() {
    var ns = nextStep(SAVE);
    var wrap = $('town-grid');
    var GROUPS = [
      { id: 'main', name: '造芯主线' },
      { id: 'eco', name: '生态 · 花 BEM 与开厂' },
      { id: 'ref', name: '图鉴 · 查资料' }
    ];
    wrap.innerHTML = GROUPS.map(function (g) {
      var bs = BUILDINGS.filter(function (b) { return b.group === g.id; });
      if (!bs.length) return '';
      return '<h3 class="town-group">' + g.name + '</h3><div class="town-subgrid">' + bs.map(function (b) {
        var ok = b.open();
        var visited = !!SAVE.visited[b.id];
        var cls = 'building' + (ok ? '' : ' locked') + (visited ? ' lit' : '') +
          (b.id === ns.target ? ' now' : '') + (ok && b.id !== ns.target ? ' dim' : '');
        return '<button class="' + cls + '" data-b="' + b.id + '" data-cat="' + (b.cat || '') + '"' + (ok ? '' : ' disabled') + '>' +
          '<span class="b-icon">' + b.icon + '</span>' +
          '<span class="b-name">' + t(b.name) + (visited ? ' ✓' : '') + '</span>' +
          '<span class="b-desc">' + t(b.desc) + '</span>' +
          '<span class="b-hint">' + (ok ? (b.hint ? t(b.hint) : '') : ('🔒 ' + t(b.lock))) + '</span>' +
          '</button>';
      }).join('') + '</div>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('.building:not(.locked)'), function (btn) {
      btn.onclick = function () { switchView(btn.getAttribute('data-b')); };
    });
    // 旅程进度（第 43 轮：每步一个分类色点，与建筑配色同一套颜色语言）
    var stage = SAVE.cpu.lit ? 7 : (SAVE.visited.cpu ? 6 : (SAVE.visited.market ? 5 : (SAVE.taped.length > 0 ? 4 : (Object.keys(SAVE.passed).length > 0 ? 3 : (SAVE.visited.prologue ? 2 : 1)))));
    var steps = [
      { name: t('journey.buy'), cat: 'trade' }, { name: t('journey.draw'), cat: 'design' },
      { name: t('journey.tapeout'), cat: 'design' }, { name: t('journey.mine'), cat: 'mine' },
      { name: t('journey.spend'), cat: 'trade' }, { name: t('journey.cpu'), cat: 'cpu' },
      { name: t('journey.factory'), cat: 'trade' }
    ];
    $('journey').innerHTML = steps.map(function (s, i) {
      var cls = i + 1 < stage ? 'done' : (i + 1 === stage ? 'now' : 'later');
      return '<span class="j-step ' + cls + '"><span class="j-dot" data-cat="' + s.cat + '"></span>' + s.name + '</span>' + (i < steps.length - 1 ? '<span class="j-arrow">→</span>' : '');
    }).join('') + '<span class="j-note">' + t(SAVE.processors.length > 0 ? 'journey.noteOpen' : 'journey.noteClosed') + '</span>';
    // 下一步引导（一次只给一句话，永远有门槛在眼前）
    $('next-step').innerHTML = '<div class="next-step">' + t('town.nextPrefix') + esc(ns.text) +
      ' <button class="btn-primary" id="btn-next-step">' + t('town.goBtn') + '</button></div>';
    $('btn-next-step').onclick = function () { switchView(ns.target); };
    // 里程碑（8 个生态真实步骤，做完就亮）
    var ms = milestones(SAVE);
    var doneCount = ms.filter(function (m) { return m.done; }).length;
    $('milestones').innerHTML = '<p class="hint">' + t('town.msDone', { done: doneCount, total: ms.length }) + '</p><div class="ms-list">' +
      ms.map(function (m) {
        return '<span class="ms-chip' + (m.done ? ' done' : '') + '">' + (m.done ? '✓ ' : '○ ') + esc(m.name) + '</span>';
      }).join('') + '</div>';
    var msSum = $('fold-milestones');
    if (msSum) msSum.querySelector('summary').textContent = t('town.foldMilestonesCount', { done: doneCount, total: ms.length });
    // 存档导出/导入（第 12 轮）：存档只在浏览器本地。换设备（手机 ↔ 电脑）时，
    // 导出一份 JSON，另一台设备上粘贴导入即可恢复。导入会覆盖当前存档。
    $('save-box').innerHTML = '<div class="panel">' +
      '<p class="hint">' + t('save.hint') + '</p>' +
      '<div class="toolbar"><button id="btn-save-export">' + t('save.export') + '</button>' +
      '<button id="btn-save-import">' + t('save.import') + '</button></div>' +
      '<textarea id="ta-save-import" rows="3" style="width:100%;display:none" placeholder="' + esc(t('save.importPlaceholder')) + '"></textarea>' +
      '<p class="hint" id="save-msg"></p></div>';
    $('btn-save-export').onclick = function () {
      try {
        var blob = new Blob([exportSaveText()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tapecode-save.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        $('save-msg').textContent = t('save.exported');
      } catch (e) {
        $('save-msg').textContent = t('save.exportFail') + e.message;
      }
    };
    $('btn-save-import').onclick = function () {
      var ta = $('ta-save-import');
      if (ta.style.display === 'none') { ta.style.display = 'block'; ta.focus(); $('save-msg').textContent = t('save.importPrompt'); return; }
      var r = importSaveText(ta.value);
      if (!r.ok) { $('save-msg').textContent = t('save.importFail') + r.reason; return; }
      ta.value = ''; ta.style.display = 'none';
      renderTown(); // 先重渲染（它会重建存档面板），再写成功文案，否则文案被冲掉
      $('save-msg').textContent = t('save.imported');
      setStatus('存档已导入恢复。');
    };
    refreshHud();
  }

  /* ================= 存档导出/导入（第 12 轮） ================= */
  // 注意：Node 下模块在界面段之前 return，SAVE 未初始化；所以导出直接读 loadSave()
  //（浏览器里 SAVE 每次改动都会 storeSave，二者一致）。
  function exportSaveText() { return JSON.stringify(loadSave(), null, 2); }
  function importSaveText(text) {
    var s;
    try { s = JSON.parse(text); } catch (e) { return { ok: false, reason: '不是有效的 JSON：' + e.message }; }
    if (!s || typeof s !== 'object' || Array.isArray(s)) return { ok: false, reason: '存档必须是 JSON 对象' };
    if (s.v !== undefined && s.v !== 1) return { ok: false, reason: '存档版本不对（v=' + s.v + '，只认 v=1）' };
    if (s.taped !== undefined && !Array.isArray(s.taped)) return { ok: false, reason: '存档里的 taped 不是列表' };
    if (s.bem !== undefined && typeof s.bem !== 'number') return { ok: false, reason: '存档里的 bem 不是数字' };
    try { storeSave(s); } catch (e) { return { ok: false, reason: '存档写不进去：' + e.message }; }
    SAVE = loadSave();
    return { ok: true };
  }

  /* ================= 序章：两块积木 ================= */
  var PRO_EXPS = [
    { kind: 'not', name: '实验 1 · 一个 NAND 就是非门',
      teach: '把 NAND 的两个输入接在一起，它就变成了非门：输入 1，输出 0；输入 0，输出 1。拨动开关试试。' },
    { kind: 'and', name: '实验 2 · 与门（2 个 NAND）',
      teach: '先 NAND 一次，再把结果取反（NAND 的两个输入接同一个信号就是取反），就得到了与门：只有两个输入都是 1，输出才是 1。' },
    { kind: 'or', name: '实验 3 · 或门（3 个 NAND）',
      teach: '或门 = NOT( NOT a AND NOT b )。把 a、b 各取反一次，再 NAND 一次：只要有一个输入是 1，输出就是 1。' },
    { kind: 'latch', name: '实验 4 · LATCH 记住 1',
      teach: 'LATCH 只有一个输入 d。点“运行一拍”：输出 q 是上一拍记住的值——拨一下开关、跑一拍，q 才跟着变。这就是“记忆”：NAND 负责算，LATCH 负责记。' }
  ];
  var PRO = {}; // kind -> {inputs, state, clock, compiled, layout}
  function renderPrologue() {
    var wrap = $('prologue-list');
    wrap.innerHTML = PRO_EXPS.map(function (e) {
      var done = !!SAVE.prologueDone[e.kind];
      return '<section class="panel exp" id="exp-' + e.kind + '">' +
        '<h3>' + e.name + ' ' + (done ? '<span class="done-tag">✓ 明白了</span>' : '') + '</h3>' +
        '<p class="teach">' + e.teach + '</p>' +
        '<div class="exp-board" id="exp-board-' + e.kind + '"></div>' +
        '<div class="exp-controls" id="exp-ctrl-' + e.kind + '"></div>' +
        (e.kind === 'latch'
          ? '<p class="hint" id="exp-state-' + e.kind + '"></p>' : '') +
        '<button class="btn-done" data-exp="' + e.kind + '">' + (done ? '✓ 已明白' : '我明白了 ✓') + '</button>' +
        '</section>';
    }).join('');
    PRO_EXPS.forEach(function (e) {
      var d = prologueDraft(e.kind);
      var comp = compileDraft(d);
      if (!comp.ok) { $('exp-board-' + e.kind).innerHTML = '<p class="hint">实验电路编译失败：' + esc(comp.reason) + '</p>'; return; }
      PRO[e.kind] = {
        inputs: new Array(d.nIn).fill(0),
        state: new Array(comp.circuit.nState).fill(0),
        clock: 0, compiled: comp, layout: T.layoutCircuit(comp.circuit), d: d
      };
      drawExp(e.kind);
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.btn-done'), function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-exp');
        SAVE.prologueDone[k] = true;
        SAVE.visited.prologue = true;
        save();
        renderPrologue();
        setStatus('✓ ' + k + ' 已标记明白。四个实验都试一遍，第一章的门就都认识了。');
      };
    });
    refreshHud();
  }
  function drawExp(kind) {
    var P = PRO[kind];
    if (!P) return;
    var sim = T.peek(P.compiled.circuit, P.state, P.inputs);
    var box = $('exp-board-' + kind);
    if (P.layout.tooBig) S.renderGateTable(box, P.compiled.circuit, sim.signals);
    else {
      S.renderSchematic(box, P.compiled.circuit, P.layout, sim.signals, { flow: true });
      var svg = box.querySelector('svg.schem');
      if (svg) svg.addEventListener('click', function (ev) {
        var g = ev.target.closest ? ev.target.closest('[data-input]') : null;
        if (g) toggleExpInput(kind, +g.getAttribute('data-input'));
      });
    }
    var ctrl = $('exp-ctrl-' + kind);
    var html = P.inputs.map(function (b, i) {
      return '<button class="hsw' + (b ? ' on' : ' off') + '" data-i="' + i + '">' +
        '<span class="hsw-track"><span class="hsw-knob"></span></span>' +
        '<span class="hsw-label">' + esc(P.d.inNames[i]) + ' = ' + b + '</span></button>';
    }).join('');
    html += sim.outputs.map(function (b, i) {
      return '<span class="hled' + (b ? ' on' : ' off') + '"><span class="hled-dot"></span>' +
        '<span class="hled-label">' + esc(P.d.outNames[i]) + ' = ' + b + '</span></span>';
    }).join('');
    if (kind === 'latch') html += '<button class="btn-primary" data-beat="1">▶ 运行一拍（beat）</button>';
    ctrl.innerHTML = html;
    Array.prototype.forEach.call(ctrl.querySelectorAll('.hsw'), function (btn) {
      btn.onclick = function () { toggleExpInput(kind, +btn.getAttribute('data-i')); };
    });
    var bb = ctrl.querySelector('[data-beat]');
    if (bb) bb.onclick = function () {
      var r = T.beat(P.compiled.circuit, P.state, P.inputs);
      P.state = r.state; P.clock++;
      drawExp(kind);
    };
    var st = $('exp-state-latch');
    if (st && kind === 'latch') {
      st.textContent = '时钟：' + P.clock + ' 拍 · LATCH 内部记住的值 = ' + P.state.join('') +
        '（下一拍输出就是它）。先把 d 拨到 1、运行一拍，再把 d 拨回 0、再运行一拍——看 q 是不是还保持着 1。';
    }
  }
  function toggleExpInput(kind, i) {
    var P = PRO[kind];
    if (!P) return;
    P.inputs[i] = P.inputs[i] ? 0 : 1;
    drawExp(kind);
  }

  /* ================= 第一章：接单（迷你画布） ================= */
  var B = {
    problemId: 'fa', draft: null, inputs: [],
    selSrc: null, selGate: null, verified: null
  };
  var BGATE_W = 100, BGATE_H = 52;

  function currentDraft() {
    if (!B.draft) {
      B.draft = SAVE.drafts[B.problemId] || newDraft(B.problemId);
      SAVE.drafts[B.problemId] = B.draft;
    }
    return B.draft;
  }
  function persistDraft() {
    SAVE.drafts[B.problemId] = B.draft;
    save();
  }
  function gateDefaultPos(n) {
    var col = n % 3, row = Math.floor(n / 3);
    return { x: 300 + col * 230, y: 60 + row * 110 };
  }
  function builderHeight() {
    var h = 520;
    B.draft.gates.forEach(function (g) { h = Math.max(h, g.y + BGATE_H + 60); });
    return h;
  }
  /* 局部求值（草稿未接完时也尽量算出已知信号；接完则走真仿真） */
  function builderSignals() {
    var prob = draftProblem(B.draft);
    var comp = compileDraft(B.draft);
    if (comp.ok) {
      var sim = T.peek(comp.circuit, new Array(comp.circuit.nState).fill(0), B.inputs);
      var gv = {};
      B.draft.gates.forEach(function (g) { gv[g.id] = sim.signals[comp.sigOf[g.id]]; });
      return { gateVal: gv, outVal: sim.outputs, complete: true };
    }
    var vals = {};
    function srcVal(s) {
      if (!s) return undefined;
      if (s.k === 'c') return s.v;
      if (s.k === 'i') return B.inputs[s.idx];
      return vals[s.id];
    }
    var changed = true;
    while (changed) {
      changed = false;
      B.draft.gates.forEach(function (g) {
        if (vals[g.id] !== undefined || g.op !== 0) return;
        var a = srcVal(g.in0), b = srcVal(g.in1);
        if (a !== undefined && b !== undefined) { vals[g.id] = 1 - (a & b); changed = true; }
      });
    }
    var outVal = B.draft.outputs.map(function (s) {
      return (s && s.k === 'g') ? vals[s.id] : undefined;
    });
    return { gateVal: vals, outVal: outVal, complete: false };
  }
  function srcValOf(sig, sigs) {
    if (!sig) return undefined;
    if (sig.k === 'c') return sig.v;
    if (sig.k === 'i') return B.inputs[sig.idx];
    return sigs.gateVal[sig.id];
  }
  function srcPoint(sig, sigs) {
    var prob = draftProblem(B.draft);
    if (sig.k === 'c') return { x: 118, y: 60 + prob.nIn * 64 + (sig.v ? 64 : 0) + 26 };
    if (sig.k === 'i') return { x: 118, y: 60 + sig.idx * 64 + 26 };
    var g = gateById(B.draft, sig.id);
    return { x: g.x + BGATE_W, y: g.y + BGATE_H / 2 };
  }

  function renderCh1() {
    var prob = problemById(B.problemId);
    B.draft = currentDraft();
    B.inputs = new Array(prob.nIn).fill(0);
    B.selSrc = null; B.selGate = null; B.verified = null;
    var tabs = PROBLEMS.map(function (p) {
      var st = SAVE.stars[p.id] || 0;
      return '<button class="ptab' + (p.id === B.problemId ? ' active' : '') + '" data-p="' + p.id + '">' +
        p.name + ' ' + [1, 2, 3].map(function (i) {
          return '<span class="map-star' + (i <= st ? ' got' : '') + '">★</span>';
        }).join('') + '<span class="ptab-sub">' + esc(p.sub) + '</span></button>';
    }).join('');
    $('ch1-tabs').innerHTML = tabs;
    Array.prototype.forEach.call($('ch1-tabs').querySelectorAll('.ptab'), function (b) {
      b.onclick = function () { B.problemId = b.getAttribute('data-p'); renderCh1(); };
    });
    $('ch1-teach').textContent = prob.teach;
    renderCh1Meta();
    drawBuilder();
    drawSimStrip();
    $('tt-panel').innerHTML = '<p class="hint">点「验货」跑完整真值表：' +
      (prob.rows === 'all' ? '共 ' + (1 << prob.nIn) + ' 行' : '共 ' + (1 << prob.nIn) + ' 行全验，表里列 16 行抽查') +
      '，错的行会标红。</p>';
    refreshHud();
  }

  function drawBuilder() {
    var prob = draftProblem(B.draft);
    var sigs = builderSignals();
    var H = builderHeight(), W = 1120;
    var s = '';
    s += '<svg class="bschem" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    s += '<defs><pattern id="bgrid" width="16" height="16" patternUnits="userSpaceOnUse">' +
      '<path d="M 16 0 L 0 0 0 16" fill="none" stroke="rgba(148,163,184,0.10)" stroke-width="1"/></pattern></defs>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#bgrid)"/>';
    // ---- 连线 ----
    function wirePath(p1, p2) {
      if (p2.x - p1.x >= 8) {
        var mx = Math.round((p1.x + p2.x) / 2);
        return 'M ' + p1.x + ' ' + p1.y + ' L ' + mx + ' ' + p1.y + ' L ' + mx + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
      }
      var by = H - 24;
      var bx = Math.max(8, p2.x - 28);
      return 'M ' + p1.x + ' ' + p1.y + ' L ' + (p1.x + 28) + ' ' + p1.y + ' L ' + (p1.x + 28) + ' ' + by +
        ' L ' + bx + ' ' + by + ' L ' + bx + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
    }
    function wireClass(v) { return v === undefined ? 'wu' : ('w' + v); }
    B.draft.gates.forEach(function (g) {
      [0, 1].forEach(function (pin) {
        var src = pin === 0 ? g.in0 : g.in1;
        if (!src) return;
        var p1 = srcPoint(src, sigs);
        var p2 = { x: g.x, y: g.y + (pin === 0 ? 14 : 38) };
        var v = srcValOf(src, sigs);
        s += '<path class="wire ' + wireClass(v) + '" data-wire="gate:' + g.id + ':' + pin + '" d="' + wirePath(p1, p2) + '"><title>点击删除这条线</title></path>';
      });
    });
    prob.outNames.forEach(function (name, i) {
      var src = B.draft.outputs[i];
      if (!src) return;
      var p1 = srcPoint(src, sigs);
      var p2 = { x: 1012, y: 60 + i * 64 + 26 };
      var v = srcValOf(src, sigs);
      s += '<path class="wire ' + wireClass(v) + '" data-wire="out:' + i + '" d="' + wirePath(p1, p2) + '"><title>点击删除这条线</title></path>';
    });
    // ---- 输入轨 ----
    prob.inNames.forEach(function (name, i) {
      var y = 60 + i * 64, v = B.inputs[i];
      var sel = B.selSrc && B.selSrc.k === 'i' && B.selSrc.idx === i;
      s += '<g class="rail-pin' + (sel ? ' sel' : '') + '" data-src="i:' + i + '">' +
        '<rect x="18" y="' + y + '" width="100" height="52" rx="6" class="rail-box"/>' +
        '<text x="68" y="' + (y + 20) + '" text-anchor="middle" class="t-pin">' + esc(name) + '</text>' +
        '<rect x="38" y="' + (y + 28) + '" width="42" height="10" rx="5" class="sw-track"/>' +
        '<circle cx="' + (38 + (v ? 32 : 10)) + '" cy="' + (y + 33) + '" r="7" class="sw-knob ' + (v ? 'on' : 'off') + '"/>' +
        '<circle cx="118" cy="' + (y + 26) + '" r="16" class="src-hit"/>' +
        '<circle cx="118" cy="' + (y + 26) + '" r="5" class="src-dot"/>' +
        '<title>点一下直接拨 0/1；点右侧小绿点选为连线源</title></g>';
    });
    // ---- 常量轨 ----
    [0, 1].forEach(function (cv) {
      var y = 60 + prob.nIn * 64 + cv * 64;
      var sel = B.selSrc && B.selSrc.k === 'c' && B.selSrc.v === cv;
      s += '<g class="rail-pin' + (sel ? ' sel' : '') + '" data-src="c:' + cv + '">' +
        '<rect x="18" y="' + y + '" width="100" height="52" rx="6" class="rail-box"/>' +
        '<text x="68" y="' + (y + 30) + '" text-anchor="middle" class="t-pin">常量 ' + cv + '</text>' +
        '<circle cx="118" cy="' + (y + 26) + '" r="16" class="src-hit"/>' +
        '<circle cx="118" cy="' + (y + 26) + '" r="5" class="src-dot"/>' +
        '<title>点击选为连线源</title></g>';
    });
    // ---- 门 ----
    B.draft.gates.forEach(function (g) {
      var sel = B.selGate === g.id;
      var outSel = B.selSrc && B.selSrc.k === 'g' && B.selSrc.id === g.id;
      var v = sigs.gateVal[g.id];
      s += '<g class="bgate' + (sel ? ' sel' : '') + '" data-gate="' + g.id + '" transform="translate(' + g.x + ',' + g.y + ')">' +
        '<path d="M 8 6 L 56 6 A 20 20 0 0 1 56 46 L 8 46 Z" class="gate-body"/>' +
        '<text x="30" y="32" text-anchor="middle" class="t-gate">&amp;</text>' +
        '<text x="50" y="10" text-anchor="middle" class="t-gid">#' + g.id + '</text>' +
        '<line x1="0" y1="14" x2="8" y2="14" class="stub ' + wireClass(srcValOf(g.in0, sigs)) + '"/>' +
        '<line x1="0" y1="38" x2="8" y2="38" class="stub ' + wireClass(srcValOf(g.in1, sigs)) + '"/>' +
        '<circle cx="78" cy="26" r="3.5" class="bubble"/>' +
        '<line x1="81" y1="26" x2="100" y2="26" class="stub ' + wireClass(v) + '"/>' +
        '<circle class="pin-in" data-pin="0" cx="0" cy="14" r="6" fill="' + (g.in0 ? '#37d13a' : '#475569') + '"><title>输入 1' + (g.in0 ? '（已接，点击换线请先删线）' : '（空）') + '</title></circle>' +
        '<circle class="pin-in" data-pin="1" cx="0" cy="38" r="6" fill="' + (g.in1 ? '#37d13a' : '#475569') + '"><title>输入 2' + (g.in1 ? '（已接）' : '（空）') + '</title></circle>' +
        '<circle class="pin-out' + (outSel ? ' sel' : '') + '" data-pinout="1" cx="100" cy="26" r="6"><title>门 #' + g.id + ' 的输出' + (v === undefined ? '（未知）' : ' = ' + v) + '，点击选为连线源</title></circle>' +
        '</g>';
    });
    // ---- 输出轨 ----
    prob.outNames.forEach(function (name, i) {
      var y = 60 + i * 64;
      var v = sigs.outVal[i];
      var has = !!B.draft.outputs[i];
      s += '<g class="rail-pin out' + (has ? '' : ' empty') + '" data-out="' + i + '">' +
        '<rect x="1012" y="' + y + '" width="90" height="52" rx="6" class="rail-box"/>' +
        '<circle cx="1012" cy="' + (y + 26) + '" r="5" class="src-dot"/>' +
        '<circle cx="1058" cy="' + (y + 26) + '" r="10" class="led-dot ' + (v === 1 ? 'on' : 'off') + '"/>' +
        '<text x="1058" y="' + (y + 48) + '" text-anchor="middle" class="t-pin">' + esc(name) + (v === undefined ? '' : ' = ' + v) + '</text>' +
        '<title>' + (has ? '已接。点击换线请先点已有的线删除。' : '空输出脚：先选一个门的输出，再点这里') + '</title></g>';
    });
    s += '</svg>';
    var box = $('builder-canvas');
    box.innerHTML = s;
    bindBuilderSvg(box);
    // 选中门的工具条
    var tb = $('gate-tools');
    if (B.selGate) {
      tb.innerHTML = '<span>已选门 #' + B.selGate + '</span> ' +
        '<button id="btn-del-gate">删除此门（退回 1 个晶体管）</button>';
      $('btn-del-gate').onclick = function () {
        removeGate(B.draft, B.selGate);
        SAVE.nand += 1;
        B.selGate = null;
        persistDraft();
        drawBuilder(); drawSimStrip(); refreshHud();
        setStatus('已删除门，退回 1 个晶体管。');
      };
    } else {
      tb.innerHTML = '<span class="hint">点一个门选中它（可删除）；拖动门身可移动位置。</span>';
    }
    $('gate-count').textContent = '已用 ' + B.draft.gates.length + ' 门 · 晶体管剩 ' + SAVE.nand + ' 个';
    renderCh1Meta(); // 星级进度条随门数实时更新
  }

  function bindBuilderSvg(box) {
    var svg = box.querySelector('svg.bschem');
    if (!svg) return;
    var drag = null;
    // 共享处理器：鼠标与触屏共用（第 31 轮）——手机上也要能拖门、点脚连线。
    // touchstart/touchmove 用 { passive: false } 才能 preventDefault，阻止页面滚动抢走拖拽。
    function onDown(ev, x, y) {
      var pinIn = ev.target.closest ? ev.target.closest('.pin-in') : null;
      var pinOut = ev.target.closest ? ev.target.closest('.pin-out') : null;
      var rail = ev.target.closest ? ev.target.closest('[data-src]') : null;
      var outRail = ev.target.closest ? ev.target.closest('[data-out]') : null;
      var wire = ev.target.closest ? ev.target.closest('[data-wire]') : null;
      var gate = ev.target.closest ? ev.target.closest('[data-gate]') : null;
      if (pinIn) {
        var gid = +gate.getAttribute('data-gate'), pin = +pinIn.getAttribute('data-pin');
        if (!B.selSrc) { setStatus('先点一个信号源：左侧输入脚 / 常量 / 某个门的输出，再点这个输入脚。'); return; }
        var r = connect(B.draft, B.selSrc, { k: 'gate', id: gid, pin: pin });
        if (r.ok) {
          B.selSrc = null; B.verified = null;
          persistDraft(); drawBuilder(); drawSimStrip();
        } else setStatus('接不上：' + r.reason);
        return;
      }
      if (pinOut) {
        var gid2 = +gate.getAttribute('data-gate');
        B.selSrc = { k: 'g', id: gid2 };
        B.selGate = null;
        drawBuilder();
        setStatus('已选门 #' + gid2 + ' 的输出为连线源，再点一个输入脚或输出脚。');
        return;
      }
      if (rail) {
        var parts = rail.getAttribute('data-src').split(':');
        // 第 64 轮：点输入框本体（开关、框、文字）直接拨 0/1；只有点右侧小绿点才选为连线源。
        var dot = ev.target.closest ? ev.target.closest('.src-dot, .src-hit') : null;
        if (!dot && parts[0] === 'i') {
          var ii = +parts[1];
          B.inputs[ii] = B.inputs[ii] ? 0 : 1;
          B.verified = null;
          drawBuilder(); drawSimStrip();
          setStatus(draftProblem(B.draft).inNames[ii] + ' 已拨到 ' + B.inputs[ii] + '。');
          return;
        }
        B.selSrc = parts[0] === 'i' ? { k: 'i', idx: +parts[1] } : { k: 'c', v: +parts[1] };
        B.selGate = null;
        drawBuilder();
        setStatus('已选信号源：' + (parts[0] === 'i' ? draftProblem(B.draft).inNames[+parts[1]] : '常量 ' + parts[1]) + '。再点一个输入脚或输出脚连线。');
        return;
      }
      if (outRail) {
        var oi = +outRail.getAttribute('data-out');
        if (!B.selSrc) { setStatus('先选一个门的输出作为连线源，再点输出脚。'); return; }
        var r2 = connect(B.draft, B.selSrc, { k: 'output', idx: oi });
        if (r2.ok) {
          B.selSrc = null; B.verified = null;
          persistDraft(); drawBuilder(); drawSimStrip();
        } else setStatus('接不上：' + r2.reason);
        return;
      }
      if (wire) {
        var w = wire.getAttribute('data-wire').split(':');
        if (w[0] === 'gate') disconnect(B.draft, { k: 'gate', id: +w[1], pin: +w[2] });
        else disconnect(B.draft, { k: 'output', idx: +w[1] });
        B.verified = null;
        persistDraft(); drawBuilder(); drawSimStrip();
        setStatus('已删除这条线。');
        return;
      }
      if (gate) {
        var g = gateById(B.draft, +gate.getAttribute('data-gate'));
        if (!g) return;
        drag = { id: g.id, startX: x, startY: y, origX: g.x, origY: g.y, moved: false };
      }
    }
    function onMove(x, y) {
      if (!drag) return;
      var dx = x - drag.startX, dy = y - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      var g = gateById(B.draft, drag.id);
      if (!g) return;
      g.x = Math.max(260, Math.min(940, drag.origX + dx));
      g.y = Math.max(20, Math.min(builderHeight() - 80, drag.origY + dy));
      var el = svg.querySelector('[data-gate="' + g.id + '"]');
      if (el) el.setAttribute('transform', 'translate(' + g.x + ',' + g.y + ')');
    }
    function onUp() {
      if (!drag) return;
      var g = gateById(B.draft, drag.id);
      if (drag.moved && g) { persistDraft(); drawBuilder(); }
      else if (g) { B.selGate = g.id; B.selSrc = null; drawBuilder(); }
      drag = null;
    }
    svg.addEventListener('mousedown', function (ev) { onDown(ev, ev.clientX, ev.clientY); });
    svg.addEventListener('mousemove', function (ev) { onMove(ev.clientX, ev.clientY); });
    svg.addEventListener('mouseup', function () { onUp(); });
    svg.addEventListener('mouseleave', function () {
      if (drag && drag.moved) { persistDraft(); drawBuilder(); }
      drag = null;
    });
    svg.addEventListener('touchstart', function (ev) {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      var t = ev.touches[0];
      onDown(ev, t.clientX, t.clientY);
    }, { passive: false });
    svg.addEventListener('touchmove', function (ev) {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      var t = ev.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: false });
    svg.addEventListener('touchend', function (ev) { ev.preventDefault(); onUp(); }, { passive: false });
    svg.addEventListener('touchcancel', function () { drag = null; });
  }

  function drawSimStrip() {
    var prob = draftProblem(B.draft);
    var sigs = builderSignals();
    var el = $('sim-strip');
    var html = prob.inNames.map(function (name, i) {
      return '<button class="hsw' + (B.inputs[i] ? ' on' : ' off') + '" data-i="' + i + '">' +
        '<span class="hsw-track"><span class="hsw-knob"></span></span>' +
        '<span class="hsw-label">' + esc(name) + ' = ' + B.inputs[i] + '</span></button>';
    }).join('');
    html += prob.outNames.map(function (name, i) {
      var v = sigs.outVal[i];
      return '<span class="hled' + (v === 1 ? ' on' : v === 0 ? ' off' : ' unk') + '"><span class="hled-dot"></span>' +
        '<span class="hled-label">' + esc(name) + ' = ' + (v === undefined ? '?' : v) + '</span></span>';
    }).join('');
    html += '<span class="io-bits">输入 ' + T.bitsToString(B.inputs) + ' → 输出 ' +
      sigs.outVal.map(function (v) { return v === undefined ? '?' : v; }).join('') +
      (sigs.complete ? '' : '（电路还没接完）') + '</span>';
    el.innerHTML = html;
    Array.prototype.forEach.call(el.querySelectorAll('.hsw'), function (btn) {
      btn.onclick = function () {
        var i = +btn.getAttribute('data-i');
        B.inputs[i] = B.inputs[i] ? 0 : 1;
        drawBuilder(); drawSimStrip();
      };
    });
  }

  function renderTruthTable() {
    var prob = draftProblem(B.draft);
    var v = B.verified;
    var panel = $('tt-panel');
    if (!v || !v.ok) {
      panel.innerHTML = '<p class="hint">点「验货」跑完整真值表，错的行会标红。</p>';
      return;
    }
    var failSet = {};
    v.failures.forEach(function (f) { failSet[f.inputs.join('')] = f; });
    var rows = prob.rows === 'all' ? allInputRows(prob.nIn) : sampleInputRows(prob);
    var html = '<p>' + (v.passed === v.total
      ? '<b class="pass">✓ 真值表全过：' + v.passed + '/' + v.total + ' 行。</b>'
      : '<b class="fail">✗ 真值表 ' + v.passed + '/' + v.total + ' 行通过，' + v.failures.length + ' 行错（标红）。</b>') +
      (prob.rows === 'sample' ? ' 表里只列 16 行抽查，实际全验了 512 行。' : '') + '</p>';
    html += '<table class="tt"><thead><tr><th>' + prob.inNames.map(esc).join('</th><th>') + '</th><th>|</th><th>' +
      prob.outNames.map(esc).join('</th><th>') + '</th><th>期望</th><th>实际</th></tr></thead><tbody>';
    rows.forEach(function (inp) {
      var exp = prob.truth(inp);
      var comp = compileDraft(B.draft);
      var act = comp.ok ? evaluateCompiled(comp, inp).outputs : null;
      var bad = failSet[inp.join('')];
      html += '<tr class="' + (bad ? 'bad' : 'good') + '"><td>' + inp.join('</td><td>') + '</td><td>|</td><td>' +
        (act ? act.join('</td><td>') : '—') + '</td><td>' + exp.join('') + '</td><td>' +
        (act ? act.join('') : '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    panel.innerHTML = html;
  }

  function bindCh1Toolbar() {
    $('btn-add-gate').onclick = function () {
      if (SAVE.nand < 1) { setStatus('晶体管不够了：删掉草稿里的门可以回收 1 个晶体管（每门 1 个）。'); return; }
      var pos = gateDefaultPos(B.draft.gates.length);
      addGate(B.draft, 0, pos.x, pos.y);
      SAVE.nand -= 1;
      B.verified = null;
      persistDraft(); drawBuilder(); drawSimStrip(); refreshHud();
      setStatus('已放一个 NAND 门（花 1 个晶体管）。点左侧信号源，再点门的输入脚连线。');
    };
    $('btn-verify').onclick = function () {
      var v = verifyTruthTable(B.draft);
      B.verified = v;
      if (!v.ok) {
        setStatus('还不能验货：' + v.reason);
        renderTruthTable();
        return;
      }
      var prob = draftProblem(B.draft);
      if (v.passed === v.total) {
        var stars = starFor(B.draft.gates.length, prob.par, prob.limit);
        var prev = SAVE.passed[prob.id];
        if (!prev || B.draft.gates.length < prev.gates) {
          SAVE.passed[prob.id] = { gates: B.draft.gates.length, stars: stars };
          if (stars > (SAVE.stars[prob.id] || 0)) SAVE.stars[prob.id] = stars;
          save();
        }
        setStatus('✓ ' + prob.name + ' 真值表全过！' + B.draft.gates.length + ' 门，' + stars + ' 星。可以去流片了。');
        playChime('pass');
      } else {
        setStatus('✗ 真值表 ' + v.passed + '/' + v.total + ' 行通过，红行是错的地方，对照期望输出改改接线。');
      }
      renderTruthTable();
      renderCh1Meta();
    };
    $('btn-to-tapeout').onclick = function () {
      if (!B.verified || !B.verified.ok || B.verified.passed !== B.verified.total) {
        setStatus('先点「验货」，真值表全过才能流片。');
        return;
      }
      switchView('tapeout');
    };
    $('btn-clear-draft').onclick = function () {
      var n = B.draft.gates.length;
      showModal('<h3>清空这块画布？</h3><p>会删掉全部 ' + n + ' 个门，退回 ' + n + ' 个晶体管。已通过的记录不受影响。</p>' +
        '<div class="modal-btns"><button class="btn-primary" id="m-clear-yes">清空并退回晶体管</button>' +
        '<button id="m-clear-no">取消</button></div>', function () {
        $('m-clear-yes').onclick = function () {
          SAVE.nand += n;
          B.draft = newDraft(B.problemId);
          SAVE.drafts[B.problemId] = B.draft;
          B.verified = null;
          save();
          closeModal();
          renderCh1();
          setStatus('画布已清空，退回 ' + n + ' 个晶体管。');
        };
        $('m-clear-no').onclick = closeModal;
      });
    };
  }
  function renderCh1Meta() {
    var prob = draftProblem(B.draft);
    var gates = B.draft.gates.length;
    // 星级进度条：门越少越接近 3 星线（Opus Magnum 式“指标即时可见”）
    var pct = Math.round(Math.min(100, prob.par / Math.max(gates, 1) * 100));
    $('ch1-meta').innerHTML = '门数标准：3 星 ≤ ' + prob.par + ' 门 · 2 星 ≤ ' + (prob.par + 2) +
      ' 门 · 通过 ≤ ' + prob.limit + ' 门。晶体管：每放一个 NAND 门花 1 个，删门退回 1 个。' +
      (SAVE.passed[prob.id] ? ' 已通过：最佳 ' + SAVE.passed[prob.id].gates + ' 门 · ' + SAVE.passed[prob.id].stars + ' 星。' : '') +
      '<span class="star-bar" title="当前 ' + gates + ' 门，3 星线 ' + prob.par + ' 门"><span class="star-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="hint">当前 ' + gates + ' 门 · 3 星线 ' + prob.par + ' 门</span>' +
      '<br><span class="hint">总账：已通 ' + bestGatesTotal(SAVE).done + '/' + PROBLEMS.length + ' 道 · 你的最佳总门数 ' +
      bestGatesTotal(SAVE).gates + ' · 标准解总门数 ' + parTotal() + '（par 合计）。</span>';
  }

  /* ================= 第二章：流片 ================= */
  function renderTapeout() {
    var list = PROBLEMS.map(function (p) {
      var passed = SAVE.passed[p.id];
      var hasDraft = !!SAVE.drafts[p.id] && SAVE.drafts[p.id].gates && SAVE.drafts[p.id].gates.length > 0;
      var taped = SAVE.taped.filter(function (c) { return c.problemId === p.id; });
      var html = '<section class="panel"><h3>' + p.name + '</h3><p>' + esc(p.teach) + '</p>';
      if (!passed) {
        html += '<p class="hint">还没通过这道题。去任务板，搭出电路、真值表全过，就能来流片。</p>';
      } else {
        html += '<p>最佳成绩：' + passed.gates + ' 门 · ' + passed.stars + ' 星。已流片 ' + taped.length + ' 张。</p>';
        if (hasDraft) {
          html += '<p>画布上有 ' + SAVE.drafts[p.id].gates.length + ' 门的草稿（未流片的版本）。</p>' +
            '<button class="btn-primary" data-tape="' + p.id + '">🔥 流片这张草稿</button>';
        } else {
          html += '<p class="hint">画布上没有草稿——想再流一片，去任务板重新搭一个（通过后回来）。</p>';
        }
      }
      html += '</section>';
      return html;
    }).join('');
    $('tapeout-list').innerHTML = list;
    Array.prototype.forEach.call($('tapeout-list').querySelectorAll('[data-tape]'), function (b) {
      b.onclick = function () { startTapeOut(b.getAttribute('data-tape')); };
    });
    // 已流片的卡片收藏
    var grid = SAVE.taped.length ? SAVE.taped.map(function (c) {
      return '<div class="nft-card" data-card="' + c.id + '">' +
        '<div class="nft-name">' + esc(c.name) + '</div>' +
        '<div class="nft-gates">' + c.gates + ' NAND · ' + c.nIn + ' 入 ' + c.nOut + ' 出</div>' +
        '<div class="nft-stars">' + '★'.repeat(c.stars) + '☆'.repeat(3 - c.stars) + '</div>' +
        '<div class="nft-sha">SHA ' + c.sha.slice(0, 14) + '…' + c.sha.slice(-6) + '</div>' +
        '<div class="nft-day">第 ' + c.day + ' 天流片</div></div>';
    }).join('') : '<p class="hint">还没有流片卡。流片后，电路变成一张改不了的卡，出现在这里。</p>';
    $('taped-grid').innerHTML = grid;
    Array.prototype.forEach.call($('taped-grid').querySelectorAll('.nft-card'), function (el) {
      el.onclick = function () { showCardDetail(el.getAttribute('data-card')); };
    });
    refreshHud();
  }
  function startTapeOut(problemId) {
    var d = SAVE.drafts[problemId];
    if (!d || !d.gates || !d.gates.length) { setStatus('草稿没了，先去任务板重新搭。'); return; }
    var v = verifyTruthTable(d);
    if (!v.ok) { setStatus('流片前先验货：' + v.reason + '——去任务板把电路接完。'); return; }
    if (v.passed !== v.total) { setStatus('真值表还没全过（' + v.passed + '/' + v.total + '），修好再流片。'); return; }
    var comp = compileDraft(d);
    var card = tapeOutCard(d, SAVE.day);
    var n = d.gates.length;
    showModal('<h3>🔥 流片仪式</h3><div id="ritual-steps"><p>① 正在把 ' + n + ' 个晶体管焊进芯片……</p></div>',
      function () {
        setTimeout(function () {
          var el = $('ritual-steps');
          if (!el) return;
          el.innerHTML += '<p>② 蓝图卷起，盖章：这份网表从此改不了了——真芯片也一样。</p>';
        }, 900);
        setTimeout(function () {
          var el = $('ritual-steps');
          if (!el) return;
          el.innerHTML += '<p>③ SHA-256 刻在卡上：' + card.card.sha.slice(0, 22) + '…</p>';
          setTimeout(function () {
            // 烧掉草稿（晶体管已焊进芯片，不退回）
            delete SAVE.drafts[problemId];
            SAVE.taped.push(card.card);
            save();
            closeModal();
            showCardDetail(card.card.id);
            renderTapeout();
            setStatus('✓ 流片完成！' + card.card.name + ' 已变成一张电路 NFT 卡，草稿已烧掉，改不了了。');
          }, 900);
        }, 1800);
      });
  }
  function showCardDetail(cardId) {
    var c = SAVE.taped.find(function (x) { return x.id === cardId; });
    if (!c) return;
    var miner = SAVE.miners.find(function (m) { return m.cardId === cardId; });
    showModal('<h3>' + esc(c.name) + ' · 电路 NFT 卡</h3>' +
      '<div class="card-detail">' +
      '<p><b>' + c.gates + ' NAND</b> · ' + c.nIn + ' 入 ' + c.nOut + ' 出 · ' + '★'.repeat(c.stars) + '☆'.repeat(3 - c.stars) + '</p>' +
      '<p>网表 SHA-256：<code>' + c.sha + '</code></p>' +
      '<p>流片：游戏内第 ' + c.day + ' 天。</p>' +
      '<p class="hint">这张卡是游戏内的纪念卡。真实的 TapeOut 链上电路 NFT 是另一种东西（Test1 那种，见卡片馆）；不要把两者混为一谈。</p>' +
      (miner ? '<p>已注册为矿机（' + (miner.processor === 'behemoth' ? 'Behemoth ×6' : 'TapeOut ×1') + '），在矿场里结算。</p>'
        : '<p>还没注册为矿机。</p>') +
      '</div><div class="modal-btns">' +
      '<button class="btn-primary" id="m-to-mining">去矿场注册</button>' +
      '<button id="m-close">关闭</button></div>',
      function () {
        $('m-close').onclick = closeModal;
        $('m-to-mining').onclick = function () { closeModal(); switchView('mining'); };
      });
  }

  /* ================= 第三章：挖矿 ================= */
  function renderMining() {
    var html = '<p class="formula">每天产出 = 你的权重 ÷ 全网权重 × 7,200（游戏 BEM）</p>' +
      '<p class="hint">权重 = 电路的 NAND+LATCH 数 × 处理器系数（Behemoth ×6、TapeOut ×1）。' +
      '全网每天固定产 7,200 游戏 BEM——和真实规则一样：真实 TapeOut 每天全网固定产 7,200 BEM。' +
      '游戏里的 BEM 是<b>游戏币，不是真实 BEM</b>，不能提现、不能兑换。</p>' +
      '<p class="hint">真实数字快照（2026-11-24）：真实全网注册矿机 20,981 台、累计挖出 599,651.51 BEM、BEM 现价约 $8.53。</p>';
    var w = SAVE.miners.reduce(function (acc, m) {
      var c = SAVE.taped.find(function (x) { return x.id === m.cardId; });
      return acc + (c ? minerWeight(c, m.processor) : 0);
    }, 0);
    html += '<p class="pool">你的矿机总权重 <b>' + w + '</b> · 按当前全网权重 ' + SAVE.totalWeight +
      ' 算，合计日产 <b>' + dailyOutput(w, SAVE.totalWeight).toFixed(2) + ' 游戏 BEM</b>（联合矿池口径：所有矿机算在一起）。</p>';
    if (!SAVE.taped.length) {
      html += '<p class="hint">还没有电路卡。先去流片厂流一片。</p>';
    }
    html += SAVE.taped.map(function (c) {
      var m = SAVE.miners.find(function (x) { return x.cardId === c.id; });
      var beOk = c.nand >= 20;
      var wB = minerWeight(c, 'behemoth'), wT = minerWeight(c, 'tapeout');
      var cur = m ? minerWeight(c, m.processor) : 0;
      var line = '<section class="panel miner"><h3>' + esc(c.name) + ' · ' + c.gates + ' NAND</h3>';
      if (!m) {
        line += '<p>还没注册。选一台处理器：</p>' +
          '<label><input type="radio" name="proc-' + c.id + '" value="behemoth"' + (beOk ? '' : ' disabled') + '> Behemoth ×6' +
          (beOk ? '（权重 ' + wB + '，日产约 ' + dailyOutput(wB, SAVE.totalWeight).toFixed(2) + '）' : '（要 20 门以上，你的卡只有 ' + c.nand + ' 门）') + '</label><br>' +
          '<label><input type="radio" name="proc-' + c.id + '" value="tapeout" checked> TapeOut ×1（权重 ' + wT +
          '，日产约 ' + dailyOutput(wT, SAVE.totalWeight).toFixed(2) + '）</label><br>' +
          '<button class="btn-primary" data-reg="' + c.id + '">注册为矿机</button>' +
          '<p class="hint">Behemoth 的 20 门门槛是游戏设定。真实规则：处理器只影响系数（Behemoth ×6、TapeOut ×1），没有门数门槛。</p>';
      } else {
        line += '<p>已注册：' + (m.processor === 'behemoth' ? 'Behemoth ×6' : 'TapeOut ×1') +
          ' · 权重 ' + cur + ' · 日产约 ' + dailyOutput(cur, SAVE.totalWeight).toFixed(2) + ' 游戏 BEM。</p>' +
          '<button data-unreg="' + c.id + '">注销这台矿机</button>';
      }
      line += '</section>';
      return line;
    }).join('');
    html += '<div class="settle"><button class="btn-primary" id="btn-settle">⏭ 结算一天</button> ' +
      '<span id="settle-result">' + (SAVE.day ? '当前第 ' + SAVE.day + ' 天，累计 ' + SAVE.bem.toFixed(2) + ' 游戏 BEM。' : '还没结算过。') + '</span></div>';
    // 结算账本：最近 7 天每天一行（第 13 轮）
    var ledger = SAVE.ledger || [];
    html += '<section class="panel"><h3>📒 结算账本（最近 7 天）</h3>';
    if (!ledger.length) {
      html += '<p class="hint">还没结算过，账本是空的。点「结算一天」，每天的收入会记在这里。</p>';
    } else {
      html += '<table class="ledger"><tr><th>天</th><th>矿机</th><th>工厂</th><th>自己的币</th><th>当日总计</th><th>余额</th></tr>' +
        ledger.map(function (r) {
          return '<tr><td>第 ' + r.day + ' 天</td><td>' + r.mine.toFixed(2) + '</td><td>' + r.factory.toFixed(2) +
            '</td><td>' + r.token.toFixed(2) + '</td><td>' + (r.mine + r.factory).toFixed(2) +
            '</td><td>' + r.bem.toFixed(2) + '</td></tr>';
        }).join('') + '</table><p class="hint">单位都是游戏 BEM（游戏币，不是真实 BEM）。</p>';
    }
    html += '</section>';
    $('mining-list').innerHTML = html;
    Array.prototype.forEach.call($('mining-list').querySelectorAll('[data-reg]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-reg');
        var sel = $('mining-list').querySelector('input[name="proc-' + id + '"]:checked');
        var proc = sel ? sel.value : 'tapeout';
        SAVE.miners.push({ cardId: id, processor: proc });
        save();
        renderMining();
        setStatus('✓ 已注册为矿机（' + (proc === 'behemoth' ? 'Behemoth ×6' : 'TapeOut ×1') + '）。点「结算一天」看它产多少游戏 BEM。');
      };
    });
    Array.prototype.forEach.call($('mining-list').querySelectorAll('[data-unreg]'), function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-unreg');
        SAVE.miners = SAVE.miners.filter(function (m) { return m.cardId !== id; });
        save();
        renderMining();
        setStatus('已注销这台矿机。');
      };
    });
    var sb = $('btn-settle');
    if (sb) sb.onclick = function () {
      var r = settleDay(SAVE);
      save();
      var lines = '第 ' + r.day + ' 天结算：' + r.lines.map(function (l) {
        return l.cardName + '（' + l.processor + '）产 ' + l.out.toFixed(2);
      }).join('，');
      $('settle-result').textContent = lines + '。合计 ' + r.total.toFixed(2) + ' 游戏 BEM，全网权重涨到 ' + r.totalWeight + '。';
      if (r.total + r.factoryTotal > 0) playChime('coin');
      renderMining();
      setStatus('✓ ' + lines + '。');
    };
    refreshHud();
  }

  /* ================= 第四章：集市 ================= */
  function renderMarket() {
    $('market-hold').innerHTML = '你现在有 <b>' + SAVE.bem.toFixed(2) + ' 游戏 BEM</b> · ' + SAVE.nand + ' NAND · ' + SAVE.latch +
      ' LATCH · 第 ' + SAVE.day + ' 天。花掉的游戏 BEM 不会回来——和真实生态一样，BEM 花出去才是价值。';
    // 零件铺
    $('stall-parts').innerHTML = '<h3>🏪 零件铺 · 用游戏 BEM 买晶体管</h3>' +
      '<p class="hint">真实规则：新处理器的晶体管只收 BEM。买来的零件进你的库存，第一章画电路就能用。</p>' +
      MARKET_ITEMS.map(function (it) {
        var afford = SAVE.bem >= it.cost;
        return '<div class="stall-row"><span><b>' + esc(it.name) + '</b> — ' + it.cost + ' 游戏 BEM</span>' +
          '<button class="btn-primary" data-buy="' + it.id + '"' + (afford ? '' : ' disabled') + '>买</button></div>';
      }).join('') +
      '<p class="hint" id="parts-msg"></p>';
    Array.prototype.forEach.call($('stall-parts').querySelectorAll('[data-buy]'), function (b) {
      b.onclick = function () {
        var r = buyParts(SAVE, b.getAttribute('data-buy'));
        if (r.ok) {
          save();
          setStatus('✓ 买到了 ' + r.item.name + '，花了 ' + r.item.cost + ' 游戏 BEM。');
          renderMarket(); refreshHud();
        } else {
          $('parts-msg').textContent = r.reason;
          setStatus('买不了：' + r.reason);
        }
      };
    });
    // DeWEB 小镇
    var sites = SAVE.sites.length ? SAVE.sites.map(function (s) {
      return '<div class="stall-row"><span><b>' + esc(s.name) + '</b> · <code>' + s.addr + '</code> · 第 ' + s.day + ' 天开张</span>' +
        '<button data-site="' + esc(s.slug) + '">进店看看</button></div>';
    }).join('') : '<p class="hint">你还没开过网站。开一家自己的链上网站，访客能在游戏里真的点开它。</p>';
    $('stall-deweb').innerHTML = '<h3>🌐 DeWEB 小镇 · 开一家自己的链上网站</h3>' +
      '<p class="hint">真实规则：DeWEB 网站文件存在电路容器里，地址格式 tape://…，TapeKit 浏览器直读链上文件、逐字节验 SHA-256。开店费 ' + SITE_COST_BEM + ' 游戏 BEM（游戏设定）。</p>' +
      sites +
      '<div class="stall-row"><input id="site-name" type="text" maxlength="20" placeholder="给你的网站起个名字，如 阿杰的芯片铺" style="flex:1">' +
      '<button class="btn-primary" id="btn-open-site">开店（' + SITE_COST_BEM + ' 游戏 BEM）</button></div>' +
      '<p class="hint" id="site-msg"></p>';
    $('btn-open-site').onclick = function () {
      var r = openSite(SAVE, $('site-name').value);
      if (r.ok) {
        save();
        setStatus('✓ 你的网站开张了：' + r.site.addr);
        renderMarket(); refreshHud();
      } else {
        $('site-msg').textContent = r.reason;
        setStatus('开不了店：' + r.reason);
      }
    };
    Array.prototype.forEach.call($('stall-deweb').querySelectorAll('[data-site]'), function (b) {
      b.onclick = function () { showSite(b.getAttribute('data-site')); };
    });
    // TapeRelay 中继站
    $('stall-relay').innerHTML = '<h3>📡 中继站 · TapeRelay</h3>' +
      '<p class="hint">真实规则：每电路每节点 5 GiB 免费；超额存储 2 GiB / 90 天 = 0.2 BEM；消息端到端加密、传送不花 gas，节点看不到内容。你现在有 <b>' +
      (RELAY_FREE_GIB + SAVE.relayGiB) + ' GiB</b>（免费 5 GiB + 已购 ' + SAVE.relayGiB + ' GiB）。</p>' +
      '<div class="stall-row"><span>加购 2 GiB 存储（90 天）— 0.2 游戏 BEM</span>' +
      '<button class="btn-primary" id="btn-relay-buy">加购</button></div>' +
      '<p class="hint" id="relay-msg"></p>' +
      '<div class="stall-row"><input id="relay-text" type="text" maxlength="60" placeholder="写一条加密消息，如 今晚八点开图" style="flex:1">' +
      '<button id="btn-relay-send">🔒 加密发送（演示）</button></div>' +
      '<p class="hint">演示：真实 TapeRelay 是端到端加密，这里只演示“密文 + 指纹”的样子；传送不花 gas（游戏里也不花）。</p>' +
      '<p class="hint" id="relay-out"></p>';
    $('btn-relay-buy').onclick = function () {
      var r = relayBuyStorage(SAVE);
      if (r.ok) {
        save();
        setStatus('✓ 已加购 2 GiB，现在共 ' + r.totalGiB + ' GiB。');
        renderMarket(); refreshHud();
      } else {
        $('relay-msg').textContent = r.reason;
        setStatus('加购失败：' + r.reason);
      }
    };
    $('btn-relay-send').onclick = function () {
      var txt = $('relay-text').value.trim();
      if (!txt) { $('relay-out').textContent = '先写点什么再发送。'; return; }
      var d = relayEncryptDemo(txt);
      $('relay-out').innerHTML = '✓ 已发送（演示）：密文 <code>' + d.cipher.slice(0, 48) + (d.cipher.length > 48 ? '…' : '') + '</code><br>指纹 <code>' +
        d.fingerprint.slice(0, 22) + '…</code> · 中继节点看不到原文 · 传送 0 gas';
      setStatus('✓ 加密消息已发送（演示）。节点只能看到密文，看不到你写了什么。');
    };
    // tapeXO 抽奖亭
    var lot = SAVE.lottery;
    var lotHtml = '<h3>🎰 抽奖亭 · tapeXO 可验证抽奖</h3>' +
      '<p class="hint">真实规则：参与名单事前固定、哈希上链；用承诺的随机种子哈希 → 延迟揭示种子 → 之后区块哈希算中奖者，任何人都能重算验证。参加免费（真实 tapeXO 也是免费参加），中奖 +2 游戏 BEM，每天限 1 次。</p>';
    if (lot.day === SAVE.day && lot.entered) {
      lotHtml += '<p>今天已经参加过了。中奖者：<b>' + esc(lot.winner) + '</b>' + (lot.won ? ' —— 就是你！+2 游戏 BEM 已到账。' : '（不是你，明天再来）') + '</p>' +
        '<p class="hint">名单哈希 <code>' + lot.listHash.slice(0, 22) + '…</code> · 种子承诺 <code>' + lot.seedHash.slice(0, 22) + '…</code> · 开奖哈希 <code>' + lot.drawHash.slice(0, 22) + '…</code><br>' +
        '验证方法：开奖哈希 = SHA-256(种子 | 参与名单)，前 8 位 hex 取模得中奖序号——名单共 ' + lotteryParticipants().length + ' 人。</p>';
    } else {
      lotHtml += '<p>今天还没参加。参与者：你 + 7 位小镇居民（名单赛前固定）。</p>' +
        '<button class="btn-primary" id="btn-lottery">免费参加今天的抽奖</button> <span id="lottery-result" class="hint"></span>';
    }
    $('stall-lottery').innerHTML = lotHtml;
    var lb = $('btn-lottery');
    if (lb) lb.onclick = function () {
      var r = lotteryEnter(SAVE);
      if (!r.ok) { $('lottery-result').textContent = r.reason; setStatus(r.reason); return; }
      save();
      renderMarket(); refreshHud();
      setStatus(r.won ? '🎉 中奖了！就是你，+2 游戏 BEM。' : '开奖了，中奖者是 ' + r.winner + '（不是你，明天再来）。');
    };
    refreshHud();
  }
  function showSite(slug) {
    var s = SAVE.sites.find(function (x) { return x.slug === slug; });
    if (!s) return;
    var cards = SAVE.taped.length ? SAVE.taped.map(function (c) {
      return '<li>' + esc(c.name) + ' · ' + c.gates + ' NAND · ★'.repeat(c.stars) + '☆'.repeat(3 - c.stars) + '</li>';
    }).join('') : '<li>还没流片过任何电路——先去流片厂流一片，网站就有货了。</li>';
    showModal('<h3>🌐 ' + esc(s.name) + '</h3><p><code>' + s.addr + '</code> · 第 ' + s.day + ' 天开张</p>' +
      '<p>这是你在 DeWEB 小镇开的链上网站（游戏内演示）：卖的是你自己流片的电路卡。</p>' +
      '<ul>' + cards + '</ul>' +
      '<p class="hint">真实 DeWEB：网站文件存在电路容器里，TapeKit 浏览器直读链上文件、逐字节验 SHA-256。这里是游戏内的样子，不连真实链。</p>' +
      '<div class="modal-btns"><button id="m-close">关闭</button></div>',
      function () { $('m-close').onclick = closeModal; });
  }

  /* ================= 终章：点亮 CPU ================= */
  // 你的 CPU 是一台真电路：buildCounterCircuit() 的 4 位计数器（25 NAND + 4 LATCH），
  // 走 TapeSim peek/beat 真仿真。时钟一拍 = 一个区块（Behemoth 的时钟就是区块生产，
  // 约 2.22 Hz）；跑满 16 拍（0→15 完整数一圈）即点亮。
  // 诚实说明：你的计数器是 29 门的演示规模；真正的 Behemoth 约 2,300 门。
  var CPU = { circuit: null, sha: '', state: [0, 0, 0, 0], timer: null };
  function cpuCircuit() {
    if (!CPU.circuit) {
      var b = buildCounterCircuit();
      if (!b.ok) return null;
      CPU.circuit = b.circuit;
      CPU.sha = b.sha;
    }
    return CPU.circuit;
  }
  function cpuStateFromCount(count) {
    return [count & 1, (count >> 1) & 1, (count >> 2) & 1, (count >> 3) & 1];
  }
  function cpuCurrentCount() {
    var c = cpuCircuit();
    if (!c) return 0;
    return counterValue(T.peek(c, CPU.state, []).outputs);
  }
  function cpuBeatOnce() {
    var c = cpuCircuit();
    if (!c) return;
    var r = T.beat(c, CPU.state, []);
    CPU.state = r.state;
    SAVE.cpu.clock += 1;
    SAVE.cpu.count = cpuCurrentCount();
    if (SAVE.cpu.count > SAVE.cpu.best) SAVE.cpu.best = SAVE.cpu.count;
    if (SAVE.cpu.clock >= 16 && !SAVE.cpu.lit) { SAVE.cpu.lit = true; playChime('lit'); }
    save();
  }
  function cpuStopAuto() {
    if (CPU.timer) { clearInterval(CPU.timer); CPU.timer = null; }
    if (LIFE.timer) { clearInterval(LIFE.timer); LIFE.timer = null; }
  }
  function renderCpu() {
    var box = $('cpu-panel');
    if (!cpuUnlocked(SAVE)) {
      box.innerHTML = '<p class="hint">🔒 先流片一张电路卡，才能进 CPU 神殿——CPU 是用你前面攒下的电路拼起来的。</p>';
      return;
    }
    var aluCard = null;
    SAVE.taped.forEach(function (c) {
      if (!aluCard && (c.problemId === 'adder4' || c.problemId === 'fa')) aluCard = c;
    });
    var aluLine = aluCard
      ? 'ALU 用的是你流片的《' + esc(aluCard.name) + '》（' + aluCard.gates + ' NAND，★'.repeat(aluCard.stars) + '☆'.repeat(3 - aluCard.stars) + '）。'
      : 'ALU 用厂里标准全加器图纸（你还没流片过加法器——去任务板做一道，CPU 就用上你自己的电路）。';
    var html = '<p>' + aluLine + '</p>' +
      '<p class="hint">这台 CPU 的核心是一台真电路：4 位二进制计数器，25 NAND + 4 LATCH，网表 SHA-256 <code>' +
      (cpuCircuit() ? CPU.sha.slice(0, 18) + '…' : '—') + '</code>。时钟一拍 = 一个区块；跑满 16 拍（0→15 数一圈）即点亮。' +
      '诚实说明：你的计数器是 29 门的演示规模；真正的 Behemoth 约 2,300 门、对标 Intel 4004。</p>';
    if (!SAVE.cpu.powered) {
      html += '<div class="panel"><h3>⚡ 上电</h3><p>点“上电”，时钟开始一拍一拍走，计数器从 0 数到 15，再回到 0——像 Behemoth 一样，只要链还在，它就一直跑，没人能关掉它。</p>' +
        '<button class="btn-primary" id="btn-cpu-power">⚡ 上电，点亮 CPU</button></div>';
      box.innerHTML = html;
      $('btn-cpu-power').onclick = function () {
        SAVE.cpu.powered = true;
        SAVE.cpu.clock = 0; SAVE.cpu.count = 0; SAVE.cpu.best = 0; SAVE.cpu.lit = false;
        CPU.state = [0, 0, 0, 0];
        save();
        renderCpu();
        setStatus('✓ CPU 已上电。点“运行一拍”，看计数器走起来。');
      };
      return;
    }
    CPU.state = cpuStateFromCount(SAVE.cpu.count);
    var c = cpuCircuit();
    var sim = T.peek(c, CPU.state, []);
    var bits = sim.outputs.slice().reverse(); // 显示顺序 q3 q2 q1 q0
    html += '<div class="toolbar"><button id="btn-mode-counter" class="btn-primary">🔢 计数器</button>' +
      '<button id="btn-mode-life">🧬 生命游戏</button></div>' +
      '<div class="panel"><h3>🔌 运行中 · 时钟 ' + SAVE.cpu.clock + ' 拍</h3>' +
      '<div class="cpu-leds">' + bits.map(function (b, i) {
        return '<span class="cpu-led' + (b ? ' on' : '') + '"><span class="cpu-dot"></span><span class="cpu-bit">q' + (3 - i) + ' = ' + b + '</span></span>';
      }).join('') + '</div>' +
      '<p class="cpu-count">计数 = <b>' + SAVE.cpu.count + '</b>（二进制 ' + bits.join('') + '）· 最高数到过 ' + SAVE.cpu.best + '</p>' +
      '<p>点亮进度：' + Math.min(SAVE.cpu.clock, 16) + ' / 16 拍' + (SAVE.cpu.lit ? ' —— <b class="pass">✓ 已点亮！</b>' : '') + '</p>' +
      '<div class="toolbar">' +
      '<button class="btn-primary" id="btn-cpu-beat">▶ 运行一拍</button>' +
      '<button id="btn-cpu-auto">' + (CPU.timer ? '⏸ 停止自动' : '▶ 自动跑（约每 0.6 秒一拍）') + '</button>' +
      '<button id="btn-cpu-reset">复位（回到 0）</button>' +
      '<button id="btn-cpu-off">断电</button></div>' +
      '<div id="cpu-board" class="diagram"></div>' +
      '<p class="hint">下面是这台 CPU 的真实原理图（29 门，信号实时流动）：D 形门是 NAND，方框是 LATCH（记住一位）。</p></div>';
    if (SAVE.cpu.lit) {
      var burned = SAVE.taped.reduce(function (a, x) { return a + x.gates; }, 0);
      html += '<div class="panel"><h3>🏆 厂长履历 · 通关结算</h3>' +
        '<p>你的 CPU 在跑。只要链还在，它就一直跑，没人能关掉它。</p>' +
        '<ul><li>流片电路卡：' + SAVE.taped.length + ' 张</li>' +
        '<li>烧掉的晶体管：' + burned + ' 个</li>' +
        '<li>累计挖到游戏 BEM：' + (SAVE.minedTotal || 0).toFixed(2) + '（游戏币，不是真实 BEM）</li>' +
        '<li>收藏 Test1 图鉴：已逛卡片馆 ' + (SAVE.visited.test1 ? '✓' : '还没去') + '</li>' +
        '<li>图鉴解锁：' + CODEX.filter(function (e) { return codexUnlocked(SAVE, e); }).length + ' / ' + CODEX.length + ' 条</li>' +
        '<li>CPU 时钟：' + SAVE.cpu.clock + ' 拍</li></ul>' +
        '<button class="btn-primary" id="btn-cpu-share">📋 复制履历去分享</button> <span id="cpu-share-msg" class="hint"></span></div>';
    }
    box.innerHTML = html;
    var board = $('cpu-board');
    if (board && c) {
      var layout = T.layoutCircuit(c);
      if (layout.tooBig) S.renderGateTable(board, c, sim.signals);
      else S.renderSchematic(board, c, layout, sim.signals, { flow: true });
    }
    $('btn-cpu-beat').onclick = function () { cpuBeatOnce(); renderCpu(); };
    $('btn-cpu-auto').onclick = function () {
      if (CPU.timer) { cpuStopAuto(); renderCpu(); return; }
      CPU.timer = setInterval(function () { cpuBeatOnce(); renderCpu(); }, 600);
      renderCpu();
      setStatus('自动跑起来了：约每 0.6 秒一拍（真实 Behemoth 约 2.22 Hz）。');
    };
    $('btn-cpu-reset').onclick = function () {
      cpuStopAuto();
      CPU.state = [0, 0, 0, 0];
      SAVE.cpu.clock = 0; SAVE.cpu.count = 0; SAVE.cpu.best = 0; SAVE.cpu.lit = false;
      save(); renderCpu();
      setStatus('CPU 已复位，计数回到 0。');
    };
    $('btn-cpu-off').onclick = function () {
      cpuStopAuto();
      SAVE.cpu.powered = false;
      save(); renderCpu();
      setStatus('CPU 已断电。再上电时从 0 重新数。');
    };
    var shareBtn = $('btn-cpu-share');
    if (shareBtn) shareBtn.onclick = function () {
      var burned = SAVE.taped.reduce(function (a, x) { return a + x.gates; }, 0);
      var text = '我在《链上造芯厂》点亮了一台 4 位 CPU：流片 ' + SAVE.taped.length + ' 张电路、烧了 ' +
        burned + ' 个晶体管、累计挖了 ' + (SAVE.minedTotal || 0).toFixed(2) + ' 游戏 BEM、时钟跑了 ' +
        SAVE.cpu.clock + ' 拍、图鉴 ' + CODEX.filter(function (e) { return codexUnlocked(SAVE, e); }).length + '/' + CODEX.length +
        ' 条。免费玩：https://4orky.github.io/tapecode-simulator/ —— TapeOut · From One NAND to a CPU。';
      var done = function () { $('cpu-share-msg').textContent = '✓ 履历已复制，去分享吧。'; };
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { $('cpu-share-msg').textContent = text; });
      } else {
        $('cpu-share-msg').textContent = text;
      }
    };
    var lifeTab = $('btn-mode-life');
    if (lifeTab) lifeTab.onclick = function () { cpuStopAuto(); renderCpuLife(); };
    refreshHud();
  }

  /* ================= 终章·其二：生命游戏界面 ================= */
  // 生命游戏是 CPU 的第二种程序：同一台 CPU，换一块电路（1,600 NAND + 16 LATCH），
  // 跑康威生命游戏。点格子摆初始图案，一拍就是一代。老存档没有 cpu.life 字段时补默认。
  var LIFE = { circuits: {}, shas: {}, size: 4, state: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], timer: null };
  function lifeSize() { return (SAVE.cpu.life && SAVE.cpu.life.size) || 4; }
  function lifeCells(n) { return n * n; }
  function lifeGateText(n) {
    return n === 6 ? '3,600 NAND + 36 LATCH' : '1,600 NAND + 16 LATCH';
  }
  function lifeCircuit() {
    var n = lifeSize();
    if (!LIFE.circuits[n]) {
      var b = buildLifeCircuit(n);
      if (!b.ok) return null;
      LIFE.circuits[n] = b.circuit;
      LIFE.shas[n] = b.sha;
    }
    return LIFE.circuits[n];
  }
  function lifeSaveGuard() {
    var n = lifeSize();
    if (!SAVE.cpu.life || !SAVE.cpu.life.cells || SAVE.cpu.life.cells.length !== n * n) {
      SAVE.cpu.life = { gen: 0, size: n, cells: new Array(n * n).fill(0) };
    }
    if (!SAVE.cpu.life.size) SAVE.cpu.life.size = n;
  }
  function lifePresets() { return lifeSize() === 6 ? LIFE_PRESETS_6 : LIFE_PRESETS; }
  function lifeBeatOnce() {
    var c = lifeCircuit();
    if (!c) return;
    var r = T.beat(c, LIFE.state, []);
    LIFE.state = r.state;
    lifeSaveGuard();
    SAVE.cpu.life.gen += 1;
    SAVE.cpu.life.cells = LIFE.state.slice();
    save();
  }
  function renderCpuLife() {
    var box = $('cpu-panel');
    if (!cpuUnlocked(SAVE)) {
      box.innerHTML = '<p class="hint">🔒 先流片一张电路卡，才能进 CPU 神殿。</p>';
      return;
    }
    lifeSaveGuard();
    LIFE.size = lifeSize();
    LIFE.state = SAVE.cpu.life.cells.slice();
    var c = lifeCircuit();
    var n = LIFE.size, cells = n * n;
    var alive = LIFE.state.reduce(function (a, x) { return a + x; }, 0);
    var html = '<p class="hint">这台 CPU 的第二种程序：康威生命游戏，' + n + '×' + n + ' 环面（上下左右都连通）。规则：3 个邻居出生、2 个邻居存活，其余都死。' +
      '它也是真电路：' + lifeGateText(n) + '，网表 SHA-256 <code>' + (c ? LIFE.shas[n].slice(0, 18) + '…' : '—') +
      '</code>，每拍都是 TapeSim 真仿真，不是 JS 算的动画。</p>' +
      '<div class="toolbar"><button id="btn-mode-counter2">🔢 计数器</button>' +
      '<button id="btn-mode-life2" class="btn-primary">🧬 生命游戏</button>' +
      '<span class="hint">棋盘：</span><button data-size="4"' + (n === 4 ? ' class="btn-primary"' : '') + '>4×4</button>' +
      '<button data-size="6"' + (n === 6 ? ' class="btn-primary"' : '') + '>6×6</button></div>' +
      '<div class="panel"><h3>🧬 生命游戏 · 第 ' + SAVE.cpu.life.gen + ' 代 · 活细胞 ' + alive + ' / ' + cells + '</h3>' +
      '<div class="life-grid' + (n === 6 ? ' size6' : '') + '">' + LIFE.state.map(function (v, i) {
        return '<button class="life-cell' + (v ? ' alive' : '') + '" data-cell="' + i + '" aria-label="格子 ' + i + '"></button>';
      }).join('') + '</div>' +
      '<p class="hint">点格子摆图案，或用预设：' +
      Object.keys(lifePresets()).map(function (k) {
        return '<button data-preset="' + k + '">' + lifePresets()[k].name + '</button>';
      }).join(' ') + '</p>' +
      '<div class="toolbar">' +
      '<button class="btn-primary" id="btn-life-beat">▶ 演化一代</button>' +
      '<button id="btn-life-auto">' + (LIFE.timer ? '⏸ 停止自动' : '▶ 自动演化（约每 0.7 秒一代）') + '</button>' +
      '<button id="btn-life-clear">清空</button></div>' +
      '<p class="hint" id="life-preset-note"></p></div>';
    box.innerHTML = html;
    Array.prototype.forEach.call(box.querySelectorAll('[data-cell]'), function (btn) {
      btn.onclick = function () {
        var i = parseInt(btn.getAttribute('data-cell'), 10);
        LIFE.state[i] = LIFE.state[i] ? 0 : 1;
        lifeSaveGuard();
        SAVE.cpu.life.cells = LIFE.state.slice();
        save();
        renderCpuLife();
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-size]'), function (btn) {
      btn.onclick = function () {
        cpuStopAuto();
        var n = parseInt(btn.getAttribute('data-size'), 10);
        SAVE.cpu.life = { gen: 0, size: n, cells: new Array(n * n).fill(0) };
        save();
        renderCpuLife();
        setStatus(n === 6 ? '生命游戏换到 6×6：3,600 个 NAND 门的真电路，轻型飞船可以上场了。' : '生命游戏换回 4×4。');
      };
    });
    Array.prototype.forEach.call(box.querySelectorAll('[data-preset]'), function (btn) {
      btn.onclick = function () {
        var p = lifePresets()[btn.getAttribute('data-preset')];
        LIFE.state = new Array(lifeCells(LIFE.size)).fill(0);
        p.cells.forEach(function (i) { LIFE.state[i] = 1; });
        lifeSaveGuard();
        SAVE.cpu.life.gen = 0;
        SAVE.cpu.life.cells = LIFE.state.slice();
        save();
        renderCpuLife();
        $('life-preset-note').textContent = p.name + '：' + p.note + '。';
      };
    });
    $('btn-mode-counter2').onclick = function () { cpuStopAuto(); renderCpu(); };
    $('btn-life-beat').onclick = function () { lifeBeatOnce(); renderCpuLife(); };
    $('btn-life-auto').onclick = function () {
      if (LIFE.timer) { cpuStopAuto(); renderCpuLife(); return; }
      LIFE.timer = setInterval(function () { lifeBeatOnce(); renderCpuLife(); }, 700);
      renderCpuLife();
      setStatus('生命游戏自动演化中：约每 0.7 秒一代。');
    };
    $('btn-life-clear').onclick = function () {
      cpuStopAuto();
      LIFE.state = new Array(lifeCells(LIFE.size)).fill(0);
      lifeSaveGuard();
      SAVE.cpu.life.gen = 0;
      SAVE.cpu.life.cells = LIFE.state.slice();
      save();
      renderCpuLife();
    };
    refreshHud();
  }

  /* ================= 视觉打磨 2：图片离线 fallback（第 6 轮） ================= */
  // Test1 卡图是远程图片，离线/挂了会破图。fallback 是一张内联 SVG data URI
  //（蓝图底 + 芯片框 + 编号），不依赖网络；网表数据本身不受影响（文案写明）。
  function test1Placeholder(id) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="200" viewBox="0 0 360 200">' +
      '<rect width="360" height="200" fill="#0f2033"/>' +
      '<g stroke="#1e3a5f" stroke-width="1">' +
      '<line x1="0" y1="50" x2="360" y2="50"/><line x1="0" y1="100" x2="360" y2="100"/><line x1="0" y1="150" x2="360" y2="150"/>' +
      '<line x1="60" y1="0" x2="60" y2="200"/><line x1="120" y1="0" x2="120" y2="200"/><line x1="180" y1="0" x2="180" y2="200"/><line x1="240" y1="0" x2="240" y2="200"/><line x1="300" y1="0" x2="300" y2="200"/></g>' +
      '<rect x="130" y="55" width="100" height="70" fill="none" stroke="#37d13a" stroke-width="2"/>' +
      '<g fill="#37d13a"><rect x="118" y="78" width="12" height="6"/><rect x="118" y="96" width="12" height="6"/><rect x="230" y="78" width="12" height="6"/><rect x="230" y="96" width="12" height="6"/></g>' +
      '<text x="180" y="155" fill="#f5c542" font-size="22" font-family="monospace" text-anchor="middle">Test1 #' + id + '</text>' +
      '<text x="180" y="180" fill="#8fa8c4" font-size="12" font-family="monospace" text-anchor="middle">图片离线 · 网表数据不受影响</text></svg>';
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  /* ================= 卡片馆：Test1 图鉴 ================= */
  function renderTest1() {
    var wrap = $('test1-grid');
    wrap.innerHTML = TEST1_CARDS.map(function (c) {
      return '<div class="t1-card"><img src="' + c.image + '" alt="Test1 #' + c.id + '" loading="lazy" onerror="t1ImgFallback(this,' + c.id + ')">' +
        '<h3>Test1 #' + c.id + '</h3>' +
        '<p class="t1-ed">第 ' + c.editionIndex + ' / ' + c.of + ' 张 · ' + rarityOf(c.of).name + '</p>' +
        '<p>' + c.nand + ' NAND · ' + c.nIn + ' 入 ' + c.nOut + ' 出 · ' + c.latch + ' LATCH</p>' +
        '<p class="t1-sha">SHA ' + c.sha.slice(0, 14) + '…' + c.sha.slice(-6) + '</p>' +
        '<button class="btn-primary" data-play="' + c.id + '">在模拟器里玩</button></div>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-play]'), function (b) {
      b.onclick = function () { openSim(+b.getAttribute('data-play')); };
    });
    $('test1-note').textContent = '正在核对本地样本与目录登记的 SHA-256……';
    verifyTest1Cache();
  }
  // 卡片馆样本核对用的目录只在会话内拉一次（第 36 轮）：directory.json 761KB，
  // 每次进卡片馆都重新下载在手机流量下太浪费；浏览器缓存不可靠，内存缓存最稳。
  var TEST1_DIR_CACHE = null;
  async function verifyTest1Cache() {
    try {
      if (!TEST1_DIR_CACHE) {
        TEST1_DIR_CACHE = await (await fetch('samples/directory.json')).json();
      }
      var dir = TEST1_DIR_CACHE;
      var bad = [];
      for (const c of TEST1_CARDS) {
        var metaBytes = await (await fetch('samples/test1-' + c.id + '-meta.json')).arrayBuffer();
        var metaHash = '0x' + T.sha256Hex(new Uint8Array(metaBytes));
        if (metaHash.toLowerCase() !== (dir.files[String(c.id)] || '').toLowerCase()) bad.push(c.id);
      }
      $('test1-note').textContent = bad.length
        ? '⚠ 本地样本核对失败：编号 ' + bad.join('、') + ' 的信息文件 SHA-256 与目录登记不符——样本可能损坏，数字不可信。'
        : '✓ 本地样本已与目录登记 SHA-256 核对一致（快照 2026-11-24）。网表是随机分配的，不是 PoD 题的标准答案。';
    } catch (e) {
      $('test1-note').textContent = '本地样本（快照 2026-11-24），本次未联网核对——数字以样本文件为准。';
    }
  }

  /* ================= 模拟器（真实网表） ================= */
  var SIM = { circuit: null, meta: null, id: null, inputs: [], state: [], clock: 0, source: '', steps: [] };
  function openSim(id) {
    switchView('sim');
    $('sim-token').value = id;
    loadSim(id, 'local');
  }
  async function loadSim(id, mode) {
    id = +id;
    if (!id || id < 1 || id > 10000) { $('sim-status').textContent = '编号须在 1–10000 之间。'; return; }
    $('sim-token').value = id; // 上一张/下一张翻号后，输入框同步显示当前编号
    $('sim-status').textContent = '正在加载 Test1 #' + id + '（' + (mode === 'live' ? '实时 9 步链' : '本地样本') + '）……';
    $('sim-steps').innerHTML = '';
    $('sim-board').innerHTML = '';
    $('sim-controls').innerHTML = '';
    $('sim-info').innerHTML = '';
    try {
      var ctx;
      if (mode === 'live') {
        ctx = await T.fetchChain(id, function (n, name, status, detail) {
          SIM.steps.push({ n: n, name: name, status: status, detail: detail });
          renderSimSteps();
        });
        SIM.source = 'live';
      } else {
        ctx = await T.loadLocalSample(id);
        SIM.source = 'local';
        SIM.steps = [{ n: 0, name: '本地样本', status: 'ok', detail: '从 samples/ 读取（快照 2026-11-24），已逐项校验 SHA-256' }];
        renderSimSteps();
      }
      SIM.id = id; SIM.circuit = ctx.circuit; SIM.meta = ctx.meta;
      SIM.inputs = new Array(ctx.circuit.nIn).fill(0);
      SIM.state = new Array(ctx.circuit.nState).fill(0);
      SIM.clock = 0;
      renderSim();
      var m = ctx.meta.tap;
      $('sim-status').textContent = '✓ Test1 #' + id + ' 已加载（' + (SIM.source === 'live' ? '实时链上核对' : '本地样本，快照 2026-11-24') + '）。';
      $('sim-info').innerHTML = '<p>状态：' + m.state + ' · 第 ' + m.edition.index + ' / ' + m.edition.of + ' 张 · ' + rarityOf(m.edition.of).name +
        '</p><p>' + ctx.circuit.nIn + ' 入 / ' + ctx.circuit.nOut + ' 出 · ' + ctx.circuit.nNand + ' NAND · ' + ctx.circuit.nLatch +
        ' LATCH</p><p>网表 SHA-256：<code>' + m.netlist.sha256 + '</code></p>' +
        '<p class="hint">网表本身不在链上：信任根是链上 baseURI 指纹 + 上面这条 SHA-256 校验链（第 1–9 步）。' +
        '网表是随机分配的，不是 PoD 题答案。</p>';
    } catch (e) {
      if (e.unrevealed) {
        $('sim-status').textContent = '⚠ Test1 #' + id + ' 未开图（黑洞），没有网表。换一个编号试试。' +
          (SIM.circuit ? '（电路板仍显示上一张 #' + SIM.id + '，不是这张。）' : '');
      } else {
        // 加载失败时电路板仍显示上一张（如果有），状态栏必须明说，免得人以为板上就是这张
        $('sim-status').textContent = '⚠ 加载失败：' + e.message +
          '（第 ' + (e.step || '?') + ' 步）。可以试试本地样本，或换一个编号。' +
          (SIM.circuit ? '（电路板仍显示上一张 #' + SIM.id + '，不是这张。）' : '');
      }
      renderSimSteps();
    }
  }
  function renderSimSteps() {
    var el = $('sim-steps');
    if (!el) return;
    el.innerHTML = SIM.steps.map(function (s) {
      return '<li class="' + s.status + '">第 ' + s.n + ' 步 ' + esc(s.name) + ' — ' + s.status +
        (s.detail ? ' · ' + esc(s.detail) : '') + '</li>';
    }).join('');
  }
  function renderSim() {
    if (!SIM.circuit) return;
    var c = SIM.circuit;
    var sim = T.peek(c, SIM.state, SIM.inputs);
    var layout = T.layoutCircuit(c);
    var box = $('sim-board');
    if (layout.tooBig) S.renderGateTable(box, c, sim.signals);
    else {
      S.renderSchematic(box, c, layout, sim.signals, { flow: true });
      var svg = box.querySelector('svg.schem');
      if (svg) svg.addEventListener('click', function (ev) {
        var g = ev.target.closest ? ev.target.closest('[data-input]') : null;
        if (g) { SIM.inputs[+g.getAttribute('data-input')] ^= 1; renderSim(); }
      });
    }
    var ctrl = $('sim-controls');
    var html = SIM.inputs.map(function (b, i) {
      return '<button class="hsw' + (b ? ' on' : ' off') + '" data-i="' + i + '">' +
        '<span class="hsw-track"><span class="hsw-knob"></span></span>' +
        '<span class="hsw-label">in' + i + ' = ' + b + '</span></button>';
    }).join('');
    html += sim.outputs.map(function (b, i) {
      return '<span class="hled' + (b ? ' on' : ' off') + '"><span class="hled-dot"></span>' +
        '<span class="hled-label">out' + i + ' = ' + b + '</span></span>';
    }).join('');
    if (c.nState > 0) {
      html += '<button class="btn-primary" data-beat="1">▶ 运行一拍（beat）</button>' +
        '<button data-reset="1">复位状态</button>';
    }
    html += '<button data-all1="1">全 1</button><button data-all0="1">全 0</button>';
    html += '<span class="io-bits">输入 ' + T.bitsToString(SIM.inputs) + ' → 输出 ' + T.bitsToString(sim.outputs) +
      (c.nState > 0 ? ' · 时钟 ' + SIM.clock + ' 拍' : '') + '</span>';
    ctrl.innerHTML = html;
    Array.prototype.forEach.call(ctrl.querySelectorAll('.hsw'), function (btn) {
      btn.onclick = function () { SIM.inputs[+btn.getAttribute('data-i')] ^= 1; renderSim(); };
    });
    var bb = ctrl.querySelector('[data-beat]');
    if (bb) bb.onclick = function () {
      var r = T.beat(c, SIM.state, SIM.inputs);
      SIM.state = r.state; SIM.clock++;
      renderSim();
    };
    var rb = ctrl.querySelector('[data-reset]');
    if (rb) rb.onclick = function () { SIM.state = new Array(c.nState).fill(0); SIM.clock = 0; renderSim(); };
    var a1 = ctrl.querySelector('[data-all1]');
    if (a1) a1.onclick = function () { SIM.inputs.fill(1); renderSim(); };
    var a0 = ctrl.querySelector('[data-all0]');
    if (a0) a0.onclick = function () { SIM.inputs.fill(0); renderSim(); };
  }

  /* ================= 图鉴 ================= */
  function renderCodex() {
    var unlocked = CODEX.filter(function (e) { return codexUnlocked(SAVE, e); });
    $('codex-progress').textContent = t('codex.progress', { n: unlocked.length, total: CODEX.length });
    // 图鉴条目走 i18n 词典（第 62 轮）：某门语言没翻某条时回退中文原文，不显示 key。
    var srcPre = t('codex.source'); if (srcPre === 'codex.source') srcPre = '来源：';
    var lockPre = t('codex.lockHint'); if (lockPre === 'codex.lockHint') lockPre = '🔒 解锁条件：';
    $('codex-grid').innerHTML = CODEX.map(function (e) {
      var ok = codexUnlocked(SAVE, e);
      var nm = t('codex.' + e.id + '.name'); if (nm === 'codex.' + e.id + '.name') nm = e.name;
      var wh = t('codex.' + e.id + '.what'); if (wh === 'codex.' + e.id + '.what') wh = e.what;
      var st = t('codex.status.' + e.status); if (st === 'codex.status.' + e.status) st = STATUS_LABEL[e.status];
      var ul = t('codex.unlock.' + e.unlock); if (ul === 'codex.unlock.' + e.unlock) ul = codexUnlockLabel(e.unlock);
      return '<article class="codex-card' + (ok ? '' : ' locked') + '">' +
        '<h3>' + esc(nm) + ' ' + (ok ? '<span class="badge st-' + e.status + '">' + esc(st) + '</span>' : '🔒') + '</h3>' +
        (ok ? '<p>' + esc(wh) + '</p><p class="hint">' + srcPre + esc(e.source) + '</p>'
          : '<p class="hint">' + lockPre + esc(ul) + '</p>') +
        '</article>';
    }).join('');
  }

  /* ================= 启动 ================= */
  function init() {
    // 卡图离线 fallback（内联 onerror 用，全局只暴露这一个函数）
    window.t1ImgFallback = function (img, id) {
      img.onerror = null;
      img.src = test1Placeholder(id);
    };
    // 导航
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.onclick = function () { switchView(b.getAttribute('data-nav')); };
    });
    // 音效开关（第 53 轮）
    var snd = $('btn-sound');
    if (snd) {
      snd.textContent = SAVE.sound === false ? '🔇' : '🔊';
      snd.onclick = function () {
        SAVE.sound = SAVE.sound === false;
        save();
        snd.textContent = SAVE.sound === false ? '🔇' : '🔊';
        if (SAVE.sound !== false) playChime('coin');
      };
    }
    // HUD 当前目标按钮（第 55 轮）：点一下直达下一步
    var hg = $('hud-goal');
    if (hg) hg.onclick = function () { switchView(nextStep(SAVE).target); };
    // 小镇折叠区手风琴（第 56 轮）：一次只开一个，画面一次只讲一件事
    Array.prototype.forEach.call(document.querySelectorAll('.town-fold'), function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        Array.prototype.forEach.call(document.querySelectorAll('.town-fold'), function (o) { if (o !== d) o.open = false; });
      });
    });
    // 模拟器控制
    var lb = $('sim-load-live');
    if (lb) lb.onclick = function () { loadSim($('sim-token').value, 'live'); };
    var ls = $('sim-load-local');
    if (ls) ls.onclick = function () { loadSim($('sim-token').value, 'local'); };
    // 上一张/下一张（第 18 轮）：按当前模式（实时链/本地样本）翻号，1–10000 循环
    var sp = $('sim-prev');
    if (sp) sp.onclick = function () {
      var id = (+$('sim-token').value || 1) - 1; if (id < 1) id = 10000;
      loadSim(id, SIM.source === 'live' ? 'live' : 'local');
    };
    var sn = $('sim-next');
    if (sn) sn.onclick = function () {
      var id = (+$('sim-token').value || 1) + 1; if (id > 10000) id = 1;
      loadSim(id, SIM.source === 'live' ? 'live' : 'local');
    };
    var bk = $('sim-back');
    if (bk) bk.onclick = function () { switchView('test1'); };
    // 第一章工具条
    bindCh1Toolbar();
    // 弹窗遮罩点击关闭
    $('modal-root').addEventListener('click', function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('modal-backdrop')) closeModal();
    });
    // 底部诚实声明（第 58 轮：文案走 i18n 词典）
    var honest = $('honesty');
    if (honest) honest.innerHTML = t('footer.honesty');
    switchView('town');
    setStatus('欢迎来到链上造芯厂：先去设计台认识两块积木。');
    // 语言切换后重渲染（第 58 轮）：静态 chrome 由 i18n.js 的 applyI18n 翻，
    // 动态内容（当前视图 + HUD + 诚实声明 + 开着的欢迎弹窗）在这里重画。
    if (I18N_API) I18N_API.onChange(function () {
      var h = $('honesty'); if (h) h.innerHTML = t('footer.honesty');
      refreshHud();
      switchView(CUR_VIEW);
      if ($('modal-root').style.display !== 'none' && !SAVE.visited.welcome) showWelcome();
    });
    showWelcome();
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
