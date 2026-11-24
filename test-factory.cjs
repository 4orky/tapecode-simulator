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
  check('图鉴条目数', F.CODEX.length === 26, F.CODEX.length + ' 条');
  check('三道真题都在', F.PROBLEMS.length === 3 && F.PROBLEMS.map(p => p.id).join(',') === 'fa,adder4,maj');
}

// ---------- 12. 集市（第四章，P1） ----------
{
  const s = F.defaultSave();
  check('集市：默认存档含新字段（sites / relayGiB / lottery / cpu）',
    Array.isArray(s.sites) && s.relayGiB === 0 && s.lottery.day === -1 && s.cpu && s.cpu.powered === false);
  s.bem = 5;
  const b1 = F.buyParts(s, 'nand10');
  check('集市：1 BEM 买 10 NAND', b1.ok && Math.abs(s.bem - 4) < 1e-9 && s.nand === 210);
  check('集市：不存在的商品买不了', F.buyParts(s, 'nope').ok === false);
  const b2 = F.buyParts(s, 'latch20');
  check('集市：3 BEM 买 20 LATCH', b2.ok && Math.abs(s.bem - 1) < 1e-9 && s.latch === 40);
  check('集市：BEM 不够买不了（4 BEM 的货只剩 1 BEM）', F.buyParts(s, 'nand50').ok === false && Math.abs(s.bem - 1) < 1e-9);

  const s2 = F.defaultSave();
  s2.bem = 1;
  check('集市：开网站 BEM 不够', F.openSite(s2, 'Jacks Chips').ok === false);
  s2.bem = 5;
  const site = F.openSite(s2, 'Jacks Chips');
  check('集市：2 BEM 开网站，地址 tape:// 格式',
    site.ok && site.site.addr === 'tape://jacks-chips.factory' && Math.abs(s2.bem - 3) < 1e-9);
  check('集市：同名网站不能开第二家', F.openSite(s2, 'Jacks Chips').ok === false);
  check('集市：空名字开不了', F.openSite(s2, '   ').ok === false);
  check('集市：slug 规则', F.siteSlug('Hello World!') === 'hello-world' && F.siteSlug('') === 'mysite');

  const s3 = F.defaultSave();
  s3.bem = 0.1;
  check('集市：加购存储 BEM 不够', F.relayBuyStorage(s3).ok === false);
  s3.bem = 1;
  const rg = F.relayBuyStorage(s3);
  check('集市：0.2 BEM 加购 2 GiB', rg.ok && s3.relayGiB === 2 && Math.abs(s3.bem - 0.8) < 1e-9 && rg.totalGiB === 7);

  const e1 = F.relayEncryptDemo('今晚八点开图');
  const e2 = F.relayEncryptDemo('今晚八点开图');
  const e3 = F.relayEncryptDemo('明早九点开图');
  check('集市：加密演示指纹是 64 位 hex', /^0x[0-9a-f]{64}$/.test(e1.fingerprint));
  check('集市：加密演示同文同密文', e1.cipher === e2.cipher && e1.fingerprint === e2.fingerprint);
  check('集市：加密演示异文异指纹', e1.fingerprint !== e3.fingerprint);

  const parts = F.lotteryParticipants();
  check('集市：抽奖名单 8 人（含玩家）', parts.length === 8 && parts[0] === '你');
  const d1 = F.lotteryDraw(parts, 'tapeXO-day-1-block-100137');
  const d2 = F.lotteryDraw(parts, 'tapeXO-day-1-block-100137');
  check('集市：抽奖同种子同结果（可重算验证）', d1.winnerIndex === d2.winnerIndex && d1.hash === d2.hash);
  check('集市：抽奖结果在范围内', d1.winnerIndex >= 0 && d1.winnerIndex < parts.length && d1.winner === parts[d1.winnerIndex]);

  const s4 = F.defaultSave();
  s4.day = 3;
  const r1 = F.lotteryEnter(s4);
  check('集市：抽奖参加成功并记录', r1.ok && s4.lottery.day === 3 && s4.lottery.entered === true &&
    F.lotteryParticipants().includes(s4.lottery.winner));
  check('集市：抽奖中奖账目对得上', Math.abs(s4.bem - (r1.won ? F.LOTTERY_PRIZE_BEM : 0)) < 1e-9);
  check('集市：同一天不能参加两次', F.lotteryEnter(s4).ok === false);
  s4.day = 4;
  check('集市：第二天可以再参加', F.lotteryEnter(s4).ok === true && s4.lottery.day === 4);

  const s5 = F.defaultSave();
  check('集市：没流片卡时集市未解锁', F.marketUnlocked(s5) === false && F.cpuUnlocked(s5) === false);
  s5.taped = [{ id: 'c1', name: '全加器', nand: 9, latch: 0 }];
  check('集市：有流片卡后集市与 CPU 神殿解锁', F.marketUnlocked(s5) === true && F.cpuUnlocked(s5) === true);

  const s6 = F.defaultSave();
  const marketEntry = F.CODEX.find(e => e.id === 'market');
  const cpuEntry = F.CODEX.find(e => e.id === 'cpu4');
  check('集市：图鉴“集市”须逛过集市才解锁',
    marketEntry && F.codexUnlocked(s6, marketEntry) === false &&
    (s6.visited.market = true, F.codexUnlocked(s6, marketEntry) === true));
  check('集市：图鉴“4 位 CPU”须逛过 CPU 神殿才解锁',
    cpuEntry && F.codexUnlocked(s6, cpuEntry) === false &&
    (s6.visited.cpu = true, F.codexUnlocked(s6, cpuEntry) === true));
}

