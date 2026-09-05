import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aviso de privacidad — Marea",
};

// Mirrors docs/aviso-de-privacidad.md — edit both together. Template
// content pending legal review, not a final legal document; see that
// file's own header for why.
export default function PrivacyNoticePage() {
  return (
    <div className="mx-auto max-w-[640px] px-lg py-[64px] text-on-surface">
      <h1 className="mb-lg font-display text-[28px] font-semibold">Aviso de privacidad</h1>

      <p className="mb-lg text-[13px] text-on-surface-muted">
        Esta página es una plantilla pendiente de revisión legal: describe con
        precisión qué guardamos y por qué, pero su cumplimiento legal final
        debe confirmarlo alguien con esa competencia.
      </p>

      <h2 className="mb-sm mt-xl text-[18px] font-semibold">Qué información recopilamos</h2>
      <ul className="mb-lg list-disc space-y-[6px] pl-lg text-[14px]">
        <li>
          <strong>Al reservar una mesa</strong>: nombre, y al menos un dato de
          contacto (correo o teléfono). Opcionalmente, comentarios sobre la
          reservación.
        </li>
        <li>
          <strong>Al ordenar como invitado</strong>: nombre, teléfono y, si lo
          compartes, correo electrónico.
        </li>
        <li>
          <strong>Datos técnicos</strong>: la dirección IP de quien hace una
          reservación, un pedido, o intenta iniciar sesión en el panel, para
          prevenir abuso y detectar accesos indebidos.
        </li>
      </ul>

      <h2 className="mb-sm mt-xl text-[18px] font-semibold">Para qué los usamos</h2>
      <ul className="mb-lg list-disc space-y-[6px] pl-lg text-[14px]">
        <li>Confirmar y darle seguimiento a tu reservación o pedido.</li>
        <li>Contactarte si hay un problema con cualquiera de los dos.</li>
        <li>Prevenir spam y abuso del sistema de pedidos y reservaciones.</li>
      </ul>

      <h2 className="mb-sm mt-xl text-[18px] font-semibold">Cuánto tiempo los conservamos</h2>
      <ul className="mb-lg list-disc space-y-[6px] pl-lg text-[14px]">
        <li>
          Las direcciones IP asociadas a intentos de acceso y límites de tasa
          se eliminan a los 90 días.
        </li>
        <li>
          El nombre, correo y teléfono de pedidos y reservaciones se
          anonimizan pasados 24 meses; los montos y fechas de la transacción
          se conservan para efectos contables, sin datos que te identifiquen.
        </li>
        <li>
          Si te diste de alta en nuestro boletín, tus datos se conservan hasta
          que te des de baja usando el enlace de cualquier correo que te
          enviemos.
        </li>
      </ul>

      <h2 className="mb-sm mt-xl text-[18px] font-semibold">Cómo pedir que se borren tus datos</h2>
      <p className="text-[14px]">
        Escríbenos a{" "}
        <a href="mailto:hello@marea.com" className="text-primary underline">
          hello@marea.com
        </a>{" "}
        indicando el correo o teléfono con el que reservaste u ordenaste. Si
        tu pedido o reservación ya se completó, conservaremos el registro
        contable de la transacción sin tu información de contacto.
      </p>
    </div>
  );
}
