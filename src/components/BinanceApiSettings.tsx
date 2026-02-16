import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FIXED_USER_ID } from "@/config/userConfig";
import { Eye, EyeOff, Save, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { clearBinanceValidationCache } from "@/services/binanceService";
import { BinanceApiKeysTroubleshooting } from "./BinanceApiKeysTroubleshooting";

export const BinanceApiSettings = () => {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasKeys, setHasKeys] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    loadApiKeys();
    checkSession();
  }, []);

  // Teste de localStorage
  useEffect(() => {
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      console.log('✅ localStorage disponível');
    } catch (e) {
      console.error('❌ localStorage bloqueado:', e);
      toast.error(
        "⚠️ Armazenamento local bloqueado no seu navegador.\n" +
        "Habilite cookies e armazenamento local para usar o bot."
      );
    }
  }, []);

  const checkSession = async () => {
    // BYPASS PARA MODO SIMULAÇÃO
    const isSimulation = (typeof process !== 'undefined' && process.env?.VITE_TRADING_MODE === 'test') ||
      (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_TRADING_MODE === 'test');

    if (isSimulation) {
      setIsSessionValid(true);
      return;
    }

    const { data: { session }, error } = await supabase.auth.getSession();
    const isValid = !!session && !error;
    setIsSessionValid(isValid);

    if (!isValid) {
      console.error('❌ Sessão inválida:', error);
    } else {
      console.log('✅ Sessão válida, expires at:', new Date(session.expires_at! * 1000));
    }
  };

  const loadApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("binance_api_keys")
        .select("api_key, api_secret_encrypted")
        .eq("user_id", FIXED_USER_ID)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setApiKey(data.api_key);
        // Check if secret exists (don't load the actual encrypted value)
        setHasKeys(!!data.api_secret_encrypted);
      }
    } catch (error) {
      console.error("Error loading API keys:", error);
    }
  };

  const saveApiKeys = async () => {
    // Verificar se a sessão é válida
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.error('❌ Sessão inválida ao tentar salvar:', sessionError);
      toast.error("❌ Sua sessão expirou. Recarregue a página.");
      return;
    }

    console.log('✅ Sessão válida, procedendo com salvamento...');
    console.log('User ID:', FIXED_USER_ID);
    console.log('Session expires at:', new Date(session.expires_at! * 1000));

    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error("Por favor, preencha ambas as chaves");
      return;
    }

    setLoading(true);

    // Limpa cache ANTES de salvar novas chaves
    clearBinanceValidationCache();
    localStorage.setItem('binance_config_attempted', 'true');

    console.log("🔐 Salvando chaves da Binance...", { user_id: FIXED_USER_ID });

    try {
      console.log("📡 Chamando edge function encrypt-api-secret...");
      const { data, error } = await supabase.functions.invoke('encrypt-api-secret', {
        body: {
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
        }
      });

      console.log("📥 Resposta da edge function:", { data, error });

      // Tratar erro 401 explicitamente
      if (error) {
        console.error("❌ Erro da edge function:", error);

        if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
          toast.error("❌ Sessão expirada. Redirecionando para login...");
          setTimeout(() => {
            window.location.href = '/auth';
          }, 1500);
          return;
        }

        throw error;
      }

      console.log("✅ Chaves salvas com sucesso!");

      // Limpa cache APÓS sucesso para forçar revalidação
      clearBinanceValidationCache();

      toast.success("✓ Chaves da API salvas e criptografadas com sucesso! Você já pode usar o IA Trading.");

      // Reload the page after 1.5 seconds to refresh all components and clear secret from memory
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error("❌ Error saving API keys:", error);
      toast.error(error.message || "Erro ao salvar chaves da API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Chaves da API Binance</CardTitle>
          {isSessionValid === true && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Autenticado
            </Badge>
          )}
          {isSessionValid === false && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Sessão Inválida
            </Badge>
          )}
        </div>
        <CardDescription>
          Configure suas chaves da API da Binance para trading automatizado
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSessionValid === false && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              ⚠️ Sessão inválida. Faça login novamente para configurar suas chaves.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <Input
            id="api-key"
            type="text"
            placeholder="Sua API Key da Binance"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="api-secret">API Secret</Label>
          <div className="relative">
            <Input
              id="api-secret"
              type={showSecret ? "text" : "password"}
              placeholder={hasKeys ? "••••••••••••••••" : "Sua API Secret da Binance"}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
              onClick={() => setShowSecret(!showSecret)}
            >
              {showSecret ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        <Button onClick={saveApiKeys} disabled={loading} className="w-full">
          <Save className="mr-2 h-4 w-4" />
          {loading ? "Salvando..." : hasKeys ? "Atualizar Chaves" : "Salvar Chaves"}
        </Button>

        <p className="text-sm text-muted-foreground">
          ⚠️ Suas chaves são criptografadas com AES-256-GCM antes de serem armazenadas.
          Nunca compartilhe suas chaves da API com terceiros.
        </p>
      </CardContent>

      <BinanceApiKeysTroubleshooting />
    </Card>
  );
};
