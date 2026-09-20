import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BarChart3, ChevronRight, CircleDot, ExternalLink, FileText, Loader2, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type StockAsset, useAskBase } from "@/hooks/use-stock-agents";

type AskBaseProps = { onInspectAsset?: (asset: StockAsset) => void };

const uiCopy = {
  en: {
    unit: "Onchain research unit",
    intro: "Evidence-backed Base market context. Inspect the trail, then make your own call.",
    inputLabel: "Ask AskBase a market research question",
    placeholder: "Ask about assets, catalysts, or pricing…",
    inputHint: "Enter to ask · Shift + Enter for a line",
    ask: "Ask",
    reading: "Reading",
    starterTitle: "Starter signals",
    starters: [
      "What changed in tokenized stocks today?",
      "Compare the available technology names",
      "Which assets have the freshest onchain pricing?",
    ],
    loading: "Reconciling live research with Base asset data…",
    error: "AskBase could not retrieve research right now.",
    retry: "Retry",
    readout: "AskBase readout",
    asOf: "As of",
    assets: "Assets referenced",
    evidence: "Evidence trail",
    openSource: "Open source",
    back: "Back to AskBase start",
    close: "Close AskBase",
    official: "official",
    news: "news",
    research: "research",
    marketData: "market data",
    disclaimer: "Information only, never investment advice. AskBase cannot sign, move funds, or submit transactions.",
  },
  tr: {
    unit: "Zincir üstü araştırma birimi",
    intro: "Kanıta dayalı Base piyasa bağlamı. Kaynakları inceleyin, kararınızı kendiniz verin.",
    inputLabel: "AskBase'e piyasa araştırması sorusu sorun",
    placeholder: "Varlıklar, gelişmeler veya fiyatlar hakkında sorun…",
    inputHint: "Sormak için Enter · Yeni satır için Shift + Enter",
    ask: "Sor",
    reading: "Araştırılıyor",
    starterTitle: "Başlangıç soruları",
    starters: [
      "Tokenlaştırılmış hisselerde bugün ne değişti?",
      "Mevcut teknoloji şirketlerini karşılaştır",
      "Hangi varlıkların zincir üstü fiyatı en güncel?",
    ],
    loading: "Canlı araştırma Base varlık verileriyle karşılaştırılıyor…",
    error: "AskBase şu anda araştırma sonuçlarını getiremedi.",
    retry: "Tekrar dene",
    readout: "AskBase yanıtı",
    asOf: "Güncelleme",
    assets: "İlgili varlıklar",
    evidence: "Kaynaklar",
    openSource: "Kaynağı aç",
    back: "AskBase başlangıcına dön",
    close: "AskBase'i kapat",
    official: "resmî",
    news: "haber",
    research: "araştırma",
    marketData: "piyasa verisi",
    disclaimer: "Yalnızca bilgilendirme amaçlıdır, yatırım tavsiyesi değildir. AskBase imza atamaz, fon taşıyamaz veya işlem gönderemez.",
  },
} as const;

