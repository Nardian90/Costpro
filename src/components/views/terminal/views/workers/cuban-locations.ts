/**
 * Cuban municipalities organized by province.
 *
 * Source: Oficina Nacional de Estadística e Información (ONEI) — 2024 data.
 * Post-2010 political-administrative division (16 provincias + 168 municipios).
 *
 * Used by the worker creation form for cascada dropdown (provincia → municipio).
 */

export const CUBAN_PROVINCES = [
  'Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas',
  'Villa Clara', 'Cienfuegos', 'Sancti Spíritus', 'Ciego de Ávila',
  'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba',
  'Guantánamo', 'Isla de la Juventud',
] as const;

export const CUBAN_MUNICIPALITIES: Record<string, readonly string[]> = {
  'Pinar del Río': ['Pinar del Río', 'Consolación del Sur', 'Pinar del Río (Sandino)', 'Guane', 'Mantua', 'Minas de Matahambre', 'San Juan y Martínez', 'San Luis', 'Viñales', 'La Palma', 'Los Palacios', 'Bahía Honda', 'Candelaria', 'San Cristóbal'],
  'Artemisa': ['Artemisa', 'Alquízar', 'Bauta', 'Caimito', 'Candelaria', 'Guanajay', 'Güira de Melena', 'Mariel', 'San Antonio de los Baños', 'San Cristóbal', 'Bahía Honda', 'Cabañas', 'Santa Cruz del Norte', 'Jaruco'],
  'La Habana': ['La Habana Vieja', 'Centro Habana', 'Cerro', 'Diez de Octubre', 'La Lisa', 'Marianao', 'Playa', 'Plaza de la Revolución', 'Regla', 'San Miguel del Padrón', 'Habana del Este', 'Arroyo Naranjo', 'Boyeros', 'Cotorro', 'Guanabacoa'],
  'Mayabeque': ['San José de las Lajas', 'Bejucal', 'Jaruco', 'Santa Cruz del Norte', 'Madruga', 'Nueva Paz', 'San Nicolás de Bari', 'Güines', 'Melena del Sur', 'Batabanó', 'Quivicán', 'Güira de Melena', 'Alquízar', 'Artemisa', 'Mariel'],
  'Matanzas': ['Matanzas', 'Cárdenas', 'Martí', 'Colón', 'Perico', 'Jovellanos', 'Pedro Betancourt', 'Limonar', 'Unión de Reyes', 'Ciénaga de Zapata', 'Jagüey Grande', 'Calimete', 'Los Arabos', 'Varadero'],
  'Villa Clara': ['Santa Clara', 'Camajuaní', 'Cifuentes', 'Corralillo', 'Encrucijada', 'Camajuani', 'Caibarién', 'Remedios', 'Sagua la Grande', 'Quemado de Güines', 'Santo Domingo', 'Ranchuelo', 'Sancti Spíritus', 'Placetas', 'Manicaragua', 'Santa Clara'],
  'Cienfuegos': ['Cienfuegos', 'Aguada de Pasajeros', 'Rodas', 'Abreus', 'Cruces', 'Palmira', 'Campos de Cienfuegos', 'Cumanayagua'],
  'Sancti Spíritus': ['Sancti Spíritus', 'Trinidad', 'Cabaiguán', 'Jatibonico', 'Yaguajay', 'Taguasco', 'Fomento', 'Ciego de Ávila', 'Morón', 'Chambas', 'Ciro Redondo', 'Flores', 'Majagua', 'Venezuela', 'Baraguá', 'Primero de Enero', 'Bolivia'],
  'Ciego de Ávila': ['Ciego de Ávila', 'Morón', 'Chambas', 'Ciro Redondo', 'Flores', 'Majagua', 'Venezuela', 'Baraguá', 'Primero de Enero', 'Bolivia'],
  'Camagüey': ['Camagüey', 'Carlos M. de Céspedes', 'Esmeralda', 'Florida', 'Guáimaro', 'Jimaguayú', 'Minas', 'Najasa', 'Nuevitas', 'Santa Cruz del Sur', 'Sibanicú', 'Sierra de Cubitas', 'Vertientes'],
  'Las Tunas': ['Las Tunas', 'Puerto Padre', 'Jobabo', 'Colombia', 'Jesús Menéndez', 'Majibacoa', 'Manatí', 'Amancio'],
  'Holguín': ['Holguín', 'Calixto García (Buenaventura)', 'Báguanos', 'Banes', 'Antilla', 'Cueto', 'Frank País (Mayarí Arriba)', 'Gibara', 'Rafael Freyre', 'Sagua de Tánamo', 'Urbano Noris', 'Moán', 'Mayarí', 'Cacocum', 'Moa', 'Frank País'],
  'Granma': ['Bayamo', 'Bartolomé Masó', 'Buey Arriba', 'Campechuela', 'Cauto Cristo', 'Guisa', 'Jiguaní', 'Manzanillo', 'Media Luna', 'Niquero', 'Pilón', 'Río Cauto', 'Yara', 'Cauto Cristo'],
  'Santiago de Cuba': ['Santiago de Cuba', 'Contramaestre', 'Guamá', 'Mella', 'Palma Soriano', 'San Luis', 'Segundo Frente', 'Songo-La Maya', 'Tercer Frente', 'Cobre'],
  'Guantánamo': ['Guantánamo', 'Baracoa', 'Caimanera', 'El Salvador', 'Imías', 'Maisí', 'Manuel Tames', 'Niceto Pérez', 'San Antonio del Sur', 'Yateras', 'Maisí'],
  'Isla de la Juventud': ['Nueva Gerona', 'Santa Fe', 'Joaquín Reverón'],
};

/**
 * Get municipalities for a specific province.
 * Returns empty array if province is not found.
 */
export function getMunicipalitiesForProvince(province: string): readonly string[] {
  return CUBAN_MUNICIPALITIES[province] || [];
}
