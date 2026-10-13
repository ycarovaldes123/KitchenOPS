import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertirUnidad, esPP, estadoHomologacion, explotarPP, lineasConsumo } from './defontana-consumo.ts';

// Receta real de BLUE SALAD ENSALADA (K17015), resumida.
const blueSalad = [
  { codigo_producto: '0401005', nombre: 'LECHUGA HIDROPONICAS (UND)', cantidad: 0.04, unidad_medida: 'UN' },
  { codigo_producto: '0401063', nombre: 'MIX VERDES (GRS)', cantidad: 40, unidad_medida: 'GR' },
  { codigo_producto: '0304002', nombre: 'TOCINO (KGS)', cantidad: 0.05, unidad_medida: 'KG' },
  { codigo_producto: '0502286', nombre: 'PP. SALSA QUESO AZUL (CC)', cantidad: 20, unidad_medida: 'CC' },
];
const defontana = new Map([['0401005', 'D1'], ['0401063', 'D2'], ['0304002', 'D3'], ['0502286', 'D4']]);

test('10 ventas multiplican la receta y separan PP de productos directos', () => {
  const lineas = lineasConsumo(blueSalad, 10, defontana);
  assert.deepEqual(lineas.map(l => [l.nombre.split(' ')[0], l.tipo, l.total]), [
    ['LECHUGA', 'directo', 0.4],
    ['MIX', 'directo', 400],
    ['TOCINO', 'directo', 0.5],
    ['PP.', 'pp', 200],
  ]);
  assert.equal(lineas[3].codigo_defontana, 'D4');
});

test('esPP reconoce codigo 0502, pp_id o codigo con receta PP', () => {
  assert.equal(esPP({ codigo_producto: '0502286' }), true);
  assert.equal(esPP({ codigo_producto: '0401018' }), false);
  assert.equal(esPP({ codigo_producto: '0401018', pp_id: 'x' }), true);
  assert.equal(esPP({ codigo_producto: '9999' }, new Set(['9999'])), true);
});

test('estado de homologacion', () => {
  assert.equal(estadoHomologacion('K17015', blueSalad, defontana), 'vinculado');
  assert.equal(estadoHomologacion('', blueSalad, defontana), 'sin_codigo');
  assert.equal(estadoHomologacion('K17015', [], defontana), 'incompleto');
  assert.equal(estadoHomologacion('K17015', [{ ...blueSalad[0], codigo_producto: null }], defontana), 'incompleto');
  assert.equal(estadoHomologacion('K17015', blueSalad, new Map([['0401005', 'D1']])), 'pendiente');
  assert.equal(estadoHomologacion('K17015', blueSalad, defontana, true), 'pendiente');
});

test('convertirUnidad solo entre magnitudes compatibles', () => {
  assert.equal(convertirUnidad(200, 'CC', 'LT'), 0.2);
  assert.equal(convertirUnidad(0.5, 'KG', 'GR'), 500);
  assert.equal(convertirUnidad(3, 'UND', 'UN'), 3);
  assert.equal(convertirUnidad(3, 'UN', 'GR'), null);
});

test('explotarPP reparte el consumo segun el rendimiento de la receta PP', () => {
  const receta = {
    codigo_pp: '0502286', nombre: 'SALSA QUESO AZUL', rendimiento: 1, unidad_rendimiento: 'LT',
    ingredientes: [
      { codigo_ingrediente: '0201001', nombre_ingrediente: 'QUESO AZUL', cantidad: 0.3, unidad_medida: 'KG' },
      { codigo_ingrediente: '0201002', nombre_ingrediente: 'CREMA', cantidad: 0.8, unidad_medida: 'LT' },
    ],
  };
  const mp = explotarPP(200, 'CC', receta, new Map([['0201001', 'Q1']]));
  assert.deepEqual(mp?.map(m => [m.nombre, m.total, m.codigo_defontana]), [
    ['QUESO AZUL', 0.06, 'Q1'],
    ['CREMA', 0.16, null],
  ]);
  assert.equal(explotarPP(2, 'UN', receta, new Map()), null);
});