function CoreMark({ active = false, compact = false }: { active?: boolean; compact?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className={`askbase-core ${compact ? "h-11 w-11" : "h-12 w-12"} shrink-0`}>
      <defs>
        <linearGradient id="askbase-lower" x1="14" y1="26" x2="84" y2="83" gradientUnits="userSpaceOnUse"><stop stopColor="#1ae8f5" /><stop offset=".48" stopColor="#118ce9" /><stop offset="1" stopColor="#0759c6" /></linearGradient>
        <linearGradient id="askbase-upper" x1="26" y1="13" x2="72" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#d9fbff" /><stop offset=".48" stopColor="#91e9ff" /><stop offset="1" stopColor="#4f9cea" /></linearGradient>
        <radialGradient id="askbase-center-light"><stop stopColor="#ffffff" /><stop offset=".28" stopColor="#d4ffff" /><stop offset=".7" stopColor="#36e9ff" stopOpacity=".52" /><stop offset="1" stopColor="#36e9ff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle className="askbase-halo" cx="50" cy="50" r="45" fill="#17dfff" opacity=".15" />
      <circle cx="50" cy="50" r="42" fill="url(#askbase-lower)" />
      <g className="askbase-upper-segment">
        <path d="M18 47.5a32 32 0 0 1 64 0H18Z" fill="url(#askbase-upper)" />
        <path d="M18 47.5a32 32 0 0 1 64 0" fill="none" stroke="#d8fcff" strokeOpacity=".68" strokeWidth="1.15" />
      </g>
      <path d="M8 48H51" fill="none" stroke="#061a67" strokeWidth="7" strokeLinecap="butt" />
      <path d="M10 48H49" fill="none" stroke="#e4ffff" strokeOpacity=".78" strokeWidth="1.2" />
      <circle className="askbase-center-light" cx="50" cy="49" r="11" fill="url(#askbase-center-light)" />
      <circle cx="50" cy="49" r="2.1" fill="#edffff" />
      {active && <circle className="askbase-scan" cx="50" cy="50" r="38" fill="none" stroke="#a7fbff" strokeWidth="1.35" />}
    </svg>
  );
}

