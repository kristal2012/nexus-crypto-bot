import { TradingDashboard } from "@/components/TradingDashboard";
import { TradingConfig } from "@/components/TradingConfig";
import { BinanceApiSettings } from "@/components/BinanceApiSettings";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const Index = () => {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!user) {
    return <Navigate to="/auth" />;
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Trading Bot Dashboard</h1>
          <Button onClick={signOut} variant="outline">
            Sair
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <TradingDashboard />
          </div>
          <div className="space-y-6">
            <BinanceApiSettings />
            <TradingConfig />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
