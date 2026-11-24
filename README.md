# TapeCode 电路模拟器

交互式模拟器：加载 TapeCode-Test1 NFT 的真实电路网表（`tapnet/1`），可视化电路并做交互式仿真。

参赛作品：X Layer × TapeOut Accelerate 黑客松（X Layer TapeOut Accelerate）。

## 在线试用

https://4orky.github.io/tapecode-simulator/

## 怎么玩

- 输入任意 Test1 编号（1–10000），点「从链上加载」：应用从链上读 Test1 合约的 `baseURI()` 开始，按 9 步逐项 SHA-256 校验取回网表，信任根在链上，不硬编码目录指纹。
- 点输入引脚拨动 0/1，信号即时刷新（peek，不推进时钟）；点「运行一拍（beat）」推进一拍。
- 没网或目录不可用时自动降级，用本地缓存样本（`samples/`，#1 / #100 / #1000 / #3500 / #9999，均为真实拉取的网表）。
- 本地样本按钮也可直接加载缓存网表离线看。

## 技术

- 纯静态前端，无后端，不连钱包：`index.html` + `app.js` + `style.css`。
- 网表格式 `tapnet/1`（TAP-02 草案）：NAND / LATCH / REF 操作码，单拍仿真 O(门数)。
- 电路图：最长路径分层 + 重心排序布局；线色沿用 Logisim 配色（1 亮绿、0 暗绿）。
- 回归：`REGRESSION.md`（46/46 通过：5 张真实网表 + 全加器 + popcount8 + toggle + 非法网表拒绝），回归脚本 `test-regression.cjs`。

## 数据来源

- Test1 NFT 合约（X Layer）：`0x0e91460D6823C711643e650A9a4C0cc21DE41614`
- 只读查看页：https://nft.taperelay.com/tct1/view/
- 网表格式规范 TAP-02：https://github.com/TapeOutProtocol/TAPs
- 网表数据本身不在链上，信任链是链上 `baseURI()` 目录指纹 + 每步 SHA-256 校验。
