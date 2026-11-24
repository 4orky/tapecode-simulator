#!/usr/bin/env node
/* 《链上造芯厂》P0 纯逻辑回归：factory.js（无 DOM 部分）。
 * 用法：cd ~/workspace/tapeout-hackathon/app && node test-factory.cjs
 * 退出码 0 = 全部通过；非 0 = 有失败。
 * 覆盖：序章 4 个预制电路、画布搭建（全加器 9 门 / 多数表决器 6 门 /
 * 4 位加法器 36 门，均走真实 tapnet 序列化 + TapeSim 真值表）、
 * 连接规则、星级、流片卡 SHA-256、挖矿公式、Test1 图鉴数据与样本文件一致。
 */
const fs = require('fs');
const path = require('path');
const T = require('./app.js');
const F = require('./factory.js');

let pass = 0, fail = 0;
const lines = [];
function check(name, ok, detail) {
  if (ok) { pass++; lines.push(`PASS  ${name}${detail ? ' — ' + detail : ''}`); }
  else { fail++; lines.push(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}
function bits(str) { return str.split('').map(c => (c === '1' ? 1 : 0)); }
const I = i => ({ k: 'i', idx: i });
const G = id => ({ k: 'g', id });
const C = v => ({ k: 'c', v });

const SAMP = path.join(__dirname, 'samples');
const read = f => new Uint8Array(fs.readFileSync(path.join(SAMP, f)));

// ---------- 0. 序章预制电路 ----------
{
  const notC = F.compileDraft(F.prologueDraft('not'));
  check('序章 NOT 门编译通过', notC.ok);
  check('序章 NOT：0→1', T.bitsToString(F.evaluateCompiled(notC, [0]).outputs) === '1');
  check('序章 NOT：1→0', T.bitsToString(F.evaluateCompiled(notC, [1]).outputs) === '0');

  const andC = F.compileDraft(F.prologueDraft('and'));
  let ok = andC.ok;
  for (let v = 0; v < 4 && ok; v++) {
    const inp = [v & 1, (v >> 1) & 1];
    if (F.evaluateCompiled(andC, inp).outputs[0] !== (inp[0] & inp[1])) ok = false;
  }
  check('序章 AND（2 门 NAND）真值表 4/4', ok);

  const orC = F.compileDraft(F.prologueDraft('or'));
  ok = orC.ok;
  for (let v = 0; v < 4 && ok; v++) {
    const inp = [v & 1, (v >> 1) & 1];
    if (F.evaluateCompiled(orC, inp).outputs[0] !== (inp[0] | inp[1])) ok = false;
  }
  check('序章 OR（3 门 NAND）真值表 4/4', ok);

  // LATCH：q 输出上一拍记住的值，新状态 = 当前 d
  const latC = F.compileDraft(F.prologueDraft('latch'));
  check('序章 LATCH 编译通过（1 LATCH）', latC.ok && latC.circuit.nLatch === 1);
  let state = [0], seq = [];
  for (const d of [1, 0, 0, 1, 1, 0]) {
    const r = T.beat(latC.circuit, state, [d]);
    seq.push(r.outputs[0]);
    state = r.state;
  }
  // d=1:q=0(旧态),state=1; d=0:q=1,state=0; d=0:q=0; d=1:q=0,state=1; d=1:q=1; d=0:q=1,state=0
  check('序章 LATCH 时序：记住上一拍', seq.join('') === '010011', 'q 序列 ' + seq.join(''));
}

// ---------- 1. 全加器样本的输出映射（O0=和 / O1=进位，二选一） ----------
const faSample = T.parseTapnet(read('full-adder-9nand.tapnet'));
let faSumFirst;
{
  const out = T.simulate(faSample, [], [1, 1, 0]).outputs; // a=1,b=1,cin=0 → 和 0，进位 1
  faSumFirst = (out[0] === 0 && out[1] === 1);
  check('全加器样本映射可判定', (out[0] === 0 && out[1] === 1) || (out[0] === 1 && out[1] === 0),
    'O0/O1=' + out.join('/') + ' → ' + (faSumFirst ? 'O0=和，O1=进位' : 'O0=进位，O1=和'));
}
// 把样本的 9 门结构搬进草稿：按记录顺序建门，信号映射后直连
function appendFullAdder(draft, aSrc, bSrc, cinSrc) {
  const gateIds = [];
  faSample.gates.forEach(g => {
    const ng = F.addGate(draft, 0, 0, 0);
    gateIds.push(ng.id);
    const mapSig = s => {
      if (s === 0) return C(0);
      if (s === 1) return C(1);
      if (s === 2) return aSrc;
      if (s === 3) return bSrc;
      if (s === 4) return cinSrc;
      return G(gateIds[s - 5]); // 门输出信号 5+i → 第 i 个新建门
    };
    ng.in0 = mapSig(g.w[0]);
    ng.in1 = mapSig(g.w[1]);
  });
  // 样本输出 = 最后两个门信号（记录顺序第 8、9 个门）
  const lastTwo = [gateIds[7], gateIds[8]];
  return faSumFirst
    ? { sumGateId: lastTwo[0], carryGateId: lastTwo[1] }
    : { sumGateId: lastTwo[1], carryGateId: lastTwo[0] };
}

// ---------- 2. 画布搭全加器（9 门） ----------
{
  const d = F.newDraft('fa');
  const r = appendFullAdder(d, I(0), I(1), I(2));
  d.outputs = [G(r.sumGateId), G(r.carryGateId)];
  const v = F.verifyTruthTable(d);
  check('画布全加器：真值表 8/8', v.ok && v.passed === 8, v.ok ? '' : v.reason);
  check('画布全加器：9 门 = par，3 星', d.gates.length === 9 && F.starFor(9, 9, 12) === 3);
}

// ---------- 3. 画布搭多数表决器（6 门，NAND3 构造） ----------
{
  const d = F.newDraft('maj');
  // g0=NAND(a,b) g1=NAND(a,c) g2=NAND(b,c)；g3=NAND(g0,g1) g4=NAND(g3,g3) g5=NAND(g4,g2)
  const g0 = F.addGate(d, 0, 0, 0); g0.in0 = I(0); g0.in1 = I(1);
  const g1 = F.addGate(d, 0, 0, 0); g1.in0 = I(0); g1.in1 = I(2);
  const g2 = F.addGate(d, 0, 0, 0); g2.in0 = I(1); g2.in1 = I(2);
  const g3 = F.addGate(d, 0, 0, 0); g3.in0 = G(g0.id); g3.in1 = G(g1.id);
  const g4 = F.addGate(d, 0, 0, 0); g4.in0 = G(g3.id); g4.in1 = G(g3.id);
  const g5 = F.addGate(d, 0, 0, 0); g5.in0 = G(g4.id); g5.in1 = G(g2.id);
  d.outputs = [G(g5.id)];
  const v = F.verifyTruthTable(d);
  check('画布多数表决器：真值表 8/8', v.ok && v.passed === 8, v.ok ? '' : v.reason);
  check('画布多数表决器：6 门 = par，3 星', d.gates.length === 6 && F.starFor(6, 6, 9) === 3);
}

// ---------- 4. 画布搭 4 位加法器（36 门，行波进位） ----------
{
  const d = F.newDraft('adder4');
  let carrySrc = I(8); // 进位 in
  const sumGates = [];
  let carryGate = null;
  for (let i = 0; i < 4; i++) {
    const r = appendFullAdder(d, I(i), I(4 + i), carrySrc);
    sumGates.push(r.sumGateId);
    carryGate = r.carryGateId;
    carrySrc = G(carryGate);
  }
  d.outputs = [...sumGates.map(G), G(carryGate)];
  check('画布 4 位加法器：36 门', d.gates.length === 36);
  const v = F.verifyTruthTable(d);
  check('画布 4 位加法器：真值表 512/512', v.ok && v.passed === 512,
    v.ok ? '' : v.reason);
  check('画布 4 位加法器：36 门 = par，3 星', F.starFor(36, 36, 44) === 3);
}

// ---------- 5. 连接规则 ----------
{
  const d = F.newDraft('fa');
  const g0 = F.addGate(d, 0, 0, 0); g0.in0 = I(0); g0.in1 = I(1);
  const g1 = F.addGate(d, 0, 0, 0);
  // 自己接自己
  check('规则：门输出不能接回自己', F.connect(d, G(g1.id), { k: 'gate', id: g1.id, pin: 0 }).ok === false);
  // 环路：g0 依赖 g1 后，g1 不能再依赖 g0
  g1.in0 = G(g0.id); g1.in1 = C(1);
  check('规则：形成环路拒绝', F.connect(d, G(g1.id), { k: 'gate', id: g0.id, pin: 0 }).ok === false);
  // 输出脚只能接门输出
  check('规则：输出脚不接受输入直连', F.connect(d, I(0), { k: 'output', idx: 0 }).ok === false);
  // 输出门是终点：用新草稿验（g0 只接输出脚，未接给别的门）
  const d3 = F.newDraft('fa');
  const k0 = F.addGate(d3, 0, 0, 0); k0.in0 = I(0); k0.in1 = I(1);
  const r1 = F.connect(d3, G(k0.id), { k: 'output', idx: 0 });
  check('规则：门可以接输出脚', r1.ok === true, r1.reason || '');
  const k2 = F.addGate(d3, 0, 0, 0);
  check('规则：已接输出脚的门不能再分给别的门',
    F.connect(d3, G(k0.id), { k: 'gate', id: k2.id, pin: 0 }).ok === false);
  check('规则：一个门只能接一个输出脚',
    F.connect(d3, G(k0.id), { k: 'output', idx: 1 }).ok === false);
  // 反向：已接给别的门的门不能再当输出脚
  const d2 = F.newDraft('fa');
  const h0 = F.addGate(d2, 0, 0, 0); h0.in0 = I(0); h0.in1 = I(1);
  const h1 = F.addGate(d2, 0, 0, 0); h1.in0 = G(h0.id); h1.in1 = C(1);
  check('规则：已接给别的门的门不能当输出脚',
    F.connect(d2, G(h0.id), { k: 'output', idx: 0 }).ok === false);
  // 未接完的草稿验货失败并指出缺口
  const v = F.verifyTruthTable(d2);
  check('规则：未接完验货失败并报缺口', v.ok === false && /没接/.test(v.reason), v.reason || '');
  // 删门会清掉引用
  F.removeGate(d2, h0.id);
  check('规则：删门清掉引用', h1.in0 === null && d2.gates.length === 1);
}

// ---------- 6. 星级边界 ----------
{
  check('星级：9/9/12 → 3', F.starFor(9, 9, 12) === 3);
  check('星级：11/9/12 → 2', F.starFor(11, 9, 12) === 2);
  check('星级：12/9/12 → 1', F.starFor(12, 9, 12) === 1);
  check('星级：13/9/12 → 0', F.starFor(13, 9, 12) === 0);
}

// ---------- 7. 流片卡：真实 SHA-256 ----------
{
  const d = F.newDraft('fa');
  const r = appendFullAdder(d, I(0), I(1), I(2));
  d.outputs = [G(r.sumGateId), G(r.carryGateId)];
  const card = F.tapeOutCard(d, 0);
  check('流片卡生成', card.ok);
  const comp = F.compileDraft(d);
  check('流片卡 SHA-256 = tapnet 字节真哈希',
    card.card.sha === '0x' + T.sha256Hex(comp.bytes) && /^0x[0-9a-f]{64}$/.test(card.card.sha));
  check('流片卡字段：9 门 / 3 入 2 出 / 3 星',
    card.card.gates === 9 && card.card.nIn === 3 && card.card.nOut === 2 && card.card.stars === 3);
}

// ---------- 8. 挖矿公式 ----------
{
  const card36 = { nand: 36, latch: 0 };
  check('权重：36 门 × Behemoth ×6 = 216', F.minerWeight(card36, 'behemoth') === 216);
  check('权重：36 门 × TapeOut ×1 = 36', F.minerWeight(card36, 'tapeout') === 36);
  const out = F.dailyOutput(216, 100000);
  check('日产：216/100000×7200 = 15.552 游戏 BEM', Math.abs(out - 15.552) < 1e-9, '算得 ' + out);
  check('日产：权重 0 → 0', F.dailyOutput(0, 100000) === 0);
  const save = F.defaultSave();
  save.taped = [{ id: 'c1', name: '4 位加法器', nand: 36, latch: 0 }];
  save.miners = [{ cardId: 'c1', processor: 'behemoth' }];
  const s = F.settleDay(save);
  const expected = 216 / 100500 * 7200; // 全网权重先 ×1.005 → 100500
  check('结算一天：第 1 天、收入 = 公式值',
    s.day === 1 && Math.abs(s.total - expected) < 1e-9 && save.day === 1,
    '收入 ' + s.total.toFixed(6) + '，期望 ' + expected.toFixed(6));
  check('结算一天：lines 形状（cardName / processor / weight / out）',
    s.lines.length === 1 && s.lines[0].cardName === '4 位加法器' &&
    s.lines[0].weight === 216 && Math.abs(s.lines[0].out - expected) < 1e-9);
  check('结算一天：全网权重 100000 → 100500', s.totalWeight === 100500);
  check('结算一天：BEM 累计 = 当日收入', Math.abs(save.bem - expected) < 1e-9);
}

// ---------- 9. 稀有度 ----------
{
  check('稀有度 2443 → 普通', F.rarityOf(2443).name === '普通');
  check('稀有度 50 → 稀有', F.rarityOf(50).name === '稀有');
  check('稀有度 25 → 史诗', F.rarityOf(25).name === '史诗');
  check('稀有度 5 → 传说', F.rarityOf(5).name === '传说');
}

// ---------- 10. Test1 图鉴数据与样本文件一致 ----------
{
  const dir = JSON.parse(fs.readFileSync(path.join(SAMP, 'directory.json'), 'utf8'));
  for (const c of F.TEST1_CARDS) {
    const meta = JSON.parse(fs.readFileSync(path.join(SAMP, `test1-${c.id}-meta.json`), 'utf8'));
    const netBytes = read(`test1-${c.id}.tapnet`);
    check(`图鉴 #${c.id}：edition 与样本一致`,
      meta.tap.edition.index === c.editionIndex && meta.tap.edition.of === c.of);
    check(`图鉴 #${c.id}：SHA-256 与样本一致`,
      meta.tap.netlist.sha256.toLowerCase() === c.sha.toLowerCase() &&
      T.sha256Hex(netBytes) === c.sha.replace(/^0x/, '').toLowerCase());
    check(`图鉴 #${c.id}：门数与样本一致`,
      meta.tap.netlist.nIn === c.nIn && meta.tap.netlist.nOut === c.nOut &&
      meta.tap.netlist.nand === c.nand && meta.tap.netlist.latch === c.latch);
    check(`图鉴 #${c.id}：信息文件 SHA-256 = 目录登记`,
      ('0x' + T.sha256Hex(read(`test1-${c.id}-meta.json`))).toLowerCase() === dir.files[String(c.id)].toLowerCase());
  }
}

// ---------- 11. 存档默认值 ----------
{
  const s = F.defaultSave();
  check('存档默认：200 NAND / 20 LATCH / 0 BEM',
    s.nand === 200 && s.latch === 20 && s.bem === 0 && s.day === 0);
  check('存档默认：全网权重 100000', s.totalWeight === 100000);
  check('图鉴条目数', F.CODEX.length >= 20, F.CODEX.length + ' 条');
  check('三道真题都在', F.PROBLEMS.length === 3 && F.PROBLEMS.map(p => p.id).join(',') === 'fa,adder4,maj');
}

console.log('\n' + lines.join('\n'));
console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
