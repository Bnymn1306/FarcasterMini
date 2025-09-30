import { HeroSection } from '../HeroSection';

export default function HeroSectionExample() {
  return (
    <HeroSection 
      onLaunchClick={() => console.log('Launch clicked')}
      onBrowseClick={() => console.log('Browse clicked')}
    />
  );
}
