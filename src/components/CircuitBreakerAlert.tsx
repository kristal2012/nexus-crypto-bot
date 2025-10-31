/**
 * Circuit Breaker Alert Component
 * Princípios: SRP - Apenas exibe alertas de circuit breaker
 */

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { getCircuitBreakerStatus } from "@/services/tradeValidationService";

export const CircuitBreakerAlert = () => {
  const [status, setStatus] = useState<{
    isValid: boolean;
    reason?: string;
    severity: 'none' | 'warning' | 'critical';
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await getCircuitBreakerStatus();
        setStatus(result);
      } catch (error) {
        console.error('Erro ao verificar circuit breaker:', error);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Verifica a cada 30s

    return () => clearInterval(interval);
  }, []);

  if (loading || !status || status.severity === 'none') {
    return null;
  }

  if (status.severity === 'critical') {
    return (
      <Alert variant="destructive" className="mb-4">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>🛑 Trading Pausado - Circuit Breaker Ativado</AlertTitle>
        <AlertDescription className="mt-2">
          {status.reason}
          <div className="mt-2 text-sm">
            <strong>Ação necessária:</strong> Revisar estratégia e ajustar parâmetros antes de reativar.
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (status.severity === 'warning') {
    return (
      <Alert className="mb-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800 dark:text-yellow-200">
          ⚠️ Atenção - Performance Abaixo do Esperado
        </AlertTitle>
        <AlertDescription className="mt-2 text-yellow-700 dark:text-yellow-300">
          {status.reason}
          <div className="mt-2 text-sm">
            <strong>Recomendação:</strong> Considerar ajustar parâmetros de trading.
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert className="mb-4 border-green-500 bg-green-50 dark:bg-green-950">
      <ShieldCheck className="h-4 w-4 text-green-600" />
      <AlertTitle className="text-green-800 dark:text-green-200">
        ✅ Sistema Operacional
      </AlertTitle>
      <AlertDescription className="text-green-700 dark:text-green-300">
        Performance dentro dos parâmetros aceitáveis.
      </AlertDescription>
    </Alert>
  );
};
