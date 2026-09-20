import { Link, useLocation } from "wouter";
import { Home, ArrowLeftRight, Bot, ChartNoAxesCombined, Timer } from "lucide-react";

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Home, label: "Home" },
    { href: "/swap", icon: ArrowLeftRight, label: "Swap" },
    { href: "/limit-orders", icon: Timer, label: "Orders" },
    { href: "/agent-hub", icon: Bot, label: "Agents" },
    { href: "/tokenized-stocks", icon: ChartNoAxesCombined, label: "Stocks" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-border 2xl:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive = location === item.href;
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.href}
              href={item.href}
              data-testid={`bottom-nav-${item.label.toLowerCase()}`}
              className={`flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? "bg-primary/10 text-primary"
                  : item.href === "/tokenized-stocks"
                    ? "bg-primary/5 text-primary ring-1 ring-primary/20 hover:bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "fill-primary" : ""}`} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
