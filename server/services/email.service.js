const nodemailer = require('nodemailer');

const APP_NAME = 'Poma - Projetos em Inteligência Agrícola';
const rawAppUrl = process.env.APP_URL
    || process.env.RENDER_EXTERNAL_URL
    || (process.env.NODE_ENV === 'production' ? 'https://projectbp.onrender.com' : 'http://localhost:3000');
const APP_URL   = rawAppUrl.replace(/\/+$/, '');

/**
 * Cria e retorna um transporter Nodemailer configurado via variáveis de ambiente.
 * Suporta qualquer provedor SMTP (Gmail, Outlook, Resend SMTP, etc.).
 *
 * Variáveis:
 *   SMTP_HOST   - ex: smtp.gmail.com
 *   SMTP_PORT   - ex: 587 (padrão)
 *   SMTP_SECURE - "true" para porta 465, caso contrário usa STARTTLS
 *   SMTP_USER   - endereço de e-mail remetente
 *   SMTP_PASS   - senha de app ou token
 */
function createTransporter() {
    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        return null;
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000
    });
}

/**
 * Envia e-mail usando API HTTP (Brevo ou Resend na porta 443 - imune a bloqueios SMTP do Render)
 * ou faz fallback para Nodemailer SMTP (Zoho / Gmail / etc.).
 */
async function dispatchEmail({ to, subject, html, fallbackPreviewUrl = null, contextLabel = 'E-mail' }) {
    const senderEmail = process.env.SMTP_USER || 'daniel.carvas@brancoperes.com.br';
    const fromHeader = process.env.EMAIL_FROM || `"${APP_NAME}" <${senderEmail}>`;

    // 1. Prioridade: Brevo HTTP API (porta 443 - funciona 100% no Render Free Tier)
    if (process.env.BREVO_API_KEY) {
        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: APP_NAME, email: senderEmail },
                    to: [{ email: to }],
                    subject,
                    htmlContent: html
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || `Brevo HTTP ${response.status}`);
            }
            console.log(`[Email Service - Brevo API] ${contextLabel} enviado para ${to}. MessageId: ${data.messageId}`);
            return { messageId: data.messageId };
        } catch (err) {
            console.error(`[Email Service Error - Brevo] Falha ao enviar para ${to}:`, err.message);
            return { error: err.message, preview: fallbackPreviewUrl };
        }
    }

    // 2. Prioridade: Resend HTTP API (porta 443 - funciona 100% no Render Free Tier)
    if (process.env.RESEND_API_KEY) {
        try {
            const response = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: fromHeader,
                    to: [to],
                    subject,
                    html
                })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || `Resend HTTP ${response.status}`);
            }
            console.log(`[Email Service - Resend API] ${contextLabel} enviado para ${to}. Id: ${data.id}`);
            return { messageId: data.id };
        } catch (err) {
            console.error(`[Email Service Error - Resend] Falha ao enviar para ${to}:`, err.message);
            return { error: err.message, preview: fallbackPreviewUrl };
        }
    }

    // 3. Fallback: Nodemailer SMTP (Zoho / Localhost)
    const transporter = createTransporter();
    if (!transporter) {
        console.log('\n========================================================');
        console.log(`[Email Service] Provedor de e-mail não configurado (${contextLabel}):`);
        console.log(`  Para: ${to}`);
        if (fallbackPreviewUrl) console.log(`  Link: ${fallbackPreviewUrl}`);
        console.log('========================================================\n');
        return { preview: fallbackPreviewUrl };
    }

    try {
        const info = await transporter.sendMail({
            from: fromHeader,
            to,
            subject,
            html
        });
        console.log(`[Email Service - SMTP] ${contextLabel} enviado para ${to}. MessageId: ${info.messageId}`);
        return { messageId: info.messageId };
    } catch (err) {
        console.error(`[Email Service Error] Falha ao enviar e-mail para ${to}:`, err.message);
        if (fallbackPreviewUrl) {
            console.log('\n========================================================');
            console.log(`[Email Service Fallback] Link gerado (${contextLabel}):`);
            console.log(`  Link: ${fallbackPreviewUrl}`);
            console.log('========================================================\n');
        }
        return { error: err.message, preview: fallbackPreviewUrl };
    }
}

/**
 * Envia o e-mail de recuperação de senha.
 */
