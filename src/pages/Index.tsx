import { TradingDashboard } from "@/components/TradingDashboard";
import { UserIdDisplay } from "@/components/UserIdDisplay";
import { AdminEmergencyControl } from "@/components/AdminEmergencyControl";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { TradingModeDebugger } from "@/components/TradingModeDebugger";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const Index = () => {
  const { isAdmin } = useIsAdmin();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/20 py-8">
      <div className="container mx-auto px-4 max-w-7xl space-y-4">
        <UserIdDisplay />
        {isAdmin && (
          <>
            <AdminEmergencyControl />
            <SystemHealthMonitor />
          </>
        )}
        <TradingModeDebugger />
        <TradingDashboard />
      </div>
    </div>
  );
};

export default Index;
