import { HeroSection } from "@/components/HeroSection";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div>
      <HeroSection 
        onLaunchClick={() => setLocation('/create')}
        onBrowseClick={() => setLocation('/browse')}
      />
    </div>
  );
}
