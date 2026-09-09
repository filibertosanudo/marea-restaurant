import { unsubscribeAction } from "@/lib/newsletter/actions";

export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await unsubscribeAction(token);

  return (
    <div className="mx-auto max-w-[480px] px-lg py-[96px] text-center text-on-surface">
      {result.ok ? (
        <>
          <h1 className="mb-sm font-display text-[22px] font-semibold">Listo</h1>
          <p className="text-[14px] text-on-surface-muted">
            Ya no recibirás nuestro boletín. Si fue un error, puedes suscribirte de nuevo desde el sitio.
          </p>
        </>
      ) : (
        <>
          <h1 className="mb-sm font-display text-[22px] font-semibold">Enlace no válido</h1>
          <p className="text-[14px] text-on-surface-muted">
            Este enlace de baja ya no es válido.
          </p>
        </>
      )}
    </div>
  );
}
