# Beacon

比特币 USD 实时信标：本地小模型给出买涨/买跌和挂单价，后台跑模拟盘并成长。Grok 只做讲解和训练指导，需要你自己配置 API Key（不能走 Grok 应用发布）。

学习用，不是投资建议。小资金按 20～50 美元一笔。图上红涨绿跌。

## 能做什么

- Coinbase BTC/USD 实时价和 K 线
- 本地 5 分钟逻辑回归给出方向和相对稳定的挂单价（已收盘 K 线，无未来函数）
- 盘口、刚成交、成交量改仓位和挂单价；只有 K 线自己在晃时才按盘口改方向，同一根 5 分钟里不再改
- 打开就能看挂单价；登录只影响「用大白话再讲一遍」，省讲解 token
- 模拟成交后本地小步训练；Grok 纠正错单、防未来函数，不往出厂拉

出厂模型在 Coinbase 冻结样本上，从换方向到下一次换方向大约十次对七次。不是下一根 K 线猜涨跌，也不是保证赚钱。

## 自己跑

需要 Node 20+。

```bash
git clone https://github.com/sl3456/beacon-btc.git
cd beacon-btc
cp .env.example .env
# 编辑 .env，填入 XAI_API_KEY（没有 Key 时预测仍可用，讲解和 Grok 训练不可用）
npm install
npm run dev
```

浏览器打开终端里给出的本地地址（默认 `http://localhost:8080`）。

### Grok API

1. 打开 [xAI Console](https://console.x.ai) 创建 Key
2. 写入项目根目录 `.env`：

```
XAI_API_KEY=xai-你的密钥
```

3. 不要把 `.env` 提交到 GitHub

没有 Key 时：本地模型照常给出挂单价；点「用大白话再讲一遍」会退回本地说明；后台不会找 Grok 指导。

### 登录（可选）

默认 `VITE_AUTH_ENABLED=false`，不用登录就能看挂单价。若要接自己的登录，把该开关设为 `true`。

## 目录

- `src/lib/model/weights.json` 出厂权重
- `src/lib/model/infer.ts` 浏览器推理（已收盘 K 线，无未来函数）
- `src/lib/orderflow.ts` 盘口和刚成交
- `src/lib/local-signal.ts` 把模型、盘口、成交量合成一张单
- `scripts/train-v13.py` 出厂训练脚本（币安训练、Coinbase 冻结测试）
- `src/lib/grow.functions.ts` Grok 训练指导（读 `XAI_API_KEY`）

## 声明

加密货币交易有风险。本仓库仅供学习。
