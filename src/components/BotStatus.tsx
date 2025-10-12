import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, Zap } from "lucide-react";

interface BotStatusProps {
  active: boolean;
}

export const BotStatus = ({ active }: BotStatusProps) => {
  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-foreground">Status do Bot</h3>
        <Badge 
          variant={active ? "default" : "secondary"}
          className={active ? "bg-success text-success-foreground shadow-success" : ""}
        >
          {active ? "Ativo" : "Pausado"}
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              active ? "bg-success/20" : "bg-muted"
            }`}>
              <Activity className={`w-5 h-5 ${active ? "text-success" : "text-muted-foreground"}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Sistema</p>
              <p className="text-xs text-muted-foreground">
                {active ? "Monitorando mercado" : "Aguardando"}
              </p>
            </div>
          </div>
          <div className={`w-3 h-3 rounded-full ${
            active ? "bg-success animate-pulse" : "bg-muted"
          }`} />
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">IA Preditiva</p>
              <p className="text-xs text-muted-foreground">TensorFlow.js</p>
            </div>
          </div>
          <Badge variant="outline" className="border-primary text-primary text-xs">
            Online
          </Badge>
        </div>

        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Estratégia DCA</p>
              <p className="text-xs text-muted-foreground">3 camadas ativas</p>
            </div>
          </div>
          <Badge variant="outline" className="border-warning text-warning text-xs">
            Pronto
          </Badge>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="text-xs text-muted-foreground mb-2">Última Atualização</p>
        <p className="text-sm font-mono text-foreground">
          {new Date().toLocaleTimeString('pt-BR')}
        </p>
      </div>
    </Card>
  );
};
