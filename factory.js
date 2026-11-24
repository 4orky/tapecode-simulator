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
    return { day: save.day, total: total, totalWeight: save.totalWeight, lines: lines };
  }

  /* ================= 存档 ================= */
  var SAVE_KEY = 'tapecode-factory-v1';
  var MEM = {};
  function defaultSave() {
    return {
      v: 1, nand: 200, latch: 20, bem: 0, day: 0, totalWeight: 100000,
      stars: {}, passed: {}, taped: [], miners: [],
      codex: [], visited: {}, prologueDone: {}, drafts: {}
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
    { id: 'tapesend', name: 'TapeSend', status: 'unverified', source: 'ECOSYSTEM §3.2',
      what: '号称“多链端到端加密消息层”，但除一句话介绍外找不到仓库、文档、API 或演示，很可能已被 TapeRelay 的消息功能取代。本游戏不声称调用它。',
      unlock: 'test1' }
  ];
  var STATUS_LABEL = { live: '✅ 已实现', alpha: '🧪 测试中', draft: '📝 草案', unverified: '❓ 未核实' };
  function codexUnlocked(save, entry) {
    if (entry.unlock === 'always') return true;
    if (entry.unlock === 'prologue') return !!save.visited.prologue;
    if (entry.unlock === 'ch1') return !!save.visited.ch1;
    if (entry.unlock === 'tapeout') return !!save.visited.tapeout;
    if (entry.unlock === 'mining') return !!save.visited.mining;
    if (entry.unlock === 'test1') return !!save.visited.test1;
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
    SAVE_KEY: SAVE_KEY, defaultSave: defaultSave, loadSave: loadSave, storeSave: storeSave,
    totalStars: totalStars,
    prologueDraft: prologueDraft,
    CODEX: CODEX, STATUS_LABEL: STATUS_LABEL, codexUnlocked: codexUnlocked,
    TEST1_CARDS: TEST1_CARDS
  };
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

  function refreshHud() {
    $('res-nand').textContent = SAVE.nand;
    $('res-latch').textContent = SAVE.latch;
    $('res-bem').textContent = SAVE.bem.toFixed(2);
    $('res-day').textContent = SAVE.day;
    $('res-stars').textContent = totalStars(SAVE);
  }

  var VIEWS = ['town', 'prologue', 'ch1', 'tapeout', 'mining', 'test1', 'codex', 'sim'];
  function switchView(name) {
    VIEWS.forEach(function (v) { show($('view-' + v), v === name); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-nav') === name);
    });
    if (name === 'town') renderTown();
    if (name === 'prologue') { SAVE.visited.prologue = true; save(); renderPrologue(); }
    if (name === 'ch1') { SAVE.visited.ch1 = true; save(); renderCh1(); }
    if (name === 'tapeout') { SAVE.visited.tapeout = true; save(); renderTapeout(); }
    if (name === 'mining') { SAVE.visited.mining = true; save(); renderMining(); }
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

  /* ================= 小镇地图 ================= */
  var BUILDINGS = [
    { id: 'prologue', name: '设计台', desc: '序章 · 两块积木', icon: '▣', open: function () { return true; }, hint: '认识 NAND 与 LATCH：拨开关，看信号流' },
    { id: 'ch1', name: '任务板', desc: '第一章 · 接单', icon: '▤', open: function () { return !!SAVE.visited.prologue; }, lock: '先去设计台逛逛' },
    { id: 'tapeout', name: '流片厂', desc: '第二章 · 流片', icon: '⬡', open: function () { return Object.keys(SAVE.passed).length > 0; }, lock: '先通过一道题（任务板）' },
    { id: 'mining', name: '矿场', desc: '第三章 · 挖 BEM', icon: '⛏', open: function () { return SAVE.taped.length > 0; }, lock: '先流片一张电路卡' },
    { id: 'test1', name: '卡片馆', desc: 'Test1 图鉴 · 真实网表', icon: '▦', open: function () { return true; }, hint: '5 张真实 Test1 电路卡，可进模拟器玩' },
    { id: 'codex', name: '图鉴', desc: '生态全景', icon: '▧', open: function () { return true; }, hint: '每遇到一个新组件，图鉴亮一条' }
  ];
  function renderTown() {
    var wrap = $('town-grid');
    wrap.innerHTML = BUILDINGS.map(function (b) {
      var ok = b.open();
      var visited = !!SAVE.visited[b.id];
      return '<button class="building' + (ok ? '' : ' locked') + (visited ? ' lit' : '') + '" data-b="' + b.id + '"' + (ok ? '' : ' disabled') + '>' +
        '<span class="b-icon">' + b.icon + '</span>' +
        '<span class="b-name">' + b.name + (visited ? ' ✓' : '') + '</span>' +
        '<span class="b-desc">' + b.desc + '</span>' +
        '<span class="b-hint">' + (ok ? (b.hint || '') : ('🔒 ' + b.lock)) + '</span>' +
        '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('.building:not(.locked)'), function (btn) {
      btn.onclick = function () { switchView(btn.getAttribute('data-b')); };
    });
    // 旅程进度
    var stage = SAVE.taped.length > 0 ? 4 : (Object.keys(SAVE.passed).length > 0 ? 3 : (SAVE.visited.prologue ? 2 : 1));
    var steps = ['买零件', '画电路', '流片', '挖矿', '花 BEM', '开厂 / 建应用'];
    $('journey').innerHTML = steps.map(function (s, i) {
      var cls = i + 1 < stage ? 'done' : (i + 1 === stage ? 'now' : (i + 1 > 4 ? 'later' : ''));
      return '<span class="j-step ' + cls + '">' + s + '</span>' + (i < steps.length - 1 ? '<span class="j-arrow">→</span>' : '');
    }).join('') + '<span class="j-note">（花 BEM 与开厂是 P1，敬请期待）</span>';
    refreshHud();
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
    $('ch1-meta').innerHTML = '门数标准：3 星 ≤ ' + prob.par + ' 门 · 2 星 ≤ ' + (prob.par + 2) +
      ' 门 · 通过 ≤ ' + prob.limit + ' 门。晶体管：每放一个 NAND 门花 1 个，删门退回 1 个。' +
      (SAVE.passed[prob.id] ? ' 已通过：最佳 ' + SAVE.passed[prob.id].gates + ' 门 · ' + SAVE.passed[prob.id].stars + ' 星。' : '');
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
        '<circle cx="118" cy="' + (y + 26) + '" r="5" class="src-dot"/>' +
        '<title>点击选为连线源（当前值 ' + v + '，拨动值在下方开关条）</title></g>';
    });
    // ---- 常量轨 ----
    [0, 1].forEach(function (cv) {
      var y = 60 + prob.nIn * 64 + cv * 64;
      var sel = B.selSrc && B.selSrc.k === 'c' && B.selSrc.v === cv;
      s += '<g class="rail-pin' + (sel ? ' sel' : '') + '" data-src="c:' + cv + '">' +
        '<rect x="18" y="' + y + '" width="100" height="52" rx="6" class="rail-box"/>' +
        '<text x="68" y="' + (y + 30) + '" text-anchor="middle" class="t-pin">常量 ' + cv + '</text>' +
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
  }

  function bindBuilderSvg(box) {
    var svg = box.querySelector('svg.bschem');
    if (!svg) return;
    var drag = null;
    svg.addEventListener('mousedown', function (ev) {
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
        drag = { id: g.id, startX: ev.clientX, startY: ev.clientY, origX: g.x, origY: g.y, moved: false };
        ev.preventDefault();
      }
    });
    svg.addEventListener('mousemove', function (ev) {
      if (!drag) return;
      var dx = ev.clientX - drag.startX, dy = ev.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      var g = gateById(B.draft, drag.id);
      if (!g) return;
      g.x = Math.max(260, Math.min(940, drag.origX + dx));
      g.y = Math.max(20, Math.min(builderHeight() - 80, drag.origY + dy));
      var el = svg.querySelector('[data-gate="' + g.id + '"]');
      if (el) el.setAttribute('transform', 'translate(' + g.x + ',' + g.y + ')');
    });
    svg.addEventListener('mouseup', function (ev) {
      if (!drag) return;
      var g = gateById(B.draft, drag.id);
      if (drag.moved && g) { persistDraft(); drawBuilder(); }
      else if (g) { B.selGate = g.id; B.selSrc = null; drawBuilder(); }
      drag = null;
    });
    svg.addEventListener('mouseleave', function () {
      if (drag && drag.moved) { persistDraft(); drawBuilder(); }
      drag = null;
    });
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
    $('ch1-meta').innerHTML = '门数标准：3 星 ≤ ' + prob.par + ' 门 · 2 星 ≤ ' + (prob.par + 2) +
      ' 门 · 通过 ≤ ' + prob.limit + ' 门。晶体管：每放一个 NAND 门花 1 个，删门退回 1 个。' +
      (SAVE.passed[prob.id] ? ' 已通过：最佳 ' + SAVE.passed[prob.id].gates + ' 门 · ' + SAVE.passed[prob.id].stars + ' 星。' : '');
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
      renderMining();
      setStatus('✓ ' + lines + '。');
    };
    refreshHud();
  }

  /* ================= 卡片馆：Test1 图鉴 ================= */
  function renderTest1() {
    var wrap = $('test1-grid');
    wrap.innerHTML = TEST1_CARDS.map(function (c) {
      return '<div class="t1-card"><img src="' + c.image + '" alt="Test1 #' + c.id + '" loading="lazy">' +
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
  async function verifyTest1Cache() {
    try {
      var dir = await (await fetch('samples/directory.json')).json();
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
        $('sim-status').textContent = '⚠ Test1 #' + id + ' 未开图（黑洞），没有网表。换一个编号试试。';
      } else {
        $('sim-status').textContent = '⚠ 加载失败：' + e.message +
          '（第 ' + (e.step || '?') + ' 步）。可以试试本地样本，或换一个编号。';
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
    $('codex-progress').textContent = '已解锁 ' + unlocked.length + ' / ' + CODEX.length + ' 条。解锁条件：去小镇里对应的地方逛逛。';
    $('codex-grid').innerHTML = CODEX.map(function (e) {
      var ok = codexUnlocked(SAVE, e);
      return '<article class="codex-card' + (ok ? '' : ' locked') + '">' +
        '<h3>' + esc(e.name) + ' ' + (ok ? '<span class="badge st-' + e.status + '">' + e.status + '</span>' : '🔒') + '</h3>' +
        (ok ? '<p>' + esc(e.text) + '</p><p class="hint">来源：' + esc(e.source) + '</p>'
          : '<p class="hint">🔒 ' + esc(e.unlock) + '</p>') +
        '</article>';
    }).join('');
  }

  /* ================= 启动 ================= */
  function init() {
    // 导航
    Array.prototype.forEach.call(document.querySelectorAll('[data-nav]'), function (b) {
      b.onclick = function () { switchView(b.getAttribute('data-nav')); };
    });
    // 模拟器控制
    var lb = $('sim-load-live');
    if (lb) lb.onclick = function () { loadSim($('sim-token').value, 'live'); };
    var ls = $('sim-load-local');
    if (ls) ls.onclick = function () { loadSim($('sim-token').value, 'local'); };
    var bk = $('sim-back');
    if (bk) bk.onclick = function () { switchView('test1'); };
    // 第一章工具条
    bindCh1Toolbar();
    // 弹窗遮罩点击关闭
    $('modal-root').addEventListener('click', function (ev) {
      if (ev.target && ev.target.classList && ev.target.classList.contains('modal-backdrop')) closeModal();
    });
    // 底部诚实声明
    var honest = $('honesty');
    if (honest) honest.innerHTML = '诚实说明：本游戏是教学演示，不连钱包、不花真钱、不承诺任何收益。' +
      '游戏里的 BEM 是<b>游戏币，不是真实 BEM</b>。真实数字标有快照时间（2026-11-24），Test1 网表是随机分配的，不是 PoD 题答案。' +
      '网表本身不在链上；信任根是链上 baseURI 指纹 + SHA-256 校验链。TapeSend 集成未核实，本游戏不声称已集成。';
    switchView('town');
    setStatus('欢迎来到链上造芯厂：先去设计台认识两块积木。');
  }
  init();
})(typeof window !== 'undefined' ? window : globalThis);
