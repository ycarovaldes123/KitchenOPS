import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverArrastreInicial, type InvSnapshotRow } from './carnicos-inventario-inicial.ts';

// Helpers de legibilidad
const F = (fecha: string, cantidad: number): InvSnapshotRow => ({ fecha, tipo: 'FINAL', cantidad });
const I = (fecha: string, cantidad: number): InvSnapshotRow => ({ fecha, tipo: 'INICIAL', cantidad });

// Nota: cuando existe INICIAL manual EN la fecha consultada, el llamador
// (calcularResumenFilas) usa ese valor y ni siquiera invoca resolverArrastreInicial.
// Estas pruebas cubren solo la decision de arrastre para fechas SIN inicial manual.

test('CASO B — cambio de mes SIN inicial manual: el FINAL del 31/08 no se arrastra al 01/09', () => {
  const rows = [F('2026-08-31', 15.54)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-01'), null); // -> el llamador lo toma como 0
});

test('CASO C — dentro del mes: FINAL 01/09 se arrastra como inicial del 02/09', () => {
  const rows = [I('2026-09-01', 19.9), F('2026-09-01', 18.2)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 18.2);
});

test('CASO E — dentro del mes tras carga manual a mitad de mes: FINAL 15/09 -> inicial 16/09', () => {
  const rows = [F('2026-09-14', 20), I('2026-09-15', 30), F('2026-09-15', 27)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-16'), 27);
});

test('CASO F — cambio de mes SIN inicial manual: el FINAL del 30/09 no se arrastra al 01/10', () => {
  const rows = [F('2026-09-30', 25)];
  assert.equal(resolverArrastreInicial(rows, '2026-10-01'), null);
});

test('cadena de dias dentro del mismo mes toma el FINAL del ultimo dia anterior', () => {
  const rows = [
    F('2026-09-01', 18.2),
    F('2026-09-02', 17.1),
    F('2026-09-03', 16.4),
  ];
  assert.equal(resolverArrastreInicial(rows, '2026-09-04'), 16.4);
});

test('nunca arrastra entre meses aunque haya FINAL del mes anterior mas "reciente" que los del mes en curso', () => {
  // FINAL 31/08 existe; en septiembre aun no hay ningun FINAL. Al consultar 05/09 -> 0.
  const rows = [F('2026-08-28', 10), F('2026-08-31', 15.54)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-05'), null);
});

test('nunca arrastra entre años (dic -> ene)', () => {
  const rows = [F('2026-12-31', 40)];
  assert.equal(resolverArrastreInicial(rows, '2027-01-01'), null);
});

test('ignora los FINAL con fecha igual o posterior a la consultada', () => {
  const rows = [F('2026-09-01', 10), F('2026-09-02', 99), F('2026-09-03', 123)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 10);
});

test('suma las cantidades de la misma fecha en varias bodegas', () => {
  const rows = [F('2026-09-01', 4), F('2026-09-01', 3.5), F('2026-09-01', 1)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 8.5);
});

test('producto sin FINAL en el mes en curso: no arrastra nada', () => {
  assert.equal(resolverArrastreInicial([], '2026-09-10'), null);
  assert.equal(resolverArrastreInicial([I('2026-09-01', 5)], '2026-09-10'), null);
});

test('producto sin conteo el dia inmediatamente anterior: arrastra el ultimo FINAL del mes', () => {
  const rows = [F('2026-09-02', 7.7)]; // no hay FINAL 03..07
  assert.equal(resolverArrastreInicial(rows, '2026-09-08'), 7.7);
});

test('los INICIAL manuales previos dentro del mes no cambian el arrastre (solo manda el del dia consultado)', () => {
  // INICIAL manual 05/09 = 30 pero hay FINAL 06/09 = 22 -> al consultar 07/09 se arrastra 22.
  const rows = [I('2026-09-05', 30), F('2026-09-05', 28), F('2026-09-06', 22)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-07'), 22);
});
