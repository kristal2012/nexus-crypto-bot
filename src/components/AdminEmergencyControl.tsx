import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { AlertTriangle, Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export const AdminEmergencyControl = () => {
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();

  // Fetch current system status
  const { data: systemSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  const toggleTrading = async (action: 'enable' | 'disable') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-emergency-stop', {
        body: {
          action,
          message: message || null
        }
      });

      if (error) throw error;

      toast.success(
        action === 'enable' 
          ? '✅ Trading habilitado com sucesso!' 
          : '⛔ Parada de emergência ativada!'
      );
      
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
    } catch (error: any) {
      console.error('Error toggling trading:', error);
      toast.error(error.message || 'Erro ao executar ação');
    } finally {
      setIsLoading(false);
    }
  };

  const tradingEnabled = systemSettings?.trading_enabled ?? true;

  return (
    <Card className="p-6 border-2 border-destructive/20">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-destructive" />
          <div>
            <h2 className="text-lg font-bold">Painel de Controle Admin</h2>
            <p className="text-sm text-muted-foreground">
              Status: {tradingEnabled 
                ? <span className="text-green-600 font-semibold">Trading Ativo</span>
                : <span className="text-red-600 font-semibold">Trading Bloqueado</span>
              }
            </p>
          </div>
        </div>

        {systemSettings?.emergency_message && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded">
            <p className="text-sm">
              <strong>Mensagem:</strong> {systemSettings.emergency_message}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="emergency-message">Mensagem (opcional)</Label>
          <Input
            id="emergency-message"
            placeholder="Motivo da parada/reativação"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="flex gap-3">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => toggleTrading('disable')}
            disabled={isLoading || !tradingEnabled}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Parada de Emergência
          </Button>

          <Button
            variant="default"
            className="flex-1"
            onClick={() => toggleTrading('enable')}
            disabled={isLoading || tradingEnabled}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Shield className="h-4 w-4 mr-2" />
            )}
            Reativar Trading
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          ⚠️ A parada de emergência bloqueia todas as operações de trading em tempo real.
        </p>
      </div>
    </Card>
  );
};
