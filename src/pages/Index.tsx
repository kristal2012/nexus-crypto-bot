import { TradingDashboard } from "@/components/TradingDashboard";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { TradingModeDebugger } from "@/components/TradingModeDebugger";
import { CircuitBreakerAlert } from "@/components/CircuitBreakerAlert";
import { StrategyAdjustmentSuggestions } from "@/components/StrategyAdjustmentSuggestions";
import { DemoBalanceManager } from "@/components/DemoBalanceManager";
import { AutoTradingControl } from "@/components/AutoTradingControl";
import { UserIdDisplay } from "@/components/UserIdDisplay";
import { AdminEmergencyControl } from "@/components/AdminEmergencyControl";
import { BotStatus } from "@/components/BotStatus";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useDemoPositionMonitor } from "@/hooks/useDemoPositionMonitor";
import { useTradingMode } from "@/hooks/useTradingMode";
import { useBotActive } from "@/hooks/useBotActive";

const Index = () => {
  const { isAdmin } = useIsAdmin();
  const { refetch: refetchStats } = useDashboardStats();
  const { isDemoMode } = useTradingMode();
  const { isActive } = useBotActive();
  
  // Monitor DEMO positions for TP/SL/Trailing
  useDemoPositionMonitor(isActive, isDemoMode);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        {/* Circuit Breaker & Strategy Alerts */}
        <CircuitBreakerAlert />
        <StrategyAdjustmentSuggestions />
        <DemoBalanceManager onBalanceUpdate={refetchStats} />
        
        <UserIdDisplay />
        {isAdmin && <AdminEmergencyControl />}
        
        <TradingDashboard />
        <BotStatus />
        <SystemHealthMonitor />
        <TradingModeDebugger />
        <AutoTradingControl />
      </div>
    </div>
  );
};

export default Index;
