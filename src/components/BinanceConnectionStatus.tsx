/**
 * Componente de Status da Conexão Binance
 * Princípio: SRP - Responsável apenas por exibir status da conexão
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { validateBinanceApiKeys, formatUSDT, type BinanceApiKeyStatus } from "@/services/binanceService";

export const BinanceConnectionStatus = () => {
  const [status, setStatus] = useState<BinanceApiKeyStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkConnection = async () => {
    setLoading(true);
    const result = await validateBinanceApiKeys();
    setStatus(result);
    setLoading(false);
  };

  useEffect(() => {
    checkConnection();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Status da Conexão Binance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span>Verificando conexão...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status da Conexão Binance</CardTitle>
        <CardDescription>
          Diagnóstico da integração com Binance Futures API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status das API Keys */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">API Keys Configuradas</span>
            {status.isConfigured ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Sim
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Não
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Permissões Futures</span>
            {status.hasPermissions ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Ativas
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Inativas
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Pode Negociar</span>
            {status.canTradeFutures ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Sim
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                Não
              </Badge>
            )}
          </div>

          {status.balance !== undefined && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-medium">Saldo Disponível</span>
              <span className="text-lg font-bold text-primary">
                {formatUSDT(status.balance)}
              </span>
            </div>
          )}
        </div>

        {/* Mensagem de Erro ou Sucesso */}
        {status.error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {status.error}
            </AlertDescription>
          </Alert>
        ) : status.canTradeFutures ? (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-sm text-green-800 dark:text-green-200">
              ✓ Conexão estabelecida! Você pode usar negociação automática.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Instruções para Ativar Permissões */}
        {status.isConfigured && !status.hasPermissions && (
          <Alert>
            <AlertDescription className="text-xs space-y-2">
              <p className="font-semibold">📝 Como habilitar permissões de Futures:</p>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Acesse <a href="https://www.binance.com/en/my/settings/api-management" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Binance API Management</a></li>
                <li>Clique em "Edit" na sua API key</li>
                <li>Marque a opção "Enable Futures"</li>
                <li>Se necessário, adicione o IP do servidor à whitelist</li>
                <li>Salve as alterações e aguarde alguns minutos</li>
              </ol>
            </AlertDescription>
          </Alert>
        )}

        {/* Botão de Atualizar */}
        <Button 
          onClick={checkConnection} 
          variant="outline" 
          className="w-full"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Verificar Novamente
        </Button>
      </CardContent>
    </Card>
  );
};
