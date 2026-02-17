
import { useEffect, useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Terminal, RefreshCw, AlertCircle, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface LogEntry {
    id: string;
    level: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
    message: string;
    details?: any;
    created_at: string;
}

export const SystemLogs = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('bot_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setLogs((data as unknown as LogEntry[]) || []);
        } catch (error) {
            console.error('Erro ao buscar logs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();

        // Subscribe to new logs
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'bot_logs',
                },
                (payload) => {
                    const newLog = payload.new as LogEntry;
                    setLogs((prev) => [newLog, ...prev].slice(0, 100));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'ERROR': return 'text-red-500 border-red-500/50 bg-red-500/10';
            case 'WARNING': return 'text-amber-500 border-amber-500/50 bg-amber-500/10';
            case 'SUCCESS': return 'text-green-500 border-green-500/50 bg-green-500/10';
            default: return 'text-blue-500 border-blue-500/50 bg-blue-500/10';
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'ERROR': return <AlertCircle className="h-4 w-4" />;
            case 'WARNING': return <AlertTriangle className="h-4 w-4" />;
            case 'SUCCESS': return <CheckCircle className="h-4 w-4" />;
            default: return <Info className="h-4 w-4" />;
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Terminal className="h-5 w-5" />
                    Logs do Sistema
                </CardTitle>
                <Badge variant={loading ? "outline" : "secondary"} className="gap-1">
                    {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : logs.length} eventos
                </Badge>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[400px] rounded-md border p-4 bg-black/90">
                    <div className="space-y-4">
                        {logs.length === 0 && !loading && (
                            <p className="text-center text-muted-foreground py-8">
                                Nenhum log registrado ainda.
                            </p>
                        )}

                        {logs.map((log) => (
                            <div key={log.id} className={`flex items-start gap-3 p-3 rounded border text-sm ${getLevelColor(log.level)}`}>
                                <div className="mt-0.5 shrink-0">
                                    {getLevelIcon(log.level)}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold">{log.message}</span>
                                        <span className="text-xs opacity-70 whitespace-nowrap ml-2">
                                            {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
                                        </span>
                                    </div>
                                    {log.details && (
                                        <pre className="text-xs bg-black/20 p-2 rounded overflow-x-auto mt-2">
                                            {JSON.stringify(log.details, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