// ---------- 13. 终章 4 位计数器（真 tapnet 电路） ----------
{
  const cc = F.buildCounterCircuit();
  check('终章：计数器电路生成', cc.ok && cc.circuit.nNand === 25 && cc.circuit.nLatch === 4,
    cc.ok ? '' : cc.reason);
  check('终章：计数器 0 入 4 出', cc.ok && cc.circuit.nIn === 0 && cc.circuit.nOut === 4);
  check('终章：计数器 SHA-256 = 电路字节真哈希',
    cc.ok && cc.sha === '0x' + T.sha256Hex(cc.bytes) && /^0x[0-9a-f]{64}$/.test(cc.sha));
  let state = [0, 0, 0, 0];
  const seq = [];
  for (let i = 0; i < 17; i++) {
    const r = T.beat(cc.circuit, state, []);
    seq.push(F.counterValue(r.outputs));
    state = r.state;
  }
  check('终章：计数器 17 拍 0→15→0 完整循环', seq.join(',') === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0', seq.join(','));
  check('终章：counterValue 位序（LSB-first）',
    F.counterValue([1, 0, 1, 0]) === 5 && F.counterValue([0, 0, 0, 0]) === 0 && F.counterValue([1, 1, 1, 1]) === 15);

  const save = F.defaultSave();
  save.taped = [{ id: 'c1', name: '4 位加法器', nand: 36, latch: 0 }];
  save.miners = [{ cardId: 'c1', processor: 'behemoth' }];
  const s = F.settleDay(save);
  check('终章：结算累计挖矿 minedTotal', Math.abs(save.minedTotal - s.total) < 1e-9, '累计 ' + save.minedTotal.toFixed(4));
}

// ---------- 14. 引导与里程碑（第 3 轮） ----------
{
  const fresh = F.defaultSave();
  check('引导：新玩家第一步是设计台', F.nextStep(fresh).target === 'prologue');
  const s1 = F.defaultSave(); s1.visited.prologue = true;
  check('引导：逛过设计台后去任务板', F.nextStep(s1).target === 'ch1');
  const s2 = F.defaultSave(); s2.visited.prologue = true; s2.passed = { fa: { gates: 9, stars: 3 } };
  check('引导：通过一题后去流片', F.nextStep(s2).target === 'tapeout');
  const s3 = F.defaultSave(); s3.visited.prologue = true; s3.passed = { fa: { gates: 9, stars: 3 } };
  s3.taped = [{ id: 'c1', name: '全加器', nand: 9, latch: 0 }];
  check('引导：流片后去矿场', F.nextStep(s3).target === 'mining');
  const s4 = F.defaultSave(); s4.visited.prologue = true; s4.passed = { fa: { gates: 9, stars: 3 } };
  s4.taped = [{ id: 'c1', name: '全加器', nand: 9, latch: 0 }];
  s4.miners = [{ cardId: 'c1', processor: 'tapeout' }];
  check('引导：有矿机没结算过去矿场结算', F.nextStep(s4).target === 'mining');
  s4.day = 1; s4.minedTotal = 0.6;
  check('引导：结算后去集市', F.nextStep(s4).target === 'market');
  s4.visited.market = true;
  check('引导：逛过集市后去 CPU 神殿', F.nextStep(s4).target === 'cpu');
  s4.cpu.lit = true;
  check('引导：点亮后先去开厂', F.nextStep(s4).target === 'factory');
  s4.processors = [{ name: '阿杰的芯片厂', price: 0.02, dayOpened: 1, tapeouts: 0, earned: 0 }];
  check('引导：开厂后去卡片馆', F.nextStep(s4).target === 'test1');
  s4.visited.test1 = true;
  s4.prologueDone = { not: true, and: true, or: true, latch: true };
  s4.sites = [{ name: '阿杰的芯片铺', slug: 'mysite', addr: 'tape://mysite.factory', day: 1 }];
  s4.lottery.entered = true;
  s4.tokens = [{ name: '阿杰币', symbol: 'CHIP', mintedDay: 1, graduated: true, locked: 5, balance: 1.2 }];
  check('引导：全通后去图鉴', F.nextStep(s4).target === 'codex');

  const m0 = F.milestones(F.defaultSave());
  check('里程碑：新玩家 10 个全未完成', m0.length === 10 && m0.every(m => !m.done));
  const m1 = F.milestones(s4);
  check('里程碑：全通存档 10 个全完成', m1.length === 10 && m1.every(m => m.done));
}

// ---------- 15. 第五章开厂与发币（第 4 轮） ----------
{
  check('开厂：客流确定性（同名同天恒同）',
    F.processorArrivals('阿杰的芯片厂', 5) === F.processorArrivals('阿杰的芯片厂', 5));
  const a = F.processorArrivals('阿杰的芯片厂', 5);
  check('开厂：客流 0–3 位', a >= 0 && a <= 3, '当日 ' + a + ' 位');

  const save = F.defaultSave();
  save.bem = 10;
  const r1 = F.openProcessor(save, '阿杰的芯片厂', 0.02);
  check('开厂：花 5 游戏 BEM 开一台', r1.ok && save.bem === 5 && save.processors.length === 1);
  check('开厂：同名拒绝', !F.openProcessor(save, '阿杰的芯片厂', 0.02).ok);
  check('开厂：非法定价拒绝', !F.openProcessor(save, '另一家', 0.03).ok);
  check('开厂：名字超 20 字拒绝', !F.openProcessor(save, '一二三四五六七八九十一二三四五六七八九十一', 0.02).ok);
  save.bem = 4;
  check('开厂：BEM 不够拒绝', !F.openProcessor(save, '另一家', 0.02).ok);

  const save2 = F.defaultSave();
  save2.taped = [{ id: 'c1', name: '全加器', nand: 9, latch: 0 }];
  save2.miners = [{ cardId: 'c1', processor: 'tapeout' }];
  save2.bem = 0;
  save2.processors = [{ name: '阿杰的芯片厂', price: 0.02, dayOpened: 0, tapeouts: 0, earned: 0 }];
  const day = save2.day + 1;
  const expectArr = F.processorArrivals('阿杰的芯片厂', day);
  const expectRev = expectArr * 0.02 * 10;
  const s = F.settleDay(save2);
  check('开厂：结算收流片费（确定性）',
    Math.abs(save2.processors[0].earned - expectRev) < 1e-9 && save2.processors[0].tapeouts === expectArr,
    '来 ' + expectArr + ' 位，收 ' + expectRev.toFixed(2));
  check('开厂：结算返回 factoryTotal', Math.abs((s.factoryTotal || 0) - expectRev) < 1e-9);
  check('开厂：矿机产量不受影响', Math.abs(s.total - 9 / 100500 * 7200) < 1e-6);

  const save3 = F.defaultSave();
  save3.bem = 10;
  const m1 = F.launchToken(save3, '阿杰币');
  check('发币：mint 1 游戏 BEM，符号 CHIP', m1.ok && m1.symbol === 'CHIP' && save3.bem === 9 && save3.tokens.length === 1);
  check('发币：同名拒绝', !F.launchToken(save3, '阿杰币').ok);
  save3.bem = 0;
  check('发币：BEM 不够拒绝', !F.launchToken(save3, '新币').ok);
  save3.bem = 10;
  check('发币：开币不满 2 天不能毕业', !F.graduateToken(save3, '阿杰币').ok);
  save3.day = 2;
  const g1 = F.graduateToken(save3, '阿杰币');
  check('发币：满 2 天锁 5 游戏 BEM 毕业', g1.ok && save3.bem === 5 && save3.tokens[0].graduated && save3.tokens[0].locked === 5);
  check('发币：已毕业不能再毕业', !F.graduateToken(save3, '阿杰币').ok);

  const save4 = F.defaultSave();
  save4.taped = [{ id: 'c1', name: '全加器', nand: 9, latch: 0 }];
  save4.miners = [{ cardId: 'c1', processor: 'tapeout' }];
  save4.tokens = [{ name: '阿杰币', symbol: 'CHIP', mintedDay: 0, graduated: true, locked: 5, balance: 0 }];
  const s4 = F.settleDay(save4);
  check('发币：毕业后矿机同时挖你的币（当日产量 10%）',
    Math.abs(save4.tokens[0].balance - s4.total * 0.1) < 1e-9, '币 + ' + save4.tokens[0].balance.toFixed(4));
}

// ---------- 16. 生命游戏（第 5 轮：真 tapnet 电路） ----------
{
  const lc = F.buildLifeCircuit();
  check('生命游戏：电路生成', lc.ok && lc.circuit.nNand === 1600 && lc.circuit.nLatch === 16,
    lc.ok ? '' : lc.reason);
  check('生命游戏：0 入 16 出', lc.ok && lc.circuit.nIn === 0 && lc.circuit.nOut === 16);
  check('生命游戏：SHA-256 = 电路字节真哈希',
    lc.ok && lc.sha === '0x' + T.sha256Hex(lc.bytes) && /^0x[0-9a-f]{64}$/.test(lc.sha));
  check('生命游戏：预设齐全',
    F.LIFE_PRESETS.blinker.cells.join(',') === '5,6,7' &&
    F.LIFE_PRESETS.block.cells.join(',') === '5,6,9,10' &&
    F.LIFE_PRESETS.glider.cells.join(',') === '1,6,8,9,10');

  // 参考实现（纯 JS 生命游戏，4×4 环面）与电路逐代对拍
  function refStep(cells) {
    const out = new Array(16).fill(0);
    for (let i = 0; i < 16; i++) {
      const n = F.lifeNeighbors(i).reduce((a, j) => a + cells[j], 0);
      out[i] = (n === 3 || (cells[i] === 1 && n === 2)) ? 1 : 0;
    }
    return out;
  }
  function runCircuit(seed, gens) {
    let state = seed.slice();
    const seq = [];
    for (let g = 0; g < gens; g++) {
      seq.push(T.peek(lc.circuit, state, []).outputs.join(''));
      state = T.beat(lc.circuit, state, []).state;
    }
    return seq;
  }
  function runRef(seed, gens) {
    let ref = seed.slice();
    const seq = [];
    for (let g = 0; g < gens; g++) { seq.push(ref.join('')); ref = refStep(ref); }
    return seq;
  }
  const blinker = [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0];
  const block = [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0];
  const glider = [0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0];
  check('生命游戏：闪烁器 6 代与参考实现一致（2 代一循环）',
    runCircuit(blinker, 6).join('|') === runRef(blinker, 6).join('|'));
  check('生命游戏：方块 6 代稳定不动',
    runCircuit(block, 6).every(s => s === '0000011001100000'));
  check('生命游戏：滑翔机 6 代与参考实现一致',
    runCircuit(glider, 6).join('|') === runRef(glider, 6).join('|'));
}

console.log('\n' + lines.join('\n'));
console.log(`\n合计：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
