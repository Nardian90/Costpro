"use client";

/**
 * MISIÓN COSTPRO-SALES-MODAL-INPUT-AND-TRANSFER-VALIDATION-001 (FASE 2/3).
 *
 * Campos de IDENTIDAD DEL PAGADOR para ventas que incluyen transferencia:
 *   1. Nombre y apellidos
 *   2. Carné de identidad
 *   3. Teléfono
 *
 * (El 4.º dato obligatorio, el N.º de transferencia, vive POR FILA de pago en
 * PaymentRowsEditor / pestaña «Datos de transferencia» — una referencia por
 * operación bancaria, nunca global.)
 *
 * UNA sola implementación compartida por los dos modos de venta (FASE 3 —
 * misma conducta garantizada):
 *   · Cajero Express → pestaña «Datos de transferencia» del modal Confirmar.
 *   · Modo Carrito  → sección «Datos de transferencia» del modal Confirmar.
 *
 * Fuente única de verdad: cart store (customerName / customerCi /
 * customerPhone + setters). Escribir en un modo queda visible para el otro y
 * los datos SE CONSERVAN ante errores de validación (viven en el store, el
 * modal no se cierra por validación fallida).
 *
 * Accesibilidad: <label htmlFor>, aria-required, mensajes de validación junto
 * al campo correspondiente (aria-describedby + role="alert" cuando está
 * vacío/solo espacios). Los espacios como único contenido cuentan como vacío.
 */
import { useCartStore } from "@/store/cart";
import { cn } from "@/lib/utils";

const FIELD_HINT = "Requerido para el pago por transferencia";

export function TransferIdentityFields({ idPrefix }: { idPrefix: string }) {
  const customerName = useCartStore((s) => s.customerName);
  const customerCi = useCartStore((s) => s.customerCi);
  const customerPhone = useCartStore((s) => s.customerPhone);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const setCustomerCi = useCartStore((s) => s.setCustomerCi);
  const setCustomerPhone = useCartStore((s) => s.setCustomerPhone);

  const nameValue = customerName || "";
  const ciValue = customerCi || "";
  const phoneValue = customerPhone || "";
  const nameMissing = !nameValue.trim();
  const ciMissing = !ciValue.trim();
  const phoneMissing = !phoneValue.trim();

  return (
    <div className="space-y-2" data-testid="transfer-identity-fields">
      {/* 1 · Nombre y apellidos */}
      <div>
        <label
          htmlFor={`${idPrefix}-name`}
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          Nombre y apellidos del pagador <span className="text-destructive">*</span>
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={nameValue}
          onChange={(e) => setCustomer(null, e.target.value || null)}
          maxLength={200}
          autoComplete="off"
          className={cn(
            "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-primary/20",
            nameMissing ? "border-amber-500/60" : "border-border focus:border-primary",
          )}
          aria-label="Nombre y apellidos del pagador (requerido con transferencia)"
          aria-required="true"
          aria-invalid={nameMissing}
          aria-describedby={nameMissing ? `${idPrefix}-name-error` : undefined}
          data-testid={`${idPrefix}-name`}
        />
        {nameMissing && (
          <p
            id={`${idPrefix}-name-error`}
            role="alert"
            className="text-[9px] text-amber-500 mt-0.5"
          >
            {FIELD_HINT}
          </p>
        )}
      </div>

      {/* 2 · Carné de identidad */}
      <div>
        <label
          htmlFor={`${idPrefix}-ci`}
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          Carné de identidad <span className="text-destructive">*</span>
        </label>
        <input
          id={`${idPrefix}-ci`}
          type="text"
          value={ciValue}
          onChange={(e) => setCustomerCi(e.target.value || null)}
          maxLength={20}
          autoComplete="off"
          className={cn(
            "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary/20",
            ciMissing ? "border-amber-500/60" : "border-border focus:border-primary",
          )}
          aria-label="Carné de identidad del pagador (requerido con transferencia)"
          aria-required="true"
          aria-invalid={ciMissing}
          aria-describedby={ciMissing ? `${idPrefix}-ci-error` : undefined}
          data-testid={`${idPrefix}-ci`}
        />
        {/* COSTPRO no define una regla canónica de CI (decisión documentada en
            el diagnóstico de per-item-payments): pista de formato 11 dígitos
            sin bloquear identidades con letras. */}
        {!ciMissing && !/^\d{11}$/.test(ciValue) && (
          <p className="text-[9px] text-amber-500 mt-0.5">
            Formato habitual: 11 dígitos (se aceptan CI con letras).
          </p>
        )}
        {ciMissing && (
          <p
            id={`${idPrefix}-ci-error`}
            role="alert"
            className="text-[9px] text-amber-500 mt-0.5"
          >
            {FIELD_HINT}
          </p>
        )}
      </div>

      {/* 3 · Teléfono */}
      <div>
        <label
          htmlFor={`${idPrefix}-phone`}
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          Teléfono <span className="text-destructive">*</span>
        </label>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          inputMode="tel"
          value={phoneValue}
          onChange={(e) => setCustomerPhone(e.target.value || null)}
          maxLength={20}
          autoComplete="off"
          className={cn(
            "w-full mt-1 rounded-xl border bg-background px-3 py-2.5 text-sm font-bold font-mono focus:outline-none focus:ring-2 focus:ring-primary/20",
            phoneMissing ? "border-amber-500/60" : "border-border focus:border-primary",
          )}
          aria-label="Teléfono del pagador (requerido con transferencia)"
          aria-required="true"
          aria-invalid={phoneMissing}
          aria-describedby={phoneMissing ? `${idPrefix}-phone-error` : undefined}
          data-testid={`${idPrefix}-phone`}
        />
        {phoneMissing && (
          <p
            id={`${idPrefix}-phone-error`}
            role="alert"
            className="text-[9px] text-amber-500 mt-0.5"
          >
            {FIELD_HINT}
          </p>
        )}
      </div>
    </div>
  );
}
