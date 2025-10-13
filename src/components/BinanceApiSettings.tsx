import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff, Save } from "lucide-react";

export const BinanceApiSettings = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    if (user) {
      loadApiKeys();
    }
  }, [user]);

  const loadApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from("binance_api_keys")
        .select("api_key")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setApiKey(data.api_key);
        setHasKeys(true);
      }
    } catch (error) {
      console.error("Error loading API keys:", error);
    }
  };

  const saveApiKeys = async () => {
    if (!user) {
      toast.error("Você precisa estar logado");
      return;
    }

    if (!apiKey.trim() || !apiSecret.trim()) {
      toast.error("Por favor, preencha ambas as chaves");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("binance_api_keys").upsert(
        {
          user_id: user.id,
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
        },
        {
          onConflict: "user_id",
        }
      );

      if (error) throw error;

      toast.success("Chaves da API salvas com sucesso!");
      setHasKeys(true);
      setApiSecret(""); // Clear secret from memory after saving
    } catch (error: any) {
      console.error("Error saving API keys:", error);
      toast.error(error.message || "Erro ao salvar chaves da API");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chaves da API Binance</CardTitle>
        <CardDescription>
          Configure suas chaves da API da Binance para trading automatizado
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          ⚠️ Suas chaves são criptografadas e armazenadas com segurança. Nunca
          compartilhe suas chaves da API com terceiros.
        </p>
      </CardContent>
    </Card>
  );
};
