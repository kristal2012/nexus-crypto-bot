import { TradingDashboard } from "@/components/TradingDashboard";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { TradingModeDebugger } from "@/components/TradingModeDebugger";
import { CircuitBreakerAlert } from "@/components/CircuitBreakerAlert";
import { StrategyAdjustmentSuggestions } from "@/components/StrategyAdjustmentSuggestions";
import { DemoBalanceManager } from "@/components/DemoBalanceManager";
import { AutoTradingControl } from "@/components/AutoTradingControl";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        {/* Circuit Breaker & Strategy Alerts */}
        <CircuitBreakerAlert />
        <StrategyAdjustmentSuggestions />
        <DemoBalanceManager />
        
        <SystemHealthMonitor />
        <TradingModeDebugger />
        <AutoTradingControl />
        <TradingDashboard />
      </div>
    </div>
  );
};

export default Index;
