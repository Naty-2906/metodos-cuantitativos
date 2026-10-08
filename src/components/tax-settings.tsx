"use client";
import { useState } from "react";
import { accountNames } from "@/lib/accounting";
export default function TaxSettings({
  profile,
  busy,
  send,
}: {
  profile?: { ready: boolean; treatment: "UNKNOWN" | "AFFECTED" | "EXEMPT" };
  busy: boolean;
  send: (body: Record<string, unknown>) => Promise<boolean | undefined>;
}) {
  const [treatment, setTreatment] = useState(profile?.treatment ?? "UNKNOWN"),
    [confirmed, setConfirmed] = useState(false);
  return (
    <section className="card max-w-3xl">
      <h2 className="text-xl font-semibold">
        Situación tributaria de la barbería
      </h2>
      <p className="muted text-sm my-5">
        Elige la clasificación real del negocio. Trabajar solo no determina por
        sí mismo el tratamiento del IVA. Si todavía no la conoces, deja “Sin
        definir”.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await send({ action: "tax_profile", treatment, confirmed: true }))
            setConfirmed(false);
        }}
        className="space-y-4"
      >
        <label>
          Tratamiento de IVA
          <select
            value={treatment}
            onChange={(e) => {
              setTreatment(e.target.value as typeof treatment);
              setConfirmed(false);
            }}
          >
            <option value="UNKNOWN">
              Sin definir · no separar IVA automáticamente
            </option>
            <option value="AFFECTED">Empresa afecta a IVA</option>
            <option value="EXEMPT">Actividad exenta / no afecta a IVA</option>
          </select>
        </label>
        <p className="muted text-sm">
          Los cambios se aplican a ventas nuevas y no modifican asientos
          anteriores. En modo afecto, los precios cobrados incluyen IVA al 19%.
          Las compras necesitan una factura revisada para reconocer crédito
          fiscal.
        </p>
        <label className="flex gap-2 items-start">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />{" "}
          Confirmé esta clasificación en los antecedentes tributarios de mi
          negocio.
        </label>
        <button
          className="primary"
          disabled={busy || !confirmed || !profile?.ready}
        >
          Guardar tratamiento de IVA
        </button>
      </form>
      <a
        href="https://www.sii.cl/"
        target="_blank"
        rel="noreferrer"
        className="block underline text-sm mt-5"
      >
        Consultar antecedentes en el SII
      </a>
      <details className="mt-8">
        <summary className="cursor-pointer font-semibold">
          Plan de cuentas · detalle opcional
        </summary>
        <p className="muted text-sm my-3">
          La aplicación elige las cuentas al registrar cada operación. No
          necesitas completarlas a mano.
        </p>
        {Object.entries(accountNames).map(([id, name]) => (
          <p key={id} className="border-b py-3 text-sm">
            {name}
          </p>
        ))}
      </details>
    </section>
  );
}
