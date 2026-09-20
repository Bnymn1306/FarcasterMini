import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'wouter';
import { 
  Rocket, Link as LinkIcon, TrendingUp, GraduationCap, ArrowLeftRight, 
  Target, TrendingDown, Bot, Shield, Wallet, Layers, DollarSign,
  Bell, Smartphone, Share2, Calendar, Award, Flame, Crown, BarChart3,
  Coins, CheckCircle, XCircle, Zap, Lightbulb, ChevronRight, RefreshCw
} from 'lucide-react';
import { didYouKnowTips, getRandomTip, categoryLabels, type DidYouKnowTip } from '@/content/did-you-know';

const iconMap: Record<string, any> = {
  Rocket, Link: LinkIcon, TrendingUp, GraduationCap, ArrowLeftRight,
  Target, TrendingDown, Bot, Shield, Wallet, Layers, DollarSign,
  Bell, Smartphone, Share2, Calendar, Award, Flame, Crown, BarChart3,
  Coins, CheckCircle, XCircle, Zap
};

interface DidYouKnowCardProps {
  tip?: DidYouKnowTip;
  language?: 'tr' | 'en';
  showCategory?: boolean;
  showCta?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function DidYouKnowCard({ 
  tip: propTip, 
  language = 'tr',
  showCategory = true,
  showCta = true,
  onRefresh,
  className = ''
}: DidYouKnowCardProps) {
  const [tip, setTip] = useState<DidYouKnowTip>(propTip || getRandomTip());

  useEffect(() => {
    if (propTip) {
      setTip(propTip);
    }
  }, [propTip]);

  const handleRefresh = () => {
    const newTip = getRandomTip();
    setTip(newTip);
    onRefresh?.();
  };

  const Icon = iconMap[tip.icon] || Lightbulb;
  const title = language === 'tr' ? tip.titleTR : tip.titleEN;
  const description = language === 'tr' ? tip.descriptionTR : tip.descriptionEN;
  const categoryLabel = language === 'tr' ? categoryLabels[tip.category].tr : categoryLabels[tip.category].en;

  return (
    <Card className={`bg-gradient-to-br from-primary/5 via-background to-accent/5 border-primary/20 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            <Lightbulb className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-medium text-primary">
                {language === 'tr' ? 'Biliyor muydun?' : 'Did you know?'}
              </span>
              {showCategory && (
                <Badge variant="secondary" className="text-xs">
                  {categoryLabel}
                </Badge>
              )}
            </div>
            
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
              <Icon className="h-4 w-4 text-accent shrink-0" />
              <span>{title}</span>
            </h3>
            
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              {description}
            </p>
            
            <div className="flex items-center gap-2 flex-wrap">
              {showCta && tip.ctaPage && (
                <Link href={tip.ctaPage}>
                  <Button size="sm" variant="default" className="h-7 text-xs gap-1">
                    {tip.ctaText || (language === 'tr' ? 'Dene' : 'Try it')}
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              )}
              
              <Button 
                size="sm" 
                variant="ghost" 
                className="h-7 text-xs gap-1"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-3 w-3" />
                {language === 'tr' ? 'Başka İpucu' : 'Another Tip'}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact version for sidebars/footers
export function DidYouKnowCompact({ language = 'tr' }: { language?: 'tr' | 'en' }) {
  const [tip, setTip] = useState<DidYouKnowTip>(getRandomTip());
  const Icon = iconMap[tip.icon] || Lightbulb;
  const title = language === 'tr' ? tip.titleTR : tip.titleEN;

  return (
    <div 
      className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 hover-elevate cursor-pointer"
      onClick={() => setTip(getRandomTip())}
    >
      <Lightbulb className="h-4 w-4 text-primary shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate flex items-center gap-1">
          <Icon className="h-3 w-3 text-accent shrink-0" />
          {title}
        </p>
      </div>
      <RefreshCw className="h-3 w-3 text-muted-foreground shrink-0" />
    </div>
  );
}

// List all tips by category
export function DidYouKnowList({ language = 'tr' }: { language?: 'tr' | 'en' }) {
  const categories = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>;
  
  return (
    <div className="space-y-6">
      {categories.map(category => {
        const tips = didYouKnowTips.filter(t => t.category === category);
        const label = language === 'tr' ? categoryLabels[category].tr : categoryLabels[category].en;
        
        return (
          <div key={category}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Badge variant="outline">{label}</Badge>
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {tips.map(tip => (
                <DidYouKnowCard 
                  key={tip.id} 
                  tip={tip} 
                  language={language}
                  showCategory={false}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
