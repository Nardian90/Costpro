export function numeroALetras(num: number): string {
  const UNIDADES = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const DECENAS = ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const DECENAS_MAYORES = ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function leerTresDigitos(n: number): string {
    if (n === 100) return 'cien';
    let res = '';
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (c > 0) res += CENTENAS[c] + ' ';
    if (d === 1) {
      res += DECENAS[u];
    } else {
      if (d > 1) {
        res += DECENAS_MAYORES[d];
        if (u > 0) res += ' y ';
      }
      if (u > 0) res += UNIDADES[u];
    }
    return res.trim();
  }

  if (num === 0) return 'cero';

  const entero = Math.floor(num);
  const decimales = Math.round((num - entero) * 100);

  let resultado = '';

  if (entero >= 1000000) {
    const millones = Math.floor(entero / 1000000);
    resultado += (millones === 1 ? 'un millón ' : leerTresDigitos(millones) + ' millones ');
  }

  const restoMillones = entero % 1000000;
  if (restoMillones >= 1000) {
    const miles = Math.floor(restoMillones / 1000);
    resultado += (miles === 1 ? 'mil ' : leerTresDigitos(miles) + ' mil ');
  }

  const restoMiles = restoMillones % 1000;
  if (restoMiles > 0) {
    resultado += leerTresDigitos(restoMiles);
  }

  resultado = resultado.trim();
  const centavos = decimales < 10 ? '0' + decimales : decimales;

  return `${resultado.toUpperCase()} CON ${centavos}/100`;
}
