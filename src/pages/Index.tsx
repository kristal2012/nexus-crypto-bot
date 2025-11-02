import { TradingDashboard } from "@/components/TradingDashboard";
import { UserIdDisplay } from "@/components/UserIdDisplay";
import { AdminEmergencyControl } from "@/components/AdminEmergencyControl";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { TradingModeDebugger } from "@/components/TradingModeDebugger";
import { PerformanceMonitor } from "@/components/PerformanceMonitor";
import { CircuitBreakerAlert } from "@/components/CircuitBreakerAlert";
import { StrategyAdjustmentSuggestions } from "@/components/StrategyAdjustmentSuggestions";
import { DemoBalanceManager } from "@/components/DemoBalanceManager";
import { AutoTradingControl } from "@/components/AutoTradingControl";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const Index = () => {
  const { isAdmin } = useIsAdmin();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        <UserIdDisplay />
        
        {/* Circuit Breaker & Strategy Alerts */}
        <CircuitBreakerAlert />
        <StrategyAdjustmentSuggestions />
        <DemoBalanceManager />
        
        {/* Auto Trading Control - Executa análises a cada 15min */}
        <AutoTradingControl />
        
        {isAdmin && (
          <>
            <AdminEmergencyControl />
            <SystemHealthMonitor />
          </>
        )}
        <TradingModeDebugger />
        <PerformanceMonitor />
        <TradingDashboard />
      </div>
    </div>
  );
};

export default Index;