function formatAsOf(value: string, language: "en" | "tr") {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "tr" ? "tr-TR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function AskBase({ onInspectAsset }: AskBaseProps) {
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<"en" | "tr">(() => {
    if (typeof window === "undefined") return "en";
    return window.localStorage.getItem("askbase-language") === "tr" ? "tr" : "en";
  });
  const ask = useAskBase();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const response = ask.data;
  const copy = uiCopy[language];

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => textareaRef.current?.focus(), 80);
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => { window.clearTimeout(timeout); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => {
    if (!open) launcherRef.current?.focus();
  }, [open]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const query = message.trim();
    if (!query || ask.isPending) return;
    ask.mutate(
      { message: query, language },
      {
        onSuccess: () => {
          setMessage(current => current.trim() === query ? "" : current);
        },
      },
    );
  }

  function chooseLanguage(value: "en" | "tr") {
    setLanguage(value);
    window.localStorage.setItem("askbase-language", value);
    ask.reset();
    setMessage("");
    panelRef.current?.scrollTo({ top: 0 });
  }

  function returnToStart() {
    ask.reset();
    setMessage("");
    panelRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => textareaRef.current?.focus(), 120);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); }
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) setOpen(false);
  }

  return (
    <>
      <style>{`
        @keyframes askbase-core-float { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(-2px) scale(1.025); } }
        @keyframes askbase-upper-drift { 0%,100% { transform:rotate(0deg); } 50% { transform:rotate(4deg); } }
        @keyframes askbase-halo-breathe { 0%,100% { opacity:.1; transform:scale(.88); } 50% { opacity:.31; transform:scale(1.07); } }
        @keyframes askbase-center-pulse { 0%,100% { opacity:.58; transform:scale(.78); } 50% { opacity:1; transform:scale(1.15); } }
        @keyframes askbase-core-scan { 0%,100% { opacity:.16; transform:scale(.9); } 50% { opacity:.92; transform:scale(1.07); } }
        .askbase-core { filter:drop-shadow(0 4px 7px rgba(14,218,250,.48)); animation:askbase-core-float 4.6s ease-in-out infinite; overflow:visible; }
        .askbase-upper-segment, .askbase-halo, .askbase-center-light, .askbase-scan { transform-origin:50px 50px; }
        .askbase-upper-segment { animation:askbase-upper-drift 5.5s ease-in-out infinite; }
        .askbase-halo { animation:askbase-halo-breathe 3.2s ease-in-out infinite; }
        .askbase-center-light { animation:askbase-center-pulse 2.4s ease-in-out infinite; }
        .askbase-scan { animation:askbase-core-scan 1.4s ease-in-out infinite; }
        .askbase-scrollbar::-webkit-scrollbar { width:6px; }
        .askbase-scrollbar::-webkit-scrollbar-thumb { background:rgba(99,210,255,.36); border-radius:999px; }
        @media (prefers-reduced-motion: reduce) { .askbase-core, .askbase-upper-segment, .askbase-halo, .askbase-center-light, .askbase-scan { animation:none !important; } }
      `}</style>
      <button ref={launcherRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-3 z-[60] flex items-center gap-2 rounded-full border border-cyan-200/75 bg-[#062760] py-1.5 pl-1.5 pr-4 text-left text-white shadow-[0_0_0_3px_rgba(37,221,255,.13),0_13px_34px_rgba(0,132,205,.42)] transition-[transform,box-shadow,border-color] hover:-translate-y-1 hover:border-cyan-100 hover:shadow-[0_0_0_5px_rgba(37,221,255,.16),0_18px_42px_rgba(0,164,235,.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100 md:right-6 2xl:bottom-6">
        <CoreMark active={ask.isPending} compact />
        <span><span className="block text-sm font-bold tracking-[-.03em]">AskBase</span><span className="block text-[9px] font-semibold uppercase tracking-[.14em] text-cyan-200">research core</span></span>
      </button>

      {open && <div className="fixed inset-0 z-[70] bg-[#06132c]/35 backdrop-blur-[2px]" onMouseDown={closeOnBackdrop}>
        <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="askbase-heading" className="askbase-scrollbar fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-3 flex max-h-[min(43rem,calc(100dvh-6.5rem))] w-[calc(100vw-1.5rem)] max-w-[29rem] flex-col overflow-y-auto rounded-[1.6rem] border border-cyan-100/25 bg-[#071736] text-white shadow-[0_28px_70px_rgba(3,13,40,.52)] md:bottom-24 md:right-6 md:max-h-[min(43rem,calc(100dvh-7rem))]">
            <div className="sticky top-0 z-10 border-b border-cyan-200/25 bg-[#082354]/95 px-4 py-3 shadow-[inset_0_-1px_0_rgba(38,225,255,.12)] backdrop-blur">
              <div className="flex items-center gap-2">{response && <button type="button" onClick={returnToStart} aria-label={copy.back} className="rounded-full p-2 text-cyan-100 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><ArrowLeft className="h-4 w-4" /></button>}<CoreMark active={ask.isPending} /><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-300">{copy.unit}</p><h2 id="askbase-heading" className="text-xl font-bold tracking-[-.04em]">AskBase</h2></div><div className="flex rounded-full border border-cyan-200/25 bg-cyan-950/40 p-0.5" aria-label="Answer language"><button type="button" onClick={() => chooseLanguage("en")} aria-pressed={language === "en"} className={`rounded-full px-2 py-1 text-[9px] font-bold transition ${language === "en" ? "bg-cyan-300 text-slate-950" : "text-cyan-100 hover:bg-white/10"}`}>EN</button><button type="button" onClick={() => chooseLanguage("tr")} aria-pressed={language === "tr"} className={`rounded-full px-2 py-1 text-[9px] font-bold transition ${language === "tr" ? "bg-cyan-300 text-slate-950" : "text-cyan-100 hover:bg-white/10"}`}>TR</button></div><button type="button" onClick={() => setOpen(false)} aria-label={copy.close} className="rounded-full p-2 text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><X className="h-4 w-4" /></button></div>
          </div>
          <div className="p-4">
            <p className="text-xs leading-5 text-slate-300">{copy.intro}</p>
            <form onSubmit={submit} className="mt-3 rounded-2xl border border-white/15 bg-black/15 p-2 focus-within:border-cyan-300/70">
              <label htmlFor="askbase-question" className="sr-only">{copy.inputLabel}</label>
              <textarea ref={textareaRef} id="askbase-question" value={message} onChange={event => setMessage(event.target.value)} onKeyDown={keyDown} rows={3} placeholder={copy.placeholder} className="block w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-5 text-white outline-none placeholder:text-slate-500" />
              <div className="flex items-center justify-between gap-2 border-t border-white/10 px-1 pt-2"><span className="text-[10px] text-slate-400">{copy.inputHint}</span><Button type="submit" size="sm" disabled={!message.trim() || ask.isPending} className="rounded-xl bg-cyan-300 px-3 font-semibold text-slate-950 hover:bg-cyan-200">{ask.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}{ask.isPending ? copy.reading : copy.ask}</Button></div>
            </form>
            {!response && !ask.isPending && !ask.isError && <div className="mt-4"><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{copy.starterTitle}</p><div className="mt-2 space-y-1.5">{copy.starters.map(starter => <button key={starter} type="button" onClick={() => setMessage(starter)} className="group flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 text-left text-xs text-slate-200 transition hover:border-cyan-300/50 hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><span>{starter}</span><ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300 transition-transform group-hover:translate-x-0.5" /></button>)}</div></div>}
            {ask.isPending && <div role="status" aria-live="polite" className="mt-4 rounded-2xl border border-cyan-100/15 bg-cyan-200/[.06] p-4"><div className="flex items-center gap-2"><CircleDot className="h-4 w-4 animate-pulse text-cyan-300" /><p className="text-sm text-slate-100">{copy.loading}</p></div><div className="mt-4 h-2.5 w-11/12 animate-pulse rounded bg-white/10" /><div className="mt-2 h-2.5 w-3/5 animate-pulse rounded bg-white/10" /></div>}
            {ask.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-300/10 p-3 text-xs text-rose-100"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="flex-1">{copy.error}</span><Button type="button" size="sm" variant="outline" onClick={() => submit()} className="border-rose-100/40 bg-transparent text-rose-50 hover:bg-rose-100/10">{copy.retry}</Button></div>}
            {response && !ask.isPending && <div className="mt-4 space-y-3"><article className="rounded-2xl border border-cyan-100/15 bg-white/[.06] p-3.5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[.16em] text-cyan-200"><Sparkles className="h-3 w-3" /> {copy.readout}</p><p className="text-[10px] text-slate-400">{copy.asOf} {formatAsOf(response.asOf, language)}</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-100">{response.answer}</p></article>
              {response.assets.length > 0 && <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{copy.assets}</p><div className="mt-2 flex flex-wrap gap-1.5">{response.assets.map(asset => <button key={`${asset.symbol}-${asset.address}`} type="button" onClick={() => onInspectAsset?.(asset)} className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-left hover:border-cyan-300/50 hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><BarChart3 className="h-3.5 w-3.5 text-cyan-300" /><span className="font-mono text-xs font-bold text-white">{asset.symbol}</span><span className="max-w-20 truncate text-[10px] text-slate-400">{asset.name}</span></button>)}</div></div>}
              {response.sources.length > 0 && <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-slate-400">{copy.evidence}</p><div className="mt-2 space-y-1.5">{response.sources.map((source, index) => { const kindLabel = source.kind === "official" ? copy.official : source.kind === "market-data" ? copy.marketData : source.kind === "research" ? copy.research : copy.news; return <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noopener noreferrer" className="group block min-w-0 rounded-xl border border-white/10 bg-black/10 p-2.5 hover:border-cyan-300/40 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"><span className="flex min-w-0 items-start gap-2"><span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-300/10 px-1 font-mono text-[9px] font-bold text-cyan-300">{index + 1}</span><span className="min-w-0 flex-1"><span className="block text-xs font-semibold leading-4 text-slate-100">{source.title}</span><span className="mt-1 block text-[10px] text-slate-400">{source.publisher}{source.publishedAt ? ` · ${formatAsOf(source.publishedAt, language)}` : ""} · {kindLabel}</span><span className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-cyan-300 group-hover:text-cyan-100">{copy.openSource}<ExternalLink className="h-3 w-3" /></span></span></span></a>; })}</div></div>}
              {response.warnings.length > 0 && <div className="space-y-1.5 rounded-2xl border border-amber-200/20 bg-amber-100/10 p-3">{response.warnings.map(warning => <p key={warning} className="flex gap-2 text-xs leading-4 text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />{warning}</p>)}</div>}
            </div>}
            <div className="mt-4 flex gap-2 border-t border-white/10 pt-3 text-[10px] leading-4 text-slate-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" /><p>{copy.disclaimer}</p></div>
          </div>
        </section>
      </div>}
    </>
  );
}