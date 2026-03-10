export interface AsientoLinea {
  Codigo: string;
  Descrip: string;
  Parcial: string;
  Debe: string;
  Haber: string;
}

export interface Asiento {
  id: string;
  titulo: string;
  lineas: AsientoLinea[];
  descripcion?: string;
  ejemplo?: string;
  notas?: string;
}

export interface AsientosData {
  asientos: Record<string, Asiento>;
}

export interface CuentaSubcuenta {
  codigo: string;
  nombre: string;
  naturaleza: string;
  descripcion: string;
}

export interface Cuenta {
  codigo: string;
  nombre: string;
  naturaleza: string;
  descripcion: string;
  subcuentas: CuentaSubcuenta[];
}

export interface CuentasData {
  cuentas: Cuenta[];
}

export type ClasificadorNode = string[] | Record<string, any>;

export interface ClasificadorData {
  cuentas: {
    ACTIVO: Record<string, any>;
    PASIVO: Record<string, any>;
    PATRIMONIO: Record<string, any>;
    INGRESOS: Record<string, any>;
    GASTOS: Record<string, any>;
  };
}

export type WikiModule = 'asientos' | 'cuentas' | 'clasificador';

export interface WikiState {
  activeModule: WikiModule;
  selectedId: string | null;
  history: { module: WikiModule; id: string | null }[];
}
