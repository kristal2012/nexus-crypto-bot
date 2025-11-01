/**
 * Operations In Progress Component
 * 
 * SRP: Exibe operações de trading em andamento com progresso animado
 * Preparado para receber dados em tempo real via WebSocket/API
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, Clock, Target } from "lucide-react";

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

// Simulação de atualizações em tempo real (substituir por WebSocket/API no futuro)
const simulateLiveUpdates = (setOperations: React.Dispatch<React.SetStateAction<Operation[]>>) => {
  const interval = setInterval(() => {
    setOperations(prev =>
      prev.map(op => {
        const increment = Math.random() * 8 + 2; // 2-10% por vez
        const newProgress = Math.min(op.progress + increment, 100);
        
        // Reinicia quando completa
        if (newProgress >= 100) {
          return { ...op, progress: 0 };
        }
        
        return { ...op, progress: newProgress };
      })
    );
  }, 1500);
  
  return interval;
};

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
  const [operations, setOperations] = useState<Operation[]>([
    {
      id: "1",
      label: "Análise de Mercado AI",
      progress: 45,
      color: "bg-primary",
      bgColor: "bg-primary/20",
      status: "analyzing",
      nextAction: "Identificando padrões",
      icon: <Activity className="w-4 h-4" />,
    },
    {
      id: "2",
      label: "Execução de Ordem",
      progress: 70,
      color: "bg-success",
      bgColor: "bg-success/20",
      status: "executing",
      nextAction: "Aguardando preenchimento",
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: "3",
      label: "Monitoramento Stop Loss",
      progress: 25,
      color: "bg-warning",
      bgColor: "bg-warning/20",
      status: "monitoring",
      nextAction: "Verificando níveis",
      icon: <Target className="w-4 h-4" />,
    },
  ]);

  const [lastUpdate, setLastUpdate] = useState(new Date());

  useEffect(() => {
    const interval = simulateLiveUpdates(setOperations);
    
    const timeInterval = setInterval(() => {
      setLastUpdate(new Date());
    }, 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(timeInterval);
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

  const activeOperationsCount = operations.filter(op => op.progress > 0).length;

  return (
    <Card className="bg-gradient-card border-border shadow-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Operações em Andamento
          </CardTitle>
          <Badge variant="outline" className="border-primary text-primary">
            {activeOperationsCount} ativas
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Progress Segments */}
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

        {/* Stats Section */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Última operação:</span>
            <span className="font-medium text-foreground">{operations[0].label}</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Estatísticas do dia:</span>
            <span className="font-medium text-foreground">{operations.length} operações</span>
          </div>
          
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Próxima ação:</span>
            <span className="font-medium text-foreground">{operations[0].nextAction}</span>
          </div>
        </div>

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
