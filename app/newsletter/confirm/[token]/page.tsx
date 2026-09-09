import { confirmSubscriptionAction } from "@/lib/newsletter/actions";

export default async function ConfirmSubscriptionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await confirmSubscriptionAction(token);

  return (
    <div className="mx-auto max-w-[480px] px-lg py-[96px] text-center text-on-surface">
      {result.ok ? (
        <>
          <h1 className="mb-sm font-display text-[22px] font-semibold">Suscripción confirmada</h1>
          <p className="text-[14px] text-on-surface-muted">
            Ya estás suscrito a nuestro boletín. Cada correo lleva un enlace de baja.
          </p>
        </>
      ) : (
        <>
          <h1 className="mb-sm font-display text-[22px] font-semibold">Enlace no válido</h1>
          <p className="text-[14px] text-on-surface-muted">
            Este enlace de confirmación ya no es válido.
          </p>
        </>
      )}
    </div>
  );
}
