import { useAuthContext } from "@/contexts/AuthContext";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const UserIdDisplay = () => {
  const { user } = useAuthContext();
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("UUID copiado!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!user) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Seu User ID (UUID)</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
            {user.id}
          </code>
          <Button
            variant="outline"
            size="icon"
            onClick={copyToClipboard}
            className="shrink-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Use este UUID no SQL para se tornar administrador
        </p>
      </div>
    </Card>
  );
};
