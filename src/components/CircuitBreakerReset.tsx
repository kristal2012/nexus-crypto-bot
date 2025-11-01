import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CircuitBreakerResetProps {
  currentStatus?: {
    isValid: boolean;
    reason?: string;
    severity: 'none' | 'warning' | 'critical';
  };
}

export const CircuitBreakerReset = ({ currentStatus }: CircuitBreakerResetProps) => {
  const [isResetting, setIsResetting] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive",
        });
        return;
      }

      // Atualiza strategy_adjusted_at para o momento atual
      const { error } = await supabase
        .from('auto_trading_config')
        .update({ 
          strategy_adjusted_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Circuit Breaker Resetado",
        description: "O histórico de trades foi resetado. O bot agora considerará apenas trades futuros.",
      });

      // Recarrega a página para atualizar todos os componentes
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Erro ao resetar circuit breaker:', error);
      toast({
        title: "Erro ao resetar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Resetar Circuit Breaker
        </CardTitle>
        <CardDescription>
          Limpa o histórico de performance e reinicia a análise de trades
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentStatus && !currentStatus.isValid && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Circuit Breaker Ativo</AlertTitle>
            <AlertDescription>{currentStatus.reason}</AlertDescription>
          </Alert>
        )}

        {currentStatus && currentStatus.isValid && currentStatus.severity === 'none' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Sistema Operacional</AlertTitle>
            <AlertDescription>O circuit breaker está inativo. Trades podem ser executados.</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Use este botão quando:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Ajustar parâmetros de estratégia (stop loss, take profit, confiança)</li>
            <li>Mudar configurações de risco</li>
            <li>Quiser ignorar o histórico anterior e começar do zero</li>
          </ul>
        </div>

        <Button 
          onClick={handleReset} 
          disabled={isResetting}
          className="w-full"
          variant={currentStatus && !currentStatus.isValid ? "default" : "outline"}
        >
          <RotateCcw className={`h-4 w-4 mr-2 ${isResetting ? 'animate-spin' : ''}`} />
          {isResetting ? 'Resetando...' : 'Resetar Histórico de Trades'}
        </Button>

        <p className="text-xs text-muted-foreground">
          Após resetar, o circuit breaker considerará apenas trades executados após este momento.
        </p>
      </CardContent>
    </Card>
  );
};
