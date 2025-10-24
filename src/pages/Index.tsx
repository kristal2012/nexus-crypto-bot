import { TradingDashboard } from "@/components/TradingDashboard";
import { UserIdDisplay } from "@/components/UserIdDisplay";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        <UserIdDisplay />
        <TradingDashboard />
      </div>
    </div>
  );
};

export default Index;
