import { DailyBased } from '../DailyBased';

export default function DailyBasedExample() {
  return (
    <div className="max-w-xl p-8">
      <DailyBased 
        currentStreak={5}
        longestStreak={12}
        totalCheckIns={23}
        hasCheckedInToday={false}
        onCheckIn={() => console.log('Check-in clicked')}
      />
    </div>
  );
}
