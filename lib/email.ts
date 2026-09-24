// Envío de correo (solo servidor). Proveedor según variables de .env.local:
//   GMAIL_USER + GMAIL_APP_PASSWORD → Gmail (SMTP con contraseña de aplicación)
//   si no, RESEND_API_KEY           → Resend (remitente de pruebas onboarding@resend.dev)
//
// PILOTO: todo correo se envía únicamente a DESTINATARIO_PILOTO, sin importar el destino pedido.
// Usar solo desde rutas de servidor (app/api/...): lee credenciales de process.env.
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { DESTINATARIO_PILOTO } from '@/lib/alertas/resumen';

export { DESTINATARIO_PILOTO };

export interface Correo {
  asunto: string;
  html: string;
  texto: string;
}

export type Proveedor = 'gmail' | 'resend';

export function proveedorConfigurado(): Proveedor | null {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return 'gmail';
  if (process.env.RESEND_API_KEY) return 'resend';
  return null;
}

export async function enviarCorreo(correo: Correo): Promise<{ proveedor: Proveedor; destinatario: string; id?: string }> {
  const proveedor = proveedorConfigurado();
  if (!proveedor) throw new Error('No hay proveedor de correo configurado: agrega GMAIL_USER y GMAIL_APP_PASSWORD en .env.local');
  const destinatario = DESTINATARIO_PILOTO;

  if (proveedor === 'gmail') {
    const transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, '') },
    });
    const info = await transporte.sendMail({
      from: `KitchenOps · Alertas <${process.env.GMAIL_USER}>`,
      to: destinatario,
      subject: correo.asunto,
      html: correo.html,
      text: correo.texto,
    });
    return { proveedor, destinatario, id: info.messageId };
  }

  const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: 'KitchenOps · Alertas <onboarding@resend.dev>',
    to: destinatario,
    subject: correo.asunto,
    html: correo.html,
    text: correo.texto,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return { proveedor, destinatario, id: data?.id };
}
