// Ficha de plato en PDF (foto + datos + ingredientes). Se genera en el navegador.
import { formatCantidad } from '@/lib/costo-receta-pp';
import { formatCLP } from '@/lib/calculos';

export interface FichaIngrediente {
  codigo_producto: string | null;
  nombre: string | null;
  cantidad: number;
  unidad_medida: string | null;
  precio_unitario: number | null;
  costo_total: number | null;
}

export interface FichaPlato {
  nombre: string;
  categoria: string;
  carta: string;
  cod_softland: string | null;
  codigo_toteat: string | null;
  foto_url: string | null;
  ingredientes: FichaIngrediente[];
  costo_neto: number;
}

interface FotoCargada { dataUrl: string; w: number; h: number }

/** Descarga la foto y la pasa a JPEG (jsPDF no lee webp). Devuelve null si falla (CORS, 404, etc.). */
async function cargarFoto(url: string): Promise<FotoCargada | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.88), w: bmp.width, h: bmp.height };
  } catch {
    return null;
  }
}

/** Costo unitario: con 2 decimales si es menor a $100 (ej. $6,34 por gramo), para que cuadre con el total de la línea. */
function formatUnitario(v: number | null): string {
  if (v == null) return '—';
  if (v >= 100) return formatCLP(v);
  return `$${v.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function nombreArchivo(nombre: string) {
  // "<Nombre del plato> - PLATO.pdf": conserva tildes y ñ, quita solo caracteres no válidos en Windows.
  const base = nombre.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return `${base || 'Plato'} - PLATO.pdf`;
}

export async function descargarFichaPlatoPdf(plato: FichaPlato): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const foto = plato.foto_url ? await cargarFoto(plato.foto_url) : null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 14;
  const util = ancho - margen * 2;
  let y = margen;

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`FICHA DE PLATO · ${plato.carta.toUpperCase()}`, margen, y + 3);
  y += 9;
  doc.setFontSize(20);
  doc.setTextColor(30);
  const titulo = doc.splitTextToSize(plato.nombre, util) as string[];
  doc.text(titulo, margen, y + 6);
  y += titulo.length * 8 + 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90);
  const meta = [
    plato.categoria,
    plato.cod_softland ? `Código ${plato.cod_softland}` : '',
    plato.codigo_toteat ? `Toteat ${plato.codigo_toteat}` : '',
  ].filter(Boolean).join('  ·  ');
  doc.text(meta, margen, y + 3);
  y += 9;

  // Foto (centrada, proporción original, máx. 120 mm de alto)
  const maxW = util;
  const maxH = 120;
  if (foto) {
    const esc = Math.min(maxW / foto.w, maxH / foto.h);
    const w = foto.w * esc;
    const h = foto.h * esc;
    doc.addImage(foto.dataUrl, 'JPEG', margen + (util - w) / 2, y, w, h);
    y += h + 8;
  } else {
    doc.setDrawColor(210);
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margen, y, util, 30, 2, 2, 'FD');
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Sin foto', ancho / 2, y + 16, { align: 'center' });
    y += 38;
  }

  // Ingredientes
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(`Ingredientes (${plato.ingredientes.length})`, margen, y + 3);
  y += 6;

  if (plato.ingredientes.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text('Sin ingredientes cargados.', margen, y + 4);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margen, right: margen, bottom: 14 },
      head: [['Código', 'Ingrediente', 'Cantidad', 'Costo unit.', 'Costo total']],
      body: plato.ingredientes.map(i => [
        i.codigo_producto ?? '—',
        i.nombre ?? '—',
        `${formatCantidad(i.cantidad)} ${i.unidad_medida ?? ''}`.trim(),
        formatUnitario(i.precio_unitario),
        i.costo_total != null ? formatCLP(i.costo_total) : '—',
      ]),
      foot: [[{ content: 'COSTO NETO TOTAL', colSpan: 4, styles: { halign: 'right' } }, { content: formatCLP(plato.costo_neto), styles: { halign: 'right' } }]],
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 2.2, textColor: 40 },
      footStyles: { fillColor: [245, 235, 220], textColor: 30, fontStyle: 'bold', fontSize: 11 },
      headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 248, 244] },
      columnStyles: { 0: { cellWidth: 24 }, 2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 28 }, 4: { halign: 'right', cellWidth: 28 } },
      didParseCell: data => { if (data.section === 'head' && data.column.index >= 2) data.cell.styles.halign = 'right'; },
    });
  }

  // Pie con numeración
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    const alto = doc.internal.pageSize.getHeight();
    doc.text(`KitchenOPS · ${new Date().toLocaleDateString('es-CL')}`, margen, alto - 7);
    doc.text(`${p} / ${paginas}`, ancho - margen, alto - 7, { align: 'right' });
  }

  doc.save(nombreArchivo(plato.nombre));
}
