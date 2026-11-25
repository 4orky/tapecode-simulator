/* 《链上造芯厂》多语言词典（第 58 轮）
 * 结构：I18N = { zh: {...}, en: {...} }，key 用点分路径；t(key, vars) 查词。
 * 回退规则：当前语言缺 key → 回中文；中文也没有 → 返回 key 本身。
 * 专有名词一律不翻译：TapeOut / BEM / NAND / LATCH / PoD / DeWEB / TapeRelay /
 * tapeXO / Test1、合约地址、URL、数字与快照日期。
 * 语言选择存 localStorage 'tapecode-lang'（内存 _lang 兜底，供 Node 回归用）。
 * 切换器选项只列已有词典的语言（第 58 轮：中文、English；日/韩/西在第 59–61 轮
 * 加入词典后自动出现，不用改切换器代码）。
 * factory.js 与测试都从这里取 t()：浏览器走 window.TapeI18n，Node 走 require。
 */
(function (root) {
  var LS_KEY = 'tapecode-lang';
  var LANG_NAMES = { zh: '中文', en: 'English', ja: '日本語', ko: '한국어', es: 'Español' };
  var LANG_HTML = { zh: 'zh-CN', en: 'en', ja: 'ja', ko: 'ko', es: 'es' };
  var _lang = null;
  var I18N = {
    zh: {
      'meta.title': '链上造芯厂 — TapeOut · From One NAND to a CPU',
      'meta.description': '《链上造芯厂》：玩着就明白 TapeOut 生态的网页游戏——从一块 NAND 门起步，画电路、流片成链上电路 NFT、按设计质量挖 BEM，最后点亮一台属于自己的 4 位 CPU。另附真实 Test1 网表模拟器。免费玩，不连钱包、不花真钱。',
      'noscript': '《链上造芯厂》需要 JavaScript 才能玩（画电路、跑仿真都在浏览器里算）。请启用 JavaScript 后刷新页面。',
      'hud.bem': '游戏 BEM',
      'hud.gameTag': '游戏币，不是真实 BEM',
      'hud.assets': '☰ 资产',
      'hud.nand': '晶体管 NAND',
      'hud.dayPre': '第',
      'hud.dayPost': '天',
      'hud.nextPrefix': '👉 下一步：',
      'hud.goalTitle': '当前目标，点一下就去',
      'hud.soundTitle': '音效开关',
      'nav.town': '🏘 小镇地图',
      'nav.prologue': '设计台',
      'nav.ch1': '任务板',
      'nav.tapeout': '流片厂',
      'nav.mining': '矿场',
      'nav.market': '集市',
      'nav.cpu': 'CPU 神殿',
      'nav.factory': '处理器工厂',
      'nav.test1': '卡片馆',
      'nav.codex': '图鉴',
      'status.init': '初始化…',
      'sec.town.title': '生态小镇',
      'sec.town.intro': '小镇里的每栋建筑都是 TapeOut 生态的一个组件。去过的地方会亮灯。按这个顺序走一圈，你就走完了整个生态：',
      'town.foldJourney': '旅程进度',
      'town.foldMilestones': '里程碑',
      'town.foldSave': '💾 存档',
      'town.nextPrefix': '👉 下一步：',
      'town.goBtn': '去 →',
      'town.msDone': '已完成 {done} / {total}',
      'town.foldMilestonesCount': '里程碑 {done} / {total}',
      'journey.buy': '买零件',
      'journey.draw': '画电路',
      'journey.tapeout': '流片',
      'journey.mine': '挖矿',
      'journey.spend': '花 BEM',
      'journey.cpu': '点亮 CPU',
      'journey.factory': '开厂 / 建应用',
      'journey.noteOpen': '（你已开厂：小镇里多了一栋处理器工厂）',
      'journey.noteClosed': '（开厂在小镇的处理器工厂，点亮 CPU 后解锁）',
      'b.prologue.name': '设计台',
      'b.prologue.desc': '序章 · 两块积木',
      'b.prologue.hint': '认识 NAND 与 LATCH：拨开关，看信号流',
      'b.ch1.name': '任务板',
      'b.ch1.desc': '第一章 · 接单',
      'b.ch1.lock': '先去设计台逛逛',
      'b.tapeout.name': '流片厂',
      'b.tapeout.desc': '第二章 · 流片',
      'b.tapeout.lock': '先通过一道题（任务板）',
      'b.mining.name': '矿场',
      'b.mining.desc': '第三章 · 挖 BEM',
      'b.mining.lock': '先流片一张电路卡',
      'b.market.name': '集市',
      'b.market.desc': '第四章 · 花 BEM',
      'b.market.lock': '先流片一张电路卡',
      'b.cpu.name': 'CPU 神殿',
      'b.cpu.desc': '终章 · 点亮 CPU',
      'b.cpu.lock': '先流片一张电路卡',
      'b.factory.name': '处理器工厂',
      'b.factory.desc': '第五章 · 开厂',
      'b.factory.lock': '先点亮 CPU（神殿）',
      'b.test1.name': '卡片馆',
      'b.test1.desc': 'Test1 图鉴 · 真实网表',
      'b.test1.hint': '5 张真实 Test1 电路卡，可进模拟器玩',
      'b.codex.name': '图鉴',
      'b.codex.desc': '生态全景',
      'b.codex.hint': '每遇到一个新组件，图鉴亮一条',
      'next.prologue': '先去设计台：拨动开关，认识 NAND 与 LATCH 两块积木。',
      'next.ch1': '去任务板：搭出全加器，真值表全过就交货。',
      'next.tapeout': '去流片厂：把通过的电路烧成一张改不了的电路卡。',
      'next.mining': '去矿场：把电路卡注册成矿机，选 Behemoth ×6 或 TapeOut ×1。',
      'next.miningSettle': '去矿场点「结算一天」，看你的矿机产出第一笔游戏 BEM。',
      'next.market': '去集市：把挖到的游戏 BEM 花出去——买零件、开网站、抽奖。',
      'next.cpu': '去 CPU 神殿：给 4 位 CPU 上电，跑满 16 拍点亮它。',
      'next.factory': '去处理器工厂：花 5 游戏 BEM 开自己的处理器，自己定晶体管价——但先看清长尾：389 台里 111 台 0 产出。',
      'next.test1': '去卡片馆：玩 5 张真实 Test1 电路卡的网表。',
      'next.done': '通关了！去图鉴看看生态全景（35 条），或者继续优化电路、冲击更少门数。',
      'ms.prologue': '认识两块积木',
      'ms.firstPass': '第一道 PoD 题通过',
      'ms.firstTape': '第一张流片卡',
      'ms.firstMiner': '第一台矿机',
      'ms.firstBem': '第一笔游戏 BEM 到账',
      'ms.firstSite': '第一家 DeWEB 网站',
      'ms.firstLottery': '第一次参加抽奖',
      'ms.cpuLit': '点亮 CPU',
      'ms.firstFactory': '开一家处理器',
      'ms.firstToken': '发一个自己的币',
      'save.hint': '存档只存在这台设备的浏览器里。换设备时：先点“导出存档”拿到 JSON，再到另一台设备粘贴“导入存档”。',
      'save.export': '⬇ 导出存档',
      'save.import': '⬆ 导入存档',
      'save.importPlaceholder': '把导出的 JSON 粘贴到这里，再点一次“导入存档”',
      'save.exported': '存档已导出：tapecode-save.json。',
      'save.exportFail': '导出失败（这台浏览器不支持文件下载）：',
      'save.importPrompt': '把导出的 JSON 粘贴到上面，再点一次“导入存档”。',
      'save.importFail': '导入失败：',
      'save.imported': '导入成功：存档已恢复。',
      'codex.progress': '已解锁 {n} / {total} 条。解锁条件：去小镇里对应的地方逛逛。',
      'footer.honesty': '诚实说明：本游戏是教学演示，不连钱包、不花真钱、不承诺任何收益。游戏里的 BEM 是<b>游戏币，不是真实 BEM</b>。真实数字标有快照时间（2026-11-24），Test1 网表是随机分配的，不是 PoD 题答案。网表本身不在链上；信任根是链上 baseURI 指纹 + SHA-256 校验链。TapeSend 集成未核实，本游戏不声称已集成。',
      'footer.source': '数据源：X Layer 链上 TapeCode-Test1 合约 <code>0x0e91460D6823C711643e650A9a4C0cc21DE41614</code>；网表每次从链上 baseURI() 起步逐项 SHA-256 校验，失败时回本地样本并明说。快照时间 2026-11-24。回归报告见 REGRESSION.md。',
      'welcome.title': '欢迎来到《链上造芯厂》',
      'welcome.p1': 'TapeOut 是把芯片制造搬上区块链：设计电路、流片上链、按设计质量挖 BEM。这款游戏让你 20 分钟玩明白它。',
      'welcome.p2': '路线：设计台认识 NAND 与 LATCH → 任务板接单画电路 → 流片成卡 → 注册矿机每天结算 → 集市花 BEM → 开厂、发币 → 点亮一台属于自己的 4 位 CPU。',
      'welcome.p3': '不连钱包、不花真钱、不承诺收益。游戏里的 BEM 是游戏币，不是真实 BEM。',
      'welcome.start': '开始造芯 →',
      'welcome.later': '先自己逛逛',
      'sec.prologue.title': '序章 · 两块积木',
      'sec.prologue.intro': '整个 TapeOut 生态只用两块积木：<b>NAND 负责算，LATCH 负责记</b>。拨动开关，看信号沿着线流动——线色沿用 Logisim：1 是亮绿，0 是暗绿。',
      'sec.ch1.title': '第一章 · 接单：PoD 真题',
      'sec.ch1.intro': '这是真实的 PoD（Proof of Design）题目：客户要的电路，你用 NAND 门搭出来，真值表全过才算交货。门越少，星越多——真实的 PoD 奖励也是按门数算权重的。',
      'ch1.addGate': '+ 添加 NAND 门（1 晶体管）',
      'ch1.verify': '✓ 验货（跑真值表）',
      'ch1.toTapeout': '去流片 →',
      'ch1.clear': '清空画布',
      'ch1.wiringHint': '连线方法：先点一个信号源（左侧输入脚 / 常量 / 某个门的输出小圆点），再点目标引脚；点一条已有的线可以删掉它；拖动门身可移动位置。输出脚是终点：接了输出脚的门不能再分给别的门。',
      'ch1.liveSignals': '实时信号',
      'ch1.truthTable': '真值表验货',
      'sec.tapeout.title': '第二章 · 流片厂',
      'sec.tapeout.intro': '真值表全过的电路可以流片：把草稿上的门烧进芯片，变成一张改不了的电路卡。草稿会被烧掉——和真芯片一样，流片之后就不能改了。',
      'tapeout.myCards': '我的电路卡',
      'sec.mining.title': '第三章 · 矿场',
      'sec.mining.intro': '把流片卡注册成矿机，选一台处理器，每天按权重分 BEM。游戏里的 BEM 是<b>游戏币，不是真实 BEM</b>，不能提现、不能兑换。',
      'sec.market.title': '第四章 · 集市',
      'sec.market.intro': '挖出来的游戏 BEM 要花出去才有意义。这里的每一分钱都是<b>游戏币，不是真实 BEM</b>，不能提现、不能兑换。真实的 TapeOut 也在愁同一件事：BEM 能花的地方还不多。',
      'sec.cpu.title': '终章 · 点亮 CPU',
      'sec.cpu.intro': '把前面几章攒下的电路按图纸拼成一台 4 位 CPU，像 Behemoth 一样上电：时钟一拍一拍走，区块就是时钟。',
      'sec.factory.title': '第五章 · 开厂与发币',
      'sec.factory.intro': '从工人变老板：开自己的处理器、发自己的币。但先看清长尾——<b>开厂不等于赚钱</b>。这里花的、赚的都是<b>游戏币，不是真实 BEM</b>，不能提现、不能兑换。',
      'sec.test1.title': '卡片馆 · Test1 真实网表图鉴',
      'sec.test1.intro': '下面是 5 张真实的 TapeCode-Test1 电路卡：编号、门数、稀有度、网表 SHA-256 都是链上核对过的真数据（快照 2026-11-24）。网表是随机分配的，不是 PoD 题的标准答案。',
      'sec.sim.title': '模拟器 · 真实网表',
      'sim.back': '← 回卡片馆',
      'sim.tokenLabel': 'Test1 编号',
      'sim.prev': '← 上一张',
      'sim.prevTitle': '上一张',
      'sim.next': '下一张 →',
      'sim.nextTitle': '下一张',
      'sim.loadLive': '从链上加载（9 步校验）',
      'sim.loadLocal': '加载本地样本',
      'sec.codex.title': '图鉴 · 生态全景'
    },
    en: {
      'meta.title': 'On-Chain Chip Factory — TapeOut · From One NAND to a CPU',
      'meta.description': 'On-Chain Chip Factory: a web game that teaches the TapeOut ecosystem by playing — start from a single NAND gate, draw circuits, tape out on-chain circuit NFTs, mine BEM by design quality, and finally light up your own 4-bit CPU. Includes a real Test1 netlist simulator. Free to play, no wallet, no real money.',
      'noscript': 'On-Chain Chip Factory needs JavaScript to play (drawing circuits and running simulations all happen in your browser). Please enable JavaScript and refresh the page.',
      'hud.bem': 'Game BEM',
      'hud.gameTag': 'Game currency, not real BEM',
      'hud.assets': '☰ Assets',
      'hud.nand': 'Transistors NAND',
      'hud.dayPre': 'Day',
      'hud.dayPost': '',
      'hud.nextPrefix': '👉 Next: ',
      'hud.goalTitle': 'Current goal — tap to go there',
      'hud.soundTitle': 'Sound on/off',
      'nav.town': '🏘 Town Map',
      'nav.prologue': 'Workbench',
      'nav.ch1': 'Task Board',
      'nav.tapeout': 'Tape-Out Fab',
      'nav.mining': 'Mine',
      'nav.market': 'Market',
      'nav.cpu': 'CPU Shrine',
      'nav.factory': 'Processor Factory',
      'nav.test1': 'Card Gallery',
      'nav.codex': 'Codex',
      'status.init': 'Loading…',
      'sec.town.title': 'Eco Town',
      'sec.town.intro': 'Every building in town is one component of the TapeOut ecosystem. Places you have visited light up. Walk the loop once and you have walked the whole ecosystem:',
      'town.foldJourney': 'Journey',
      'town.foldMilestones': 'Milestones',
      'town.foldSave': '💾 Save',
      'town.nextPrefix': '👉 Next: ',
      'town.goBtn': 'Go →',
      'town.msDone': 'Done {done} / {total}',
      'town.foldMilestonesCount': 'Milestones {done} / {total}',
      'journey.buy': 'Buy parts',
      'journey.draw': 'Draw circuits',
      'journey.tapeout': 'Tape out',
      'journey.mine': 'Mine',
      'journey.spend': 'Spend BEM',
      'journey.cpu': 'Light up the CPU',
      'journey.factory': 'Open a factory / build apps',
      'journey.noteOpen': '(You already run a factory: town has one more building, the Processor Factory)',
      'journey.noteClosed': '(Open a factory at the Processor Factory in town, unlocked after you light up the CPU)',
      'b.prologue.name': 'Workbench',
      'b.prologue.desc': 'Prologue · Two building blocks',
      'b.prologue.hint': 'Meet NAND and LATCH: flip switches and watch signals flow',
      'b.ch1.name': 'Task Board',
      'b.ch1.desc': 'Chapter 1 · Taking orders',
      'b.ch1.lock': 'Visit the Workbench first',
      'b.tapeout.name': 'Tape-Out Fab',
      'b.tapeout.desc': 'Chapter 2 · Tape-out',
      'b.tapeout.lock': 'Pass one problem first (Task Board)',
      'b.mining.name': 'Mine',
      'b.mining.desc': 'Chapter 3 · Mining BEM',
      'b.mining.lock': 'Tape out a circuit card first',
      'b.market.name': 'Market',
      'b.market.desc': 'Chapter 4 · Spending BEM',
      'b.market.lock': 'Tape out a circuit card first',
      'b.cpu.name': 'CPU Shrine',
      'b.cpu.desc': 'Finale · Light up the CPU',
      'b.cpu.lock': 'Tape out a circuit card first',
      'b.factory.name': 'Processor Factory',
      'b.factory.desc': 'Chapter 5 · Opening a factory',
      'b.factory.lock': 'Light up the CPU first (Shrine)',
      'b.test1.name': 'Card Gallery',
      'b.test1.desc': 'Test1 Codex · Real netlists',
      'b.test1.hint': '5 real Test1 circuit cards — play them in the simulator',
      'b.codex.name': 'Codex',
      'b.codex.desc': 'Ecosystem panorama',
      'b.codex.hint': 'Every new component you meet lights up one entry',
      'next.prologue': 'Go to the Workbench: flip switches and meet the two building blocks, NAND and LATCH.',
      'next.ch1': 'Go to the Task Board: build a full adder and pass the whole truth table to deliver.',
      'next.tapeout': 'Go to the Tape-Out Fab: burn a passed circuit into a circuit card that can never be changed.',
      'next.mining': 'Go to the Mine: register a circuit card as a miner — Behemoth ×6 or TapeOut ×1.',
      'next.miningSettle': 'Go to the Mine and hit “Settle a day” to see your miner earn its first game BEM.',
      'next.market': 'Go to the Market: spend the game BEM you mined — buy parts, open a website, enter a draw.',
      'next.cpu': 'Go to the CPU Shrine: power up the 4-bit CPU and run 16 beats to light it up.',
      'next.factory': 'Go to the Processor Factory: spend 5 game BEM to open your own processor and set your own transistor price — but mind the long tail first: 111 of 389 processors earn 0.',
      'next.test1': 'Go to the Card Gallery: play the netlists of 5 real Test1 circuit cards.',
      'next.done': 'You did it! Go to the Codex for the full ecosystem panorama (35 entries), or keep optimizing circuits for fewer gates.',
      'ms.prologue': 'Met the two building blocks',
      'ms.firstPass': 'Passed the first PoD problem',
      'ms.firstTape': 'First tape-out card',
      'ms.firstMiner': 'First miner',
      'ms.firstBem': 'First game BEM received',
      'ms.firstSite': 'First DeWEB website',
      'ms.firstLottery': 'First draw entry',
      'ms.cpuLit': 'Lit up the CPU',
      'ms.firstFactory': 'Opened a processor',
      'ms.firstToken': 'Launched your own coin',
      'save.hint': 'Your save lives only in this device’s browser. To switch devices: tap “Export save” to get the JSON, then paste it into “Import save” on the other device.',
      'save.export': '⬇ Export save',
      'save.import': '⬆ Import save',
      'save.importPlaceholder': 'Paste the exported JSON here, then tap “Import save” again',
      'save.exported': 'Save exported: tapecode-save.json.',
      'save.exportFail': 'Export failed (this browser does not support file downloads): ',
      'save.importPrompt': 'Paste the exported JSON above, then tap “Import save” again.',
      'save.importFail': 'Import failed: ',
      'save.imported': 'Import succeeded: save restored.',
      'codex.progress': 'Unlocked {n} / {total} entries. How to unlock: visit the matching place in town.',
      'footer.honesty': 'Honesty note: this game is a teaching demo — no wallet, no real money, no promised returns. BEM in the game is <b>game currency, not real BEM</b>. Real figures carry a snapshot time (2026-11-24); Test1 netlists are randomly assigned, not PoD answers. Netlists themselves are not on-chain; the trust root is the on-chain baseURI fingerprint plus the SHA-256 verification chain. TapeSend integration is unverified; this game does not claim it.',
      'footer.source': 'Sources: X Layer on-chain TapeCode-Test1 contract <code>0x0e91460D6823C711643e650A9a4C0cc21DE41614</code>; every netlist is verified item by item with SHA-256 starting from the on-chain baseURI(), falling back to local samples and saying so on failure. Snapshot 2026-11-24. Regression report: REGRESSION.md.',
      'welcome.title': 'Welcome to On-Chain Chip Factory',
      'welcome.p1': 'TapeOut moves chip manufacturing onto the blockchain: design circuits, tape them out on-chain, and mine BEM by design quality. This game teaches you how it works in 20 minutes.',
      'welcome.p2': 'Route: meet NAND and LATCH at the Workbench → take orders and draw circuits at the Task Board → tape out into cards → register miners for daily settlement → spend BEM at the Market → open a factory, launch a coin → light up your own 4-bit CPU.',
      'welcome.p3': 'No wallet, no real money, no promised returns. BEM in the game is game currency, not real BEM.',
      'welcome.start': 'Start building →',
      'welcome.later': 'Look around first',
      'sec.prologue.title': 'Prologue · Two building blocks',
      'sec.prologue.intro': 'The whole TapeOut ecosystem uses just two building blocks: <b>NAND computes, LATCH remembers</b>. Flip a switch and watch the signal flow — wire colors follow Logisim: 1 is bright green, 0 is dark green.',
      'sec.ch1.title': 'Chapter 1 · Taking orders: real PoD problems',
      'sec.ch1.intro': 'These are real PoD (Proof of Design) problems: the client wants a circuit, you build it from NAND gates, and delivery means passing the whole truth table. Fewer gates, more stars — real PoD rewards are also weighted by gate count.',
      'ch1.addGate': '+ Add NAND gate (1 transistor)',
      'ch1.verify': '✓ Verify (run truth table)',
      'ch1.toTapeout': 'To tape-out →',
      'ch1.clear': 'Clear canvas',
      'ch1.wiringHint': 'How to wire: click a signal source first (an input pin on the left / a constant / a gate output dot), then click the target pin; click an existing wire to delete it; drag a gate body to move it. An output pin is the end of the line: a gate wired to an output pin cannot feed another gate.',
      'ch1.liveSignals': 'Live signals',
      'ch1.truthTable': 'Truth-table verification',
      'sec.tapeout.title': 'Chapter 2 · Tape-Out Fab',
      'sec.tapeout.intro': 'A circuit that passes its truth table can be taped out: burn the gates from your draft into a chip and it becomes a circuit card that can never be changed. The draft is burned away — just like a real chip, you cannot edit it after tape-out.',
      'tapeout.myCards': 'My circuit cards',
      'sec.mining.title': 'Chapter 3 · Mine',
      'sec.mining.intro': 'Register a tape-out card as a miner, pick a processor, and earn BEM daily by weight. BEM in the game is <b>game currency, not real BEM</b> — it cannot be cashed out or exchanged.',
      'sec.market.title': 'Chapter 4 · Market',
      'sec.market.intro': 'Mined game BEM only matters if you spend it. Every cent here is <b>game currency, not real BEM</b> — it cannot be cashed out or exchanged. Real TapeOut worries about the same thing: there are still few places to spend BEM.',
      'sec.cpu.title': 'Finale · Light up the CPU',
      'sec.cpu.intro': 'Assemble the circuits from earlier chapters into a 4-bit CPU and power it up like Behemoth: the clock ticks beat by beat, and a block is a clock tick.',
      'sec.factory.title': 'Chapter 5 · Opening a factory and launching a coin',
      'sec.factory.intro': 'From worker to boss: open your own processor and launch your own coin. But look at the long tail first — <b>opening a factory does not mean making money</b>. Everything spent and earned here is <b>game currency, not real BEM</b> — it cannot be cashed out or exchanged.',
      'sec.test1.title': 'Card Gallery · Test1 real-netlist codex',
      'sec.test1.intro': 'Below are 5 real TapeCode-Test1 circuit cards: number, gate count, rarity and netlist SHA-256 are all real data verified on-chain (snapshot 2026-11-24). Netlists are randomly assigned, not the standard answers to PoD problems.',
      'sec.sim.title': 'Simulator · Real netlists',
      'sim.back': '← Back to Card Gallery',
      'sim.tokenLabel': 'Test1 number',
      'sim.prev': '← Previous',
      'sim.prevTitle': 'Previous',
      'sim.next': 'Next →',
      'sim.nextTitle': 'Next',
      'sim.loadLive': 'Load from chain (9-step check)',
      'sim.loadLocal': 'Load local sample',
      'sec.codex.title': 'Codex · Ecosystem panorama'
    }
  };

  function currentLang() {
    if (_lang && I18N[_lang]) return _lang;
    try {
      var l = root.localStorage && root.localStorage.getItem(LS_KEY);
      if (l && I18N[l]) return l;
    } catch (e) {}
    return 'zh';
  }
  function t(key, vars) {
    var lang = currentLang();
    var s = (I18N[lang] && I18N[lang][key] !== undefined) ? I18N[lang][key]
      : (I18N.zh[key] !== undefined ? I18N.zh[key] : key);
    if (vars) { for (var k in vars) s = s.split('{' + k + '}').join(String(vars[k])); }
    return s;
  }
  var hooks = [];
  function onChange(fn) { hooks.push(fn); }
  function buildLangSelect() {
    if (!root.document) return;
    var sel = root.document.getElementById('lang-select');
    if (!sel) return;
    var cur = currentLang();
    sel.innerHTML = Object.keys(I18N).map(function (l) {
      return '<option value="' + l + '"' + (l === cur ? ' selected' : '') + '>' + (LANG_NAMES[l] || l) + '</option>';
    }).join('');
    sel.value = cur;
  }
  function applyI18n() {
    if (!root.document) return;
    root.document.documentElement.lang = LANG_HTML[currentLang()] || 'zh-CN';
    Array.prototype.forEach.call(root.document.querySelectorAll('[data-i18n]'), function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(root.document.querySelectorAll('[data-i18n-html]'), function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    Array.prototype.forEach.call(root.document.querySelectorAll('[data-i18n-title]'), function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    var meta = root.document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('meta.description'));
    var title = root.document.querySelector('title');
    if (title) title.textContent = t('meta.title');
    buildLangSelect();
  }
  function setLang(l) {
    if (!I18N[l]) return false;
    _lang = l;
    try { if (root.localStorage) root.localStorage.setItem(LS_KEY, l); } catch (e) {}
    applyI18n();
    hooks.forEach(function (fn) { try { fn(l); } catch (e) {} });
    return true;
  }
  // 单语言文件注册（第 59–61 轮）：i18n-ja/ko/es.js 各调一次 register。
  // 合并式（第 62 轮）：图鉴等扩展词典（i18n-codex-*.js）可以后注册同一门语言的
  // 追加 key，不会冲掉已有的基础词典。
  function register(l, dict) {
    if (!dict || typeof dict !== 'object') return false;
    I18N[l] = Object.assign({}, I18N[l], dict);
    buildLangSelect();
    var stored = null;
    try { stored = root.localStorage && root.localStorage.getItem(LS_KEY); } catch (e) {}
    if ((_lang === l || stored === l) && root.document) {
      _lang = l;
      applyI18n();
      hooks.forEach(function (fn) { try { fn(l); } catch (e) {} });
    }
    return true;
  }
  function initLangSelect() {
    if (!root.document) return;
    var sel = root.document.getElementById('lang-select');
    if (sel) sel.addEventListener('change', function () { setLang(sel.value); });
    applyI18n();
  }
  var api = { I18N: I18N, LANG_NAMES: LANG_NAMES, LS_KEY: LS_KEY,
    currentLang: currentLang, t: t, setLang: setLang, register: register, onChange: onChange,
    applyI18n: applyI18n, initLangSelect: initLangSelect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TapeI18n = api;
  if (root.document) initLangSelect();
})(typeof window !== 'undefined' ? window : globalThis);
