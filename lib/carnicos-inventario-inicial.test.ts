import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverArrastreInicial, type InvSnapshotRow } from './carnicos-inventario-inicial.ts';

// Helpers de legibilidad
const F = (fecha: string, cantidad: number): InvSnapshotRow => ({ fecha, tipo: 'FINAL', cantidad });
const I = (fecha: string, cantidad: number): InvSnapshotRow => ({ fecha, tipo: 'INICIAL', cantidad });

test('cambio de dia dentro del mismo mes: arrastra el FINAL del dia anterior', () => {
  const rows = [I('2026-09-01', 19.9), F('2026-09-01', 18.2)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 18.2);
});

test('cadena de dias dentro del mes sin carga manual', () => {
  const rows = [
    I('2026-09-01', 19.9),
    F('2026-09-01', 18.2),
    F('2026-09-02', 17.1),
    F('2026-09-03', 16.4),
  ];
  assert.equal(resolverArrastreInicial(rows, '2026-09-04'), 16.4);
});

test('cambio de mes CON inventario inicial manual: no arrastra el FINAL del 31/08', () => {
  // El 01/09 tiene INICIAL manual -> ese caso lo resuelve el llamador antes de pedir arrastre.
  // Aca se prueba el 02/09: el ultimo INICIAL manual (01/09) es posterior al ultimo FINAL (31/08),
  // por lo que el ciclo se reinicio y NO se arrastra 15,54.
  const rows = [F('2026-08-31', 15.54), I('2026-09-01', 19.9)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), null);
});

test('cambio de mes CON inicial manual y luego FINAL del 01/09: el 02/09 arrastra 18,20 (no 15,54)', () => {
  const rows = [F('2026-08-31', 15.54), I('2026-09-01', 19.9), F('2026-09-01', 18.2)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 18.2);
});

test('cambio de mes SIN inventario inicial manual: continua el ciclo desde el FINAL del 31/08', () => {
  const rows = [F('2026-08-30', 12), F('2026-08-31', 15.54)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-01'), 15.54);
});

test('carga manual a mitad de mes corta el arrastre anterior', () => {
  // INICIAL manual el 15/09, mas reciente que el ultimo FINAL (14/09) -> no arrastra el 14/09.
  const rows = [F('2026-09-14', 9.0), I('2026-09-15', 25.0)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-16'), null);
});

test('carga manual a mitad de mes: los dias siguientes si arrastran el FINAL post-carga', () => {
  const rows = [F('2026-09-14', 9.0), I('2026-09-15', 25.0), F('2026-09-15', 23.5)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-16'), 23.5);
});

test('producto sin FINAL previo: no arrastra nada (queda en 0)', () => {
  assert.equal(resolverArrastreInicial([], '2026-09-02'), null);
  assert.equal(resolverArrastreInicial([I('2026-09-01', 5)], '2026-09-02'), null);
});

test('producto sin movimiento el dia anterior: arrastra su ultimo FINAL conocido', () => {
  const rows = [F('2026-09-01', 7.7)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-05'), 7.7);
});

test('suma las cantidades de la misma fecha en varias bodegas', () => {
  const rows = [F('2026-09-01', 4), F('2026-09-01', 3.5), F('2026-09-01', 1)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 8.5);
});

test('ignora conteos con fecha igual o posterior a la consultada', () => {
  const rows = [F('2026-09-01', 10), F('2026-09-02', 99), I('2026-09-05', 50)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-02'), 10);
});

test('INICIAL manual el mismo dia del ultimo FINAL: no corta el arrastre', () => {
  // ultimoInicial (01/09) == ultimoFinal (01/09) -> se arrastra el FINAL.
  const rows = [I('2026-09-01', 19.9), F('2026-09-01', 18.2)];
  assert.equal(resolverArrastreInicial(rows, '2026-09-03'), 18.2);
});
