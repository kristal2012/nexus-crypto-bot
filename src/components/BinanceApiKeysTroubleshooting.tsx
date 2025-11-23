import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const BinanceApiKeysTroubleshooting = () => {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-lg">🔧 Problemas ao Salvar Chaves?</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-semibold mb-2">Verifique:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2 text-muted-foreground">
              <li>Você está logado na plataforma</li>
              <li>Seu navegador permite cookies e localStorage</li>
              <li>Você copiou as chaves corretamente da Binance</li>
              <li>Não há espaços em branco antes/depois das chaves</li>
              <li>O badge acima mostra "Autenticado"</li>
            </ol>
          </div>
          
          <div>
            <p className="font-semibold mb-2">Se o problema persistir:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-muted-foreground">
              <li>Faça logout e login novamente</li>
              <li>Limpe o cache do navegador (Ctrl+Shift+Delete)</li>
              <li>Tente em uma janela anônima/privada</li>
              <li>Desative extensões do navegador temporariamente</li>
              <li>Verifique o console do navegador (F12) por erros</li>
            </ul>
          </div>

          <div className="bg-muted p-3 rounded-md mt-3">
            <p className="font-semibold mb-1">💡 Dica:</p>
            <p className="text-muted-foreground">
              O problema mais comum é sessão expirada. Se o badge mostrar "Sessão Inválida", 
              faça logout completo e login novamente antes de tentar salvar as chaves.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
