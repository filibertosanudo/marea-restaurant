"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[10px] p-lg text-center">
      <p className="text-[14px] font-medium text-error">
        Algo salió mal cargando esta sección.
      </p>
      <p className="max-w-[360px] text-[13px] text-on-surface-muted">
        Intenta de nuevo — si el problema sigue, avísale al administrador.
      </p>
      <Button variant="secondary" onClick={reset} className="mt-[6px]">
        Reintentar
      </Button>
    </div>
  );
}
