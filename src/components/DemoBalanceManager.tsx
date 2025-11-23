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
import { useTradingSettings } from "@/hooks/useTradingSettings";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";

interface DemoBalanceManagerProps {
  onBalanceUpdate?: () => void;
}

export const DemoBalanceManager = ({ onBalanceUpdate }: DemoBalanceManagerProps) => {
  const { user } = useAuthContext();
  const { settings, updateDemoBalance, loading } = useTradingSettings();
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
      await updateDemoBalance(value);
      
      // Dispara atualização das estatísticas do dashboard
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
    if (!user?.id) return;
    
    setUpdating(true);
    try {
      // Atualiza o saldo para 10000
      await updateDemoBalance(10000);
      
      // Limpa todas as posições abertas em modo DEMO
      const { error: deleteError } = await supabase
        .from("positions")
        .delete()
        .eq("user_id", user.id)
        .eq("is_demo", true);
      
      if (deleteError) {
        console.error("Erro ao limpar posições:", deleteError);
      }
      
      // Dispara atualização das estatísticas do dashboard
      onBalanceUpdate?.();
      
      toast({
        title: "Saldo resetado",
        description: "Saldo demo resetado para $10,000 e posições limpas",
      });
      setNewBalance("");
    } catch (error) {
      toast({
        title: "Erro ao resetar saldo",
        description: "Não foi possível resetar o saldo demo",
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
