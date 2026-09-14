import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from './supabase-paginate.ts';

// Simula PostgREST: sirve `total` filas en paginas de 1000 y responde 416 (PGRST103)
// cuando el inicio del rango cae despues de la ultima fila.
function fakePostgrest(total: number) {
  return (from: number, to: number) => {
    if (from > 0 && from >= total) {
      return Promise.resolve({ data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } });
    }
    const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ n: from + i }));
    return Promise.resolve({ data: rows as { n: number }[], error: null });
  };
}

test('trae todas las filas cuando el total NO es multiplo de 1000', async () => {
  const { data, error } = await fetchAllRows(fakePostgrest(1500));
  assert.equal(error, null);
  assert.equal(data?.length, 1500);
});

test('total multiplo exacto de 1000: el 416 de la pagina siguiente no es error', async () => {
  for (const total of [1000, 2000, 3000]) {
    const { data, error } = await fetchAllRows(fakePostgrest(total));
    assert.equal(error, null, `total=${total}`);
    assert.equal(data?.length, total, `total=${total}`);
  }
});

test('sin filas: devuelve lista vacia sin error', async () => {
  const { data, error } = await fetchAllRows(fakePostgrest(0));
  assert.equal(error, null);
  assert.deepEqual(data, []);
});

test('un error real (no 416) se propaga', async () => {
  const { data, error } = await fetchAllRows(() =>
    Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'boom' } }),
  );
  assert.equal(data, null);
  assert.equal(error?.message, 'boom');
});

test('416 en la primera pagina (from=0) SI se propaga (no deberia pasar, pero por las dudas)', async () => {
  const { error } = await fetchAllRows(() =>
    Promise.resolve({ data: null, error: { code: 'PGRST103', message: 'Requested range not satisfiable' } }),
  );
  assert.equal(error?.code, 'PGRST103');
});

// Simula PostgREST con count:'exact': cada pagina trae el total exacto, asi el paginador puede
// pedir el resto de las paginas en paralelo en vez de una por una.
function fakePostgrestConCount(total: number) {
  let llamadas = 0;
  return {
    query: (from: number, to: number) => {
      llamadas++;
      const rows = Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({ n: from + i }));
      return Promise.resolve({ data: rows as { n: number }[], error: null, count: total });
    },
    get llamadas() { return llamadas; },
  };
}

test('con count:exact trae todas las filas de un total que abarca varias paginas', async () => {
  const fake = fakePostgrestConCount(2500);
  const { data, error } = await fetchAllRows(fake.query);
  assert.equal(error, null);
  assert.equal(data?.length, 2500);
  assert.equal(fake.llamadas, 3); // 1000 + 1000 + 500, sin llamadas extra
});

test('con count:exact y total que cabe en 1 pagina no pide paginas de mas', async () => {
  const fake = fakePostgrestConCount(400);
  const { data, error } = await fetchAllRows(fake.query);
  assert.equal(error, null);
  assert.equal(data?.length, 400);
  assert.equal(fake.llamadas, 1);
});
