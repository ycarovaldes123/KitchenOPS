// Responsables visibles en los modulos de ingreso (Produccion, Mermas, Colacion).
// Se compara por nombre completo normalizado (mayusculas, sin tildes).
export const RESPONSABLES_INGRESO = [
  'CAMILO PARADA',
  'PAULINA TRONCOSO',
  'PAMELA COLIHUINCA',
  'TANLLA HERRERA',
  'JOAQUIN VELASQUEZ',
  'JOEL MENDEZ',
  'JAVIERA SEPULVEDA',
  'LUISA FLANDEZ',
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
const PERMITIDOS = new Set(RESPONSABLES_INGRESO.map(normalizar));

export function filtrarResponsablesIngreso<T extends { nombre: string }>(lista: T[] | undefined): T[] {
  return (lista ?? []).filter(r => PERMITIDOS.has(normalizar(r.nombre)));
}
