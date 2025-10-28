import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { TestTube, CheckCircle, XCircle, Loader2, AlertCircle } from "lucide-react";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: any;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  duration: number;
}

export const SystemHealthMonitor = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const { toast } = useToast();

  const runTests = async () => {
    setIsRunning(true);
    setResults(null);
    setSummary(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-ai-auto-trade');

      if (error) {
        toast({
          title: "Erro ao executar testes",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      if (data) {
        setResults(data.results);
        setSummary(data.summary);
        
        if (data.summary.failed > 0) {
          toast({
            title: "⚠️ Alguns testes falharam",
            description: `${data.summary.failed} de ${data.summary.total} testes falharam`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "✅ Todos os testes passaram",
            description: `${data.summary.total} testes executados com sucesso`,
          });
        }
      }
    } catch (error) {
      toast({
        title: "Erro ao executar testes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TestTube className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Testes do Sistema</h3>
              <p className="text-xs text-muted-foreground">
                Validação automática do sistema de análise IA
              </p>
            </div>
          </div>
          <Button
            onClick={runTests}
            disabled={isRunning}
            variant="outline"
            size="sm"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Executando...
              </>
            ) : (
              <>
                <TestTube className="w-4 h-4 mr-2" />
                Executar Testes
              </>
            )}
          </Button>
        </div>

        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-4 gap-3 p-3 bg-background/50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">{summary.passed}</div>
              <div className="text-xs text-muted-foreground">Passaram</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{summary.failed}</div>
              <div className="text-xs text-muted-foreground">Falharam</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{summary.duration}ms</div>
              <div className="text-xs text-muted-foreground">Duração</div>
            </div>
          </div>
        )}

        {/* Test Results */}
        {results && results.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Resultados dos Testes:</h4>
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${
                  result.passed
                    ? 'bg-success/5 border-success/20'
                    : 'bg-destructive/5 border-destructive/20'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2 flex-1">
                    {result.passed ? (
                      <CheckCircle className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-foreground">{result.name}</div>
                      {result.error && (
                        <div className="text-xs text-destructive mt-1 break-words">
                          {result.error}
                        </div>
                      )}
                      {result.details && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {JSON.stringify(result.details, null, 2)}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant={result.passed ? "default" : "destructive"} className="ml-2 flex-shrink-0">
                    {result.duration}ms
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        {!results && !isRunning && (
          <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">O que é testado?</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Validação de credenciais da Binance</li>
                <li>Sistema de rate limit</li>
                <li>Formato de respostas de erro</li>
                <li>Validação de modo de trading</li>
                <li>Cálculo de distribuição de orçamento</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