async function sendPasswordResetEmail(toEmail, toName, token) {
    const resetUrl = `${APP_URL}/reset-password?token=${token}`;
    const html = buildResetEmailHtml(toName, resetUrl);
    return dispatchEmail({
        to: toEmail,
        subject: `[${APP_NAME}] Redefinição de Senha`,
        html,
        fallbackPreviewUrl: resetUrl,
        contextLabel: 'Redefinição de senha'
    });
}

/**
 * Envia o e-mail de confirmação / ativação de conta.
 */
async function sendAccountVerificationEmail(toEmail, toName, token) {
    const verifyUrl = `${APP_URL}/api/auth/verify-email?token=${token}`;
    const html = buildVerificationEmailHtml(toName, verifyUrl);
    return dispatchEmail({
        to: toEmail,
        subject: `[${APP_NAME}] Confirme seu endereço de e-mail para ativar sua conta`,
        html,
        fallbackPreviewUrl: verifyUrl,
        contextLabel: 'Confirmação de conta'
    });
}

/**
 * Envia o resumo executivo de um projeto compartilhado ou encaminhado via e-mail.
 */
async function sendProjectSummaryEmail(toEmail, recipientName, senderName, projectData, note = '') {
    const projectUrl = `${APP_URL}/#project-${projectData.id}`;
    const html = buildProjectSummaryEmailHtml(recipientName, senderName, projectData, projectUrl, note);
    return dispatchEmail({
        to: toEmail,
        subject: `[${APP_NAME}] Compartilhamento de Projeto: ${projectData.name}`,
        html,
        fallbackPreviewUrl: projectUrl,
        contextLabel: `Projeto (${projectData.name})`
    });
}

/**
 * Envia o e-mail de aviso periódico com o resumo de prazos (alertas diários).
 */
async function sendDailyDigestEmail(toEmail, recipientName, digestData) {
    const dashboardUrl = `${APP_URL}`;
    const html = buildDailyDigestEmailHtml(recipientName, digestData, dashboardUrl);
    const overdueCount = digestData.overdueActivities ? digestData.overdueActivities.length : 0;
    const upcomingCount = digestData.upcomingActivities ? digestData.upcomingActivities.length : 0;
    const totalAlerts = overdueCount + upcomingCount;

    return dispatchEmail({
        to: toEmail,
        subject: `[${APP_NAME}] Alerta Matinal: ${totalAlerts} etapa(s) requerem sua atenção`,
        html,
        fallbackPreviewUrl: dashboardUrl,
        contextLabel: 'Alerta diário'
    });
}

