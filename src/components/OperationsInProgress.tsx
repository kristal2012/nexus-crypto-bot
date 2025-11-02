/**
 * Operations In Progress Component
 * 
 * SRP: Exibe operações de trading em andamento com dados reais
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, Clock, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Operation {
  id: string;
  label: string;
  progress: number;
  color: string;
  bgColor: string;
  status: "analyzing" | "executing" | "monitoring";
  nextAction: string;
  icon: React.ReactNode;
}

const ProgressSegment = ({ color, progress, bgColor }: { color: string; progress: number; bgColor: string }) => (
  <div className={`h-3 w-full rounded-full overflow-hidden ${bgColor}`}>
    <motion.div
      className={`h-full rounded-full ${color}`}
      initial={false}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />
  </div>
);

export const OperationsInProgress = () => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const loadRealOperations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar posições abertas
      const { data: positions } = await supabase
        .from('positions')
        .select('id, symbol, side, unrealized_pnl, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

      const ops: Operation[] = [];

      // Adicionar posições em monitoramento
      if (positions && positions.length > 0) {
        positions.forEach((pos) => {
          const pnlPercent = pos.unrealized_pnl || 0;
          const targetProfit = 5;
          const stopLoss = 3;
          const progress = Math.min(Math.max((pnlPercent / targetProfit) * 100, 0), 100);
          
          ops.push({
            id: `pos-${pos.id}`,
            label: `${pos.symbol} ${pos.side}`,
            progress,
            color: pnlPercent >= 0 ? "bg-success" : "bg-destructive",
            bgColor: pnlPercent >= 0 ? "bg-success/20" : "bg-destructive/20",
            status: "monitoring",
            nextAction: pnlPercent >= 0 
              ? `+${pnlPercent.toFixed(2)}% | Alvo: +${targetProfit}%`
              : `${pnlPercent.toFixed(2)}% | Stop: -${stopLoss}%`,
            icon: <Target className="w-4 h-4" />,
          });
        });
      }

      // Se não há posições, mostrar análise de mercado
      if (ops.length === 0) {
        const { data: config } = await supabase
          .from('auto_trading_config')
          .select('is_active')
          .eq('user_id', user.id)
          .single();

        if (config?.is_active) {
          ops.push({
            id: "market-analysis",
            label: "Análise de Mercado AI",
            progress: 0,
            color: "bg-primary",
            bgColor: "bg-primary/20",
            status: "analyzing",
            nextAction: "Buscando oportunidades",
            icon: <Activity className="w-4 h-4" />,
          });
        }
      }

      setOperations(ops);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Erro ao carregar operações:', error);
    }
  };

  useEffect(() => {
    loadRealOperations();
    
    // Atualizar a cada 5 segundos
    const interval = setInterval(loadRealOperations, 5000);
    
    // Realtime updates para posições
    const channel = supabase
      .channel('operations-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions'
        },
        () => {
          loadRealOperations();
        }
      )
      .subscribe();
    
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: Operation["status"]) => {
    const statusConfig = {
      analyzing: { label: "Analisando", variant: "default" as const },
      executing: { label: "Executando", variant: "default" as const },
      monitoring: { label: "Monitorando", variant: "secondary" as const },
    };
    
    return statusConfig[status];
  };

  const activeOperationsCount = operations.length;

  return (
    <Card className="bg-gradient-card border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Operações em Andamento
          </CardTitle>
          <Badge variant="outline" className="border-primary text-primary">
            {activeOperationsCount} {activeOperationsCount === 1 ? 'ativa' : 'ativas'}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {operations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Nenhuma operação em andamento</p>
            <p className="text-xs mt-1">O bot está aguardando oportunidades</p>
          </div>
        ) : (
          <div className="space-y-4">
            {operations.map((op) => (
            <div key={op.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg ${op.bgColor} flex items-center justify-center`}>
                    {op.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{op.label}</p>
                    <p className="text-xs text-muted-foreground">{op.nextAction}</p>
                  </div>
                </div>
                <Badge variant={getStatusBadge(op.status).variant} className="text-xs">
                  {getStatusBadge(op.status).label}
                </Badge>
              </div>
              
              <div className="flex items-center gap-3">
                <ProgressSegment 
                  color={op.color} 
                  progress={op.progress}
                  bgColor={op.bgColor}
                />
                <span className="text-xs font-mono text-muted-foreground min-w-[45px]">
                  {op.progress.toFixed(1)}%
                </span>
              </div>
            </div>
          ))}
          </div>
        )}

        {/* Stats Section */}
        {operations.length > 0 && (
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Última atualização:</span>
              <span className="font-medium text-foreground">{operations[0].label}</span>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium text-foreground">{operations[0].nextAction}</span>
            </div>
          </div>
        )}

        {/* Last Update */}
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Atualizado: {lastUpdate.toLocaleTimeString('pt-BR')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
