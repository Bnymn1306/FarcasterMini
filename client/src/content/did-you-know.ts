// BasedMem "Did You Know" Educational Content
// Marketing tips for each feature and operation

export interface DidYouKnowTip {
  id: string;
  category: 'token' | 'trading' | 'portfolio' | 'social' | 'rewards' | 'advanced';
  titleTR: string;
  titleEN: string;
  descriptionTR: string;
  descriptionEN: string;
  icon: string;
  ctaPage?: string;
  ctaText?: string;
}

export const didYouKnowTips: DidYouKnowTip[] = [
  // TOKEN CREATION
  {
    id: 'create-token',
    category: 'token',
    titleTR: "Kendi meme coin'ini saniyeler içinde oluşturabileceğini",
    titleEN: "You can create your own meme coin in seconds",
    descriptionTR: "BasedMem'de kod yazmadan, sadece isim ve sembol girerek Base blockchain üzerinde kendi tokenini launch edebilirsin. Akıllı kontrat otomatik deploy edilir!",
    descriptionEN: "On BasedMem, you can launch your own token on Base blockchain just by entering a name and symbol - no coding required. Smart contract is automatically deployed!",
    icon: "Rocket",
    ctaPage: "/create",
    ctaText: "Token Oluştur"
  },
  {
    id: 'cast-tokenize',
    category: 'token',
    titleTR: "Viral bir Farcaster cast'ini tek tıkla tokenize edebileceğini",
    titleEN: "You can tokenize a viral Farcaster cast with one click",
    descriptionTR: "Beğendiğin bir Warpcast URL'sini yapıştır, BasedMem otomatik olarak cast bilgilerini çeker ve o cast için özel bir meme token oluşturur. Cast sahibi otomatik olarak token'ın bir kısmını alır!",
    descriptionEN: "Paste a Warpcast URL you like, BasedMem automatically fetches cast info and creates a special meme token for that cast. The cast owner automatically receives a portion of the tokens!",
    icon: "Link",
    ctaPage: "/create",
    ctaText: "Cast Tokenize Et"
  },
  {
    id: 'bonding-curve',
    category: 'token',
    titleTR: "Token fiyatının otomatik bonding curve ile belirlendiğini",
    titleEN: "Token price is determined by automatic bonding curve",
    descriptionTR: "Her BasedMem token'ı lineer bonding curve kullanır. Ne kadar çok kişi alırsa fiyat o kadar yükselir, satarsa düşer. Fiyat manipülasyonuna karşı adil bir sistem!",
    descriptionEN: "Every BasedMem token uses a linear bonding curve. The more people buy, the higher the price goes; selling lowers it. A fair system against price manipulation!",
    icon: "TrendingUp",
    ctaPage: "/browse",
    ctaText: "Token'ları Keşfet"
  },
  {
    id: 'graduation',
    category: 'token',
    titleTR: "Token'ın 30 ETH'e ulaşınca Uniswap'a mezun olduğunu",
    titleEN: "When token reaches 30 ETH it graduates to Uniswap",
    descriptionTR: "Bonding curve'de 30 ETH biriktiğinde token otomatik olarak Uniswap'a listelenir. Bu 'mezuniyet' anı token'ın gerçek DEX'lerde işlem görmesini sağlar!",
    descriptionEN: "When 30 ETH accumulates in the bonding curve, the token automatically gets listed on Uniswap. This 'graduation' moment enables the token to trade on real DEXes!",
    icon: "GraduationCap",
    ctaPage: "/browse",
    ctaText: "Mezuniyet Yakın Token'lar"
  },

  // TRADING
  {
    id: 'instant-swap',
    category: 'trading',
    titleTR: "0x Protocol ile anında token takası yapabileceğini",
    titleEN: "You can instantly swap tokens with 0x Protocol",
    descriptionTR: "BasedMem'in DEX Swap özelliği 0x aggregator kullanarak en iyi fiyatı bulur. ETH, WETH, USDC ve tüm Base token'ları arasında saniyeler içinde takas yap!",
    descriptionEN: "BasedMem's DEX Swap feature uses 0x aggregator to find the best price. Swap between ETH, WETH, USDC and all Base tokens in seconds!",
    icon: "ArrowLeftRight",
    ctaPage: "/swap",
    ctaText: "Swap Yap"
  },
  {
    id: 'limit-orders',
    category: 'trading',
    titleTR: "Otomatik çalışan limit emirleri oluşturabileceğini",
    titleEN: "You can create automatically executing limit orders",
    descriptionTR: "Hedef fiyat belirle, BasedMem senin yerine 7/24 takip etsin! Fiyat hedefe ulaştığında emir otomatik olarak execute edilir. Artık ekran başında beklemeye gerek yok!",
    descriptionEN: "Set your target price and let BasedMem monitor 24/7! When price reaches your target, the order executes automatically. No more watching screens!",
    icon: "Target",
    ctaPage: "/swap",
    ctaText: "Limit Emri Oluştur"
  },
  {
    id: 'buy-limit',
    category: 'trading',
    titleTR: "Düşük fiyattan alım için BUY limit emri verebileceğini",
    titleEN: "You can place BUY limit orders to buy at lower prices",
    descriptionTR: "Bir token'ın düşmesini mi bekliyorsun? Hedef fiyatını gir ve WETH'ini ExecutorVault'a yatır. Fiyat düştüğünde sistem otomatik olarak senin için alım yapar!",
    descriptionEN: "Waiting for a token to drop? Enter your target price and deposit WETH to ExecutorVault. When price drops, the system automatically buys for you!",
    icon: "TrendingDown",
    ctaPage: "/swap",
    ctaText: "Alım Emri Ver"
  },
  {
    id: 'sell-limit',
    category: 'trading',
    titleTR: "Kar realizasyonu için SELL limit emri verebileceğini",
    titleEN: "You can place SELL limit orders to take profit",
    descriptionTR: "Token'ın yükselmesini bekleyip kar almak mı istiyorsun? Satış hedefini belirle, token'ını ExecutorVault'a yatır. Fiyat yükseldiğinde otomatik satış!",
    descriptionEN: "Want to wait for your token to rise and take profit? Set your sell target, deposit tokens to ExecutorVault. Automatic sale when price rises!",
    icon: "TrendingUp",
    ctaPage: "/swap",
    ctaText: "Satış Emri Ver"
  },
  {
    id: 'executor-vault',
    category: 'trading',
    titleTR: "ExecutorVault V3 ile %100 otomatik işlem yapabildiğini",
    titleEN: "ExecutorVault V3 enables 100% automatic trading",
    descriptionTR: "V3 Vault sistemi sayesinde limit emirlerin tamamen otomasyonda çalışır. Emir dolduğunda token'lar veya WETH otomatik olarak cüzdanına geri çekilir!",
    descriptionEN: "Thanks to V3 Vault system, your limit orders run fully automated. When order fills, tokens or WETH are automatically withdrawn back to your wallet!",
    icon: "Bot",
    ctaPage: "/swap",
    ctaText: "V3 Vault Kullan"
  },
  {
    id: 'risk-scoring',
    category: 'trading',
    titleTR: "Her token için otomatik risk skoru görebildiğini",
    titleEN: "You can see automatic risk score for every token",
    descriptionTR: "BasedMem her token'ı otomatik olarak analiz eder: likidite kontrolü, ERC20 uyumluluğu, blacklist taraması. Yeşil = Güvenli, Sarı = Dikkatli ol, Kırmızı = Yüksek risk!",
    descriptionEN: "BasedMem automatically analyzes every token: liquidity check, ERC20 compatibility, blacklist scan. Green = Safe, Yellow = Be careful, Red = High risk!",
    icon: "Shield",
    ctaPage: "/swap",
    ctaText: "Risk Skorlarını Gör"
  },

  // PORTFOLIO
  {
    id: 'portfolio-track',
    category: 'portfolio',
    titleTR: "Tüm Base token'larını tek yerden takip edebildiğini",
    titleEN: "You can track all your Base tokens in one place",
    descriptionTR: "Cüzdanını bağla ve Portfolio sayfasında tüm token bakiyelerini, USD değerlerini ve 24 saatlik değişimleri anlık olarak gör!",
    descriptionEN: "Connect your wallet and see all token balances, USD values, and 24-hour changes instantly on the Portfolio page!",
    icon: "Wallet",
    ctaPage: "/portfolio",
    ctaText: "Portföyümü Gör"
  },
  {
    id: 'defi-positions',
    category: 'portfolio',
    titleTR: "DeFi pozisyonlarını da görüntüleyebildiğini",
    titleEN: "You can also view your DeFi positions",
    descriptionTR: "Sadece token'lar değil! Aerodrome, Uniswap ve diğer Base DeFi protokollerindeki LP pozisyonların ve yield farming bakiyelerin de Portfolio'da görünür.",
    descriptionEN: "Not just tokens! Your LP positions and yield farming balances on Aerodrome, Uniswap and other Base DeFi protocols also appear in Portfolio.",
    icon: "Layers",
    ctaPage: "/portfolio",
    ctaText: "DeFi Pozisyonları"
  },
  {
    id: 'net-worth',
    category: 'portfolio',
    titleTR: "Toplam net değerini USD olarak görebildiğini",
    titleEN: "You can see your total net worth in USD",
    descriptionTR: "Tüm token'ların + DeFi pozisyonlarının toplam değerini anlık olarak hesaplarız. Base blockchain'deki toplam servetini tek bakışta gör!",
    descriptionEN: "We calculate the total value of all your tokens + DeFi positions in real-time. See your total wealth on Base blockchain at a glance!",
    icon: "DollarSign",
    ctaPage: "/portfolio",
    ctaText: "Net Değerimi Gör"
  },

  // SOCIAL & ALERTS
  {
    id: 'price-alerts',
    category: 'social',
    titleTR: "Token fiyat alertleri oluşturup Farcaster'dan bildirim alabildiğini",
    titleEN: "You can create price alerts and get Farcaster notifications",
    descriptionTR: "İzlediğin token için hedef fiyat belirle. Fiyat o seviyeye ulaştığında Warpcast'te direct cast olarak bildirim alırsın!",
    descriptionEN: "Set a target price for the token you're watching. When price reaches that level, you'll receive a notification as a direct cast on Warpcast!",
    icon: "Bell",
    ctaPage: "/alerts",
    ctaText: "Alert Oluştur"
  },
  {
    id: 'farcaster-wallet',
    category: 'social',
    titleTR: "Warpcast'ten çıkmadan cüzdan bağlayabildiğini",
    titleEN: "You can connect wallet without leaving Warpcast",
    descriptionTR: "BasedMem bir Farcaster Frame Mini App! Warpcast içinden açtığında cüzdanın otomatik bağlanır, harici wallet uygulamasına geçmene gerek kalmaz.",
    descriptionEN: "BasedMem is a Farcaster Frame Mini App! When opened from Warpcast, your wallet connects automatically, no need to switch to external wallet app.",
    icon: "Smartphone",
    ctaPage: "/",
    ctaText: "Warpcast'te Aç"
  },
  {
    id: 'share-cast',
    category: 'social',
    titleTR: "Token oluşturduktan sonra otomatik cast paylaşabildiğini",
    titleEN: "You can auto-share a cast after creating a token",
    descriptionTR: "Token deploy edildikten sonra BasedMem otomatik olarak Warpcast compose ekranını açar. Tokenini follower'larınla tek tıkla paylaş!",
    descriptionEN: "After token is deployed, BasedMem automatically opens Warpcast compose screen. Share your token with followers in one click!",
    icon: "Share2",
    ctaPage: "/create",
    ctaText: "Token Oluştur & Paylaş"
  },

  // REWARDS
  {
    id: 'daily-checkin',
    category: 'rewards',
    titleTR: "Günlük check-in yaparak BMEM kazanabildiğini",
    titleEN: "You can earn BMEM by daily check-in",
    descriptionTR: "Her gün 'Daily Based' sayfasını ziyaret et ve check-in yap. Streak oluştur, bonus BMEM kazan! 7 günlük streak = ekstra ödüller.",
    descriptionEN: "Visit 'Daily Based' page every day and check in. Build streaks, earn bonus BMEM! 7-day streak = extra rewards.",
    icon: "Calendar",
    ctaPage: "/daily",
    ctaText: "Günlük Check-in"
  },
  {
    id: 'badges-nft',
    category: 'rewards',
    titleTR: "Başarılar için NFT badge kazanabildiğini",
    titleEN: "You can earn NFT badges for achievements",
    descriptionTR: "İlk token'ını oluştur, ilk trade'ini yap, 7 günlük streak tamamla... Her milestone için özel NFT badge kazan ve profilinde sergile!",
    descriptionEN: "Create your first token, make your first trade, complete a 7-day streak... Earn special NFT badges for each milestone and display on your profile!",
    icon: "Award",
    ctaPage: "/portfolio",
    ctaText: "Badge'lerimi Gör"
  },
  {
    id: 'streak-bonus',
    category: 'rewards',
    titleTR: "Streak bonusuyla daha fazla ödül alabildiğini",
    titleEN: "You can get more rewards with streak bonus",
    descriptionTR: "Günlük check-in streak'in arttıkça bonus çarpanın da artar! 3 gün = 1.5x, 7 gün = 2x, 30 gün = 5x bonus BMEM!",
    descriptionEN: "As your daily check-in streak increases, so does your bonus multiplier! 3 days = 1.5x, 7 days = 2x, 30 days = 5x bonus BMEM!",
    icon: "Flame",
    ctaPage: "/daily",
    ctaText: "Streak'imi Gör"
  },

  // ADVANCED
  {
    id: 'premium-launch',
    category: 'advanced',
    titleTR: "x402 ile sadece $0.05'e premium token launch yapabildiğini",
    titleEN: "You can do premium token launch for just $0.05 with x402",
    descriptionTR: "x402 micropayment sistemiyle sadece 0.05 USDC ödeyerek verified badge, öne çıkarma ve öncelikli destek al! Kredi kartı veya crypto ile öde.",
    descriptionEN: "Pay just 0.05 USDC with x402 micropayment system to get verified badge, featured placement and priority support! Pay with credit card or crypto.",
    icon: "Crown",
    ctaPage: "/create",
    ctaText: "Premium Launch"
  },
  {
    id: 'cast-futures',
    category: 'advanced',
    titleTR: "Farcaster cast'lerinin viral olup olmayacağına bahis oynayabildiğini",
    titleEN: "You can bet on whether Farcaster casts will go viral",
    descriptionTR: "Cast Futures ile bir cast'in gelecekteki etkileşimlerini tahmin et! 24 saat içinde hedef like/recast sayısına ulaşacak mı? Kazananlar havuzu paylaşır!",
    descriptionEN: "Predict future engagement of a cast with Cast Futures! Will it reach target likes/recasts in 24 hours? Winners share the pool!",
    icon: "BarChart3",
    ctaPage: "/prediction",
    ctaText: "Cast Futures"
  },
  {
    id: 'any-base-token',
    category: 'advanced',
    titleTR: "Sadece BasedMem token'ları değil, TÜM Base token'larını trade edebilidiğini",
    titleEN: "You can trade ALL Base tokens, not just BasedMem tokens",
    descriptionTR: "BasedMem sadece meme coin platformu değil, tam bir DEX! DEGEN, BRETT, VIRTUAL, AERO... Base'deki her token'ı swap ve limit order ile trade et!",
    descriptionEN: "BasedMem is not just a meme coin platform, it's a full DEX! Trade every token on Base - DEGEN, BRETT, VIRTUAL, AERO... with swap and limit orders!",
    icon: "Coins",
    ctaPage: "/swap",
    ctaText: "Tüm Token'lar"
  },
  {
    id: 'whitelisted-tokens',
    category: 'advanced',
    titleTR: "WETH, USDC, DEGEN gibi token'ların otomatik whitelist'te olduğunu",
    titleEN: "WETH, USDC, DEGEN and similar tokens are auto-whitelisted",
    descriptionTR: "Popüler ve güvenilir token'lar (WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL) risk kontrolünü bypass eder. Limit order için hızlıca kullanabilirsin!",
    descriptionEN: "Popular and trusted tokens (WETH, USDC, AERO, DEGEN, BRETT, VIRTUAL) bypass risk checks. You can quickly use them for limit orders!",
    icon: "CheckCircle",
    ctaPage: "/swap",
    ctaText: "Whitelist Token'lar"
  },
  {
    id: 'cancel-orders',
    category: 'advanced',
    titleTR: "Bekleyen limit emirlerini iptal edip paranı geri çekebilidiğini",
    titleEN: "You can cancel pending limit orders and withdraw your funds",
    descriptionTR: "Fikrini mi değiştirdin? 'My Orders' sekmesinden bekleyen emirlerini iptal et. ExecutorVault'taki fonların otomatik olarak cüzdanına geri döner!",
    descriptionEN: "Changed your mind? Cancel pending orders from 'My Orders' tab. Funds in ExecutorVault automatically return to your wallet!",
    icon: "XCircle",
    ctaPage: "/swap",
    ctaText: "Emirlerimi Gör"
  },
  {
    id: 'native-eth',
    category: 'advanced',
    titleTR: "Native ETH ile direkt swap yapabildiğini",
    titleEN: "You can swap directly with native ETH",
    descriptionTR: "WETH'e çevirmeye gerek yok! BasedMem native ETH'i otomatik olarak WETH'e wrap eder ve swap yapar. Ekstra işlem yok, ekstra gas yok!",
    descriptionEN: "No need to convert to WETH! BasedMem automatically wraps native ETH to WETH and swaps. No extra transaction, no extra gas!",
    icon: "Zap",
    ctaPage: "/swap",
    ctaText: "ETH ile Swap"
  },
];

// Get tips by category
export const getTipsByCategory = (category: DidYouKnowTip['category']) => 
  didYouKnowTips.filter(tip => tip.category === category);

// Get random tip
export const getRandomTip = () => 
  didYouKnowTips[Math.floor(Math.random() * didYouKnowTips.length)];

// Get random tip by category
export const getRandomTipByCategory = (category: DidYouKnowTip['category']) => {
  const categoryTips = getTipsByCategory(category);
  return categoryTips[Math.floor(Math.random() * categoryTips.length)];
};

// Category labels
export const categoryLabels = {
  token: { tr: 'Token Oluşturma', en: 'Token Creation' },
  trading: { tr: 'Trading', en: 'Trading' },
  portfolio: { tr: 'Portföy', en: 'Portfolio' },
  social: { tr: 'Sosyal', en: 'Social' },
  rewards: { tr: 'Ödüller', en: 'Rewards' },
  advanced: { tr: 'Gelişmiş', en: 'Advanced' },
};