function buildResetEmailHtml(name, resetUrl) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinição de Senha - ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background:linear-gradient(135deg,#1e40af,#7c3aed);">
              <div style="display:inline-block;background:rgba(255,255,255,.15);border-radius:12px;padding:10px 14px;margin-bottom:12px;">
                <span style="font-size:24px;">🔐</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px;">Redefinição de senha</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Olá, <strong style="color:#e2e8f0;">${name}</strong></p>
              <p style="margin:0 0 24px;color:#cbd5e1;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta.
                Clique no botão abaixo para criar uma nova senha:
              </p>
              <div style="text-align:center;margin:0 0 28px;">
                <a href="${resetUrl}"
                   style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:.3px;">
                  Redefinir Minha Senha
                </a>
              </div>
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
                Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanecerá inalterada.
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;">
                ⏰ Este link expira em <strong>1 hora</strong>.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · Gestão Científica de Projetos
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildVerificationEmailHtml(name, verifyUrl) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmação de Conta - ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:540px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background:linear-gradient(135deg,#059669,#0284c7);">
              <div style="display:inline-block;background:rgba(255,255,255,.18);border-radius:12px;padding:12px 16px;margin-bottom:12px;">
                <span style="font-size:26px;">🌱</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Ativação de Conta de Usuário</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 10px;color:#94a3b8;font-size:14px;">Olá, <strong style="color:#f1f5f9;">${name}</strong></p>
              <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.6;">
                Obrigado por se registrar na plataforma <strong>${APP_NAME}</strong>.
                Para ativar sua conta e liberar o acesso completo ao gerenciamento agronômico, clique no botão abaixo para confirmar seu e-mail:
              </p>
              <div style="text-align:center;margin:28px 0;">
                <a href="${verifyUrl}"
                   style="display:inline-block;padding:14px 34px;background:linear-gradient(135deg,#10b981,#0284c7);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:.3px;box-shadow:0 4px 12px rgba(16,185,129,.25);">
                  ✅ Confirmar e Ativar Minha Conta
                </a>
              </div>
              <p style="margin:0 0 8px;color:#64748b;font-size:13px;line-height:1.6;">
                Caso o botão não funcione, você pode copiar e colar o link abaixo no seu navegador:
              </p>
              <p style="margin:0 0 20px;color:#38bdf8;font-size:12px;word-break:break-all;">
                ${verifyUrl}
              </p>
              <p style="margin:0;color:#64748b;font-size:12px;">
                ⏰ Este link é válido por <strong>24 horas</strong>. Se você não criou esta conta, nenhuma ação é necessária.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · Gestão de Inteligência Agrícola
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildProjectSummaryEmailHtml(recipientName, senderName, project, projectUrl, note) {
    const activities = Array.isArray(project.activities) ? project.activities : [];
    const activitiesRows = activities.slice(0, 10).map((act, idx) => {
        const isDone = act.status === 'Concluída';
        const color = isDone ? '#10b981' : (act.status === 'Em Andamento' ? '#38bdf8' : '#f59e0b');
        return `
          <tr style="border-bottom:1px solid #334155;">
            <td style="padding:10px 12px;color:#cbd5e1;font-size:13px;">${idx + 1}. ${act.name || act.description || 'Etapa'}</td>
            <td style="padding:10px 12px;color:#94a3b8;font-size:13px;text-align:center;">${act.target_date || act.date || '-'}</td>
            <td style="padding:10px 12px;text-align:right;">
              <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:rgba(255,255,255,0.06);color:${color};">
                ${act.status}
              </span>
            </td>
          </tr>
        `;
    }).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Projeto Compartilhado - ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background:linear-gradient(135deg,#1e40af,#0284c7);">
              <div style="display:inline-block;background:rgba(255,255,255,.18);border-radius:12px;padding:10px 14px;margin-bottom:12px;">
                <span style="font-size:26px;">📋</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px;">Encaminhamento de Projeto</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 10px;color:#94a3b8;font-size:14px;">Olá, <strong style="color:#f1f5f9;">${recipientName || 'Colega'}</strong></p>
              <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.6;">
                <strong style="color:#38bdf8;">${senderName || 'Um membro da equipe'}</strong> compartilhou o projeto <strong>"${project.name}"</strong> com você na plataforma.
              </p>
              ${note ? `<div style="background:#0f172a;padding:12px 16px;border-left:3px solid #38bdf8;border-radius:4px;margin:0 0 20px;color:#94a3b8;font-size:13px;font-style:italic;">"${note}"</div>` : ''}

              <!-- Detalhes do Projeto -->
              <table width="100%" style="background:#0f172a;border-radius:10px;padding:16px;margin:0 0 24px;border:1px solid #334155;">
                <tr>
                  <td style="padding:6px 12px;color:#64748b;font-size:12px;">CLASSIFICAÇÃO</td>
                  <td style="padding:6px 12px;color:#f1f5f9;font-size:13px;font-weight:600;">${project.classification || '-'} (${project.type || '-'})</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px;color:#64748b;font-size:12px;">STATUS ATUAL</td>
                  <td style="padding:6px 12px;color:#10b981;font-size:13px;font-weight:600;">${project.status || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px;color:#64748b;font-size:12px;">PERÍODO</td>
                  <td style="padding:6px 12px;color:#cbd5e1;font-size:13px;">${project.start_date || '-'} até ${project.end_date || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px;color:#64748b;font-size:12px;">LOCAL</td>
                  <td style="padding:6px 12px;color:#cbd5e1;font-size:13px;">${project.location || '-'}</td>
                </tr>
                <tr>
                  <td style="padding:6px 12px;color:#64748b;font-size:12px;">RESPONSÁVEL</td>
                  <td style="padding:6px 12px;color:#cbd5e1;font-size:13px;">${project.responsible_name || '-'}</td>
                </tr>
              </table>

              ${activities.length > 0 ? `
              <h3 style="margin:0 0 12px;color:#e2e8f0;font-size:14px;font-weight:600;">Cronograma de Etapas (${activities.length})</h3>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:10px;border:1px solid #334155;margin:0 0 24px;">
                <thead>
                  <tr style="border-bottom:1px solid #334155;color:#64748b;font-size:11px;text-align:left;">
                    <th style="padding:8px 12px;">ETAPA</th>
                    <th style="padding:8px 12px;text-align:center;">PREVISÃO</th>
                    <th style="padding:8px 12px;text-align:right;">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  ${activitiesRows}
                </tbody>
              </table>
              ` : ''}

              <div style="text-align:center;margin:28px 0;">
                <a href="${projectUrl}"
                   style="display:inline-block;padding:14px 34px;background:linear-gradient(135deg,#2563eb,#0284c7);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:.3px;">
                  🚀 Acessar Projeto na Plataforma
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · Gestão de Inteligência Agrícola
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildDailyDigestEmailHtml(recipientName, digest, dashboardUrl) {
    const overdueList = Array.isArray(digest.overdueActivities) ? digest.overdueActivities : [];
    const upcomingList = Array.isArray(digest.upcomingActivities) ? digest.upcomingActivities : [];

    const overdueItems = overdueList.map(a => `
      <li style="margin-bottom:8px;color:#f87171;font-size:13px;">
        <strong>${a.activityName || a.name}</strong> (${a.projectName}) — <span style="color:#ef4444;font-weight:600;">Atrasada (${a.daysOverdue || a.days}d)</span>
      </li>
    `).join('');

    const upcomingItems = upcomingList.map(a => `
      <li style="margin-bottom:8px;color:#fbbf24;font-size:13px;">
        <strong>${a.activityName || a.name}</strong> (${a.projectName}) — <span style="color:#38bdf8;">Vence em ${a.daysRemaining || a.days} dia(s)</span>
      </li>
    `).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aviso de Prazos - ${APP_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:580px;background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background:linear-gradient(135deg,#b91c1c,#ea580c);">
              <div style="display:inline-block;background:rgba(255,255,255,.2);border-radius:12px;padding:10px 14px;margin-bottom:12px;">
                <span style="font-size:26px;">⏰</span>
              </div>
              <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${APP_NAME}</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,.9);font-size:13px;">Alerta de Prazos do Cronograma</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 10px;color:#94a3b8;font-size:14px;">Olá, <strong style="color:#f1f5f9;">${recipientName || 'Técnico / Gestor'}</strong></p>
              <p style="margin:0 0 20px;color:#cbd5e1;font-size:15px;line-height:1.6;">
                Este é o seu resumo matinal de acompanhamento dos projetos agrícolas sob sua responsabilidade.
              </p>

              ${overdueList.length > 0 ? `
              <div style="background:#450a0a;border:1px solid #991b1b;border-radius:10px;padding:16px;margin:0 0 20px;">
                <h3 style="margin:0 0 10px;color:#fca5a5;font-size:14px;font-weight:700;">🚨 Etapas em Atraso (${overdueList.length})</h3>
                <ul style="margin:0;padding-left:20px;">
                  ${overdueItems}
                </ul>
              </div>
              ` : ''}

              ${upcomingList.length > 0 ? `
              <div style="background:#172554;border:1px solid #1e40af;border-radius:10px;padding:16px;margin:0 0 24px;">
                <h3 style="margin:0 0 10px;color:#93c5fd;font-size:14px;font-weight:700;">📅 Vencimentos dos Próximos 5 Dias (${upcomingList.length})</h3>
                <ul style="margin:0;padding-left:20px;">
                  ${upcomingItems}
                </ul>
              </div>
              ` : ''}

              <div style="text-align:center;margin:28px 0;">
                <a href="${dashboardUrl}"
                   style="display:inline-block;padding:14px 34px;background:linear-gradient(135deg,#2563eb,#0284c7);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:.3px;">
                  🔍 Abrir Calendário e Dashboard
                </a>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #334155;text-align:center;">
              <p style="margin:0;color:#475569;font-size:12px;">
                © ${new Date().getFullYear()} ${APP_NAME} · Gestão de Inteligência Agrícola
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
    sendPasswordResetEmail,
    sendAccountVerificationEmail,
    sendProjectSummaryEmail,
    sendDailyDigestEmail
};
