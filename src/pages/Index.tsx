import { TradingDashboard } from "@/components/TradingDashboard";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { TradingModeDebugger } from "@/components/TradingModeDebugger";
import { CircuitBreakerAlert } from "@/components/CircuitBreakerAlert";
import { StrategyAdjustmentSuggestions } from "@/components/StrategyAdjustmentSuggestions";
import { DemoBalanceManager } from "@/components/DemoBalanceManager";
import { AutoTradingControl } from "@/components/AutoTradingControl";
import { UserIdDisplay } from "@/components/UserIdDisplay";
import { AdminEmergencyControl } from "@/components/AdminEmergencyControl";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const { isAdmin } = useIsAdmin();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // Show loading only while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, return null (will redirect in useEffect)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        {/* Circuit Breaker & Strategy Alerts */}
        <CircuitBreakerAlert />
        <StrategyAdjustmentSuggestions />
        <DemoBalanceManager />
        
        <UserIdDisplay />
        {isAdmin && <AdminEmergencyControl />}
        
        <SystemHealthMonitor />
        <TradingModeDebugger />
        <AutoTradingControl />
        <TradingDashboard />
      </div>
    </div>
  );
};

export default Index;
