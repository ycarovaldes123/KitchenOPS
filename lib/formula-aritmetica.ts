// Evalua formulas aritmeticas simples (sin referencias a celdas) para el caso en que el
// Excel se guarda sin el resultado cacheado, p.ej. el usuario escribe "=8000+1300" para
// sumar conteos parciales. Solo digitos, ".", "()" y + - * / : nunca codigo arbitrario.
export function evaluarFormulaAritmetica(formula: string): number | null {
  const expr = String(formula ?? '').replace(/\s+/g, '');
  if (!expr || !/^[0-9+\-*/().]+$/.test(expr)) return null;

  let pos = 0;

  function parseExpr(): number {
    let value = parseTerm();
    while (expr[pos] === '+' || expr[pos] === '-') {
      const op = expr[pos++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (expr[pos] === '*' || expr[pos] === '/') {
      const op = expr[pos++];
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    if (expr[pos] === '-') { pos++; return -parseFactor(); }
    if (expr[pos] === '(') {
      pos++;
      const value = parseExpr();
      if (expr[pos] !== ')') throw new Error('paren');
      pos++;
      return value;
    }
    const start = pos;
    while (pos < expr.length && /[0-9.]/.test(expr[pos])) pos++;
    if (pos === start) throw new Error('number');
    return Number(expr.slice(start, pos));
  }

  try {
    const value = parseExpr();
    if (pos !== expr.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}
