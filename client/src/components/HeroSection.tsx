import { ArrowLeftRight, Bot, ChartNoAxesCombined, ShieldCheck, Timer } from "lucide-react";
import { useLocation } from "wouter";

const products = [
  {
    title: "Swap",
    description: "Exchange tokens across supported networks with wallet-controlled execution.",
    href: "/swap",
    icon: ArrowLeftRight,
    accent: "from-cyan-500/20 to-blue-500/5",
  },
  {
    title: "Limit Orders",
    description: "Set a target price and let BasedMem monitor the market for your order.",
    href: "/limit-orders",
    icon: Timer,
    accent: "from-fuchsia-500/20 to-purple-500/5",
  },
  {
    title: "Agent Hub",
    description: "Discover, create and connect onchain agents through one focused workspace.",
    href: "/agent-hub",
    icon: Bot,
    accent: "from-violet-500/20 to-indigo-500/5",
  },
  {
    title: "Stock Agents",
    description: "Build explainable B20 baskets and buy or sell through verified Base routes.",
    href: "/tokenized-stocks",
    icon: ChartNoAxesCombined,
    accent: "from-emerald-500/20 to-cyan-500/5",
  },
] as const;

export function HeroSection() {
  const [, setLocation] = useLocation();

  return (
    <main className="relative min-h-[calc(100dvh-4rem)] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,hsl(var(--primary)/.16),transparent_32%),radial-gradient(circle_at_82%_70%,hsl(var(--accent)/.14),transparent_34%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col justify-center px-4 py-10 md:px-6 lg:py-14">
        <section className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" />
            Human-controlled onchain tools
          </div>
          <h1 className="text-4xl font-black leading-[.98] tracking-[-.045em] sm:text-6xl">
            Trade, automate and explore
            <span className="block bg-gradient-to-r from-primary via-accent to-cyan-400 bg-clip-text text-transparent">with BasedMem.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
            Swap tokens, create limit orders, work with onchain agents and access explainable tokenized stocks—all from one focused app.
          </p>
        </section>

        <section className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {products.map(product => {
            const Icon = product.icon;
            return (
              <button
                key={product.href}
                onClick={() => setLocation(product.href)}
                className={`group min-w-0 rounded-3xl border bg-gradient-to-br ${product.accent} p-5 text-left transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5`}
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/80 text-primary shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-5 text-lg font-bold">{product.title}</h2>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{product.description}</p>
                <span className="mt-5 inline-flex text-xs font-bold text-primary">Open {product.title} →</span>
              </button>
            );
          })}
        </section>

        <p className="mt-7 text-xs text-muted-foreground">
          You review and approve every wallet action. BasedMem never signs transactions for you.
        </p>
      </div>
    </main>
  );
}