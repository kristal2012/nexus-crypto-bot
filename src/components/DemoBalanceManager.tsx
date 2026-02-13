/**
 * Demo Balance Manager
 * 
 * SRP: Gerencia apenas o saldo demonstrativo
 * Permite resetar e configurar novo valor inicial
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, RotateCcw, AlertTriangle } from "lucide-react";
import { FIXED_USER_ID } from "@/config/userConfig";
import { resetDemoAccount, updateDemoBalance as updateDemoBalanceService } from "@/services/demoAccountService";

interface DemoBalanceManagerProps {
  onBalanceUpdate?: () => void;
}

export const DemoBalanceManager = ({ onBalanceUpdate }: DemoBalanceManagerProps) => {
  const { settings, refetch, loading } = useTradingSettings();
  const { toast } = useToast();
  const [newBalance, setNewBalance] = useState("");
  const [updating, setUpdating] = useState(false);

  if (loading || !settings || settings.trading_mode !== "DEMO") {
    return null;
  }

  const handleUpdateBalance = async () => {
    
    const value = parseFloat(newBalance);
    
    if (isNaN(value) || value <= 0) {
      toast({
        title: "Valor inválido",
        description: "Digite um valor maior que zero",
        variant: "destructive",
      });
      return;
    }

    setUpdating(true);
    try {
      await updateDemoBalanceService(FIXED_USER_ID, value);
      await refetch();
      onBalanceUpdate?.();
      
      toast({
        title: "Saldo atualizado",
        description: `Novo saldo demo: $${value.toLocaleString()}`,
      });
      setNewBalance("");
    } catch (error) {
      toast({
        title: "Erro ao atualizar saldo",
        description: "Não foi possível atualizar o saldo demo",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleReset = async () => {
    setUpdating(true);
    try {
      await resetDemoAccount(FIXED_USER_ID, 10000);
      await refetch();
      onBalanceUpdate?.();
      
      toast({
        title: "Conta demo resetada",
        description: "Saldo resetado e auto-trading pausado. Reative manualmente se necessário.",
      });
      setNewBalance("");
    } catch (error) {
      toast({
        title: "Erro ao resetar conta",
        description: "Não foi possível resetar a conta demo",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Gerenciar Saldo Demo
        </CardTitle>
        <CardDescription>
          Configure o saldo inicial para suas simulações
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label className="text-muted-foreground">Saldo Atual</Label>
          <p className="text-2xl font-bold">${settings.demo_balance.toLocaleString()}</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-balance">Novo Saldo Inicial</Label>
          <div className="flex gap-2">
            <Input
              id="new-balance"
              type="number"
              placeholder="Ex: 5000"
              value={newBalance}
              onChange={(e) => setNewBalance(e.target.value)}
              disabled={updating}
              min="0"
              step="100"
            />
            <Button
              onClick={handleUpdateBalance}
              disabled={updating || !newBalance}
            >
              Aplicar
            </Button>
          </div>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Resetar</strong> irá pausar o auto-trading, fechar todas as posições abertas e zerar o histórico. Você precisará reativar o bot manualmente.
          </AlertDescription>
        </Alert>

        <Button
          variant="outline"
          onClick={handleReset}
          disabled={updating}
          className="w-full"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Resetar para $10,000
        </Button>
      </CardContent>
    </Card>
  );
};
