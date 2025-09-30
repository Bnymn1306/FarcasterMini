import { GasFeeDisplay } from '../GasFeeDisplay';

export default function GasFeeDisplayExample() {
  return (
    <div className="p-8 space-y-4">
      <GasFeeDisplay gasFee="0.00003" />
      <GasFeeDisplay gasFee="0.00015" showBadge />
    </div>
  );
}
