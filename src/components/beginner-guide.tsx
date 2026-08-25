import { TrendingDown, TrendingUp, Shield } from "lucide-react";

const ITEMS = [
  {
    icon: TrendingUp,
    title: "买涨",
    body: "你觉得接下来会涨，就按提示的挂单价买，等价格回来成交。真涨了赚钱，跌了会亏。",
  },
  {
    icon: TrendingDown,
    title: "买跌",
    body: "你觉得接下来会跌，就按提示的挂单价卖（先借来卖）。真跌了赚钱，涨了会亏。",
  },
  {
    icon: Shield,
    title: "止盈 / 止损",
    body: "止盈：赚到这个价就卖掉。止损：亏到这个价就认输离场，避免亏更多。",
  },
];

export function BeginnerGuide() {
  return (
    <section className="rounded-xl bg-card p-5 shadow-card md:p-6">
      <h2 className="text-title font-medium tracking-tight">
        新手三件事
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        先用上面的模拟盘。图上红涨绿跌。小资金一笔 20～50 美元就够，亏到价必须停。
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {ITEMS.map((item) => (
          <article key={item.title} className="rounded-lg bg-muted p-4">
            <item.icon className="size-4 text-accent" strokeWidth={1.75} />
            <h3 className="mt-3 text-sm font-medium">{item.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
          </article>
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-subtle">
        这是学习工具，不是投资建议。数字货币波动很大，短时间也可能亏很多。上面的提示大约十次能对七次，不是保证。
      </p>
    </section>
  );
}
