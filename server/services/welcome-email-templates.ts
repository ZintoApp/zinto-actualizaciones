export const defaultSubjectEn = 'Welcome to {{appName}} - Your Account is Ready!';

export const defaultBodyEn = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to {{appName}}!</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 10px !important; }
      .column { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-bottom: 20px !important; }
      .column-last { margin-bottom: 0 !important; }
      .padding-mobile { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 0 30px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
          <tr>
            <td height="6" style="background: linear-gradient(90deg, #2563eb, #3b82f6, #60a5fa);"></td>
          </tr>
          <tr>
            <td align="center" style="padding: 40px 40px 20px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border-radius: 14px; padding: 12px;">
                      <tr>
                        <td>
                          <span style="font-size: 32px; font-weight: bold; color: #2563eb; line-height: 1;">⚡</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">{{appName}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <h1 style="font-size: 28px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.25; letter-spacing: -0.5px;">Welcome aboard, {{adminFullName}}!</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 8px 0 0 0;">We're excited to help you get your business growing with {{companyName}}.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td colspan="2" style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                          <span style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Your Account Details</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 14px 0 8px 0; font-size: 14px; color: #64748b; width: 35%;"><strong>Company</strong></td>
                        <td style="padding: 14px 0 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">{{companyName}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;"><strong>Username</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #2563eb; font-family: monospace;">{{adminUsername}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;"><strong>Email</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">{{adminEmail}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;"><strong>Selected Plan</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #16a34a; border-bottom: 1px solid #e2e8f0;">{{planLabel}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 30px 0 40px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{loginUrl}}" style="height:52px;v-text-anchor:middle;width:220px;" arcsize="10%" stroke="f" fillcolor="#2563eb">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Go to Dashboard →</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="{{loginUrl}}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 16px 36px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: all 0.2s ease;">Go to Dashboard &rarr;</a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 20px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">Get started in 3 simple steps</h2>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">1</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Verify Account &amp; Log In</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Access your dashboard using your registered administrator credentials to initialize your workspace.</p>
                              </td>
                            </tr>
                          </table>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">2</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Configure Settings</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Integrate your customer communication channels, set up live chats, or customize automated responses.</p>
                              </td>
                            </tr>
                          </table>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">3</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Invite Your Team</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Add your support agents, customize their permissions, and start engaging with your customers smoothly.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 0 20px 0; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin: 0;">We're here for you! If you ever need help getting started, our support team is only one message away. Simply reply to this email and we'll be happy to assist.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 30px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                    <p style="margin: 0 0 8px 0;">You are receiving this email because you created an administrator account on {{appName}}.</p>
                    <p style="margin: 0;">&copy; {{currentYear}} {{appName}}. All rights reserved.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const defaultSubjectEs = '¡Bienvenido a {{appName}} - Tu Cuenta está Lista!';

export const defaultBodyEs = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>¡Bienvenido a {{appName}}!</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; padding: 10px !important; }
      .column { display: block !important; width: 100% !important; box-sizing: border-box !important; margin-bottom: 20px !important; }
      .column-last { margin-bottom: 0 !important; }
      .padding-mobile { padding: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 0 30px 0;">
        <table border="0" cellpadding="0" cellspacing="0" width="600" class="container" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
          <tr>
            <td height="6" style="background: linear-gradient(90deg, #2563eb, #3b82f6, #60a5fa);"></td>
          </tr>
          <tr>
            <td align="center" style="padding: 40px 40px 20px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" style="background-color: #eff6ff; border-radius: 14px; padding: 12px;">
                      <tr>
                        <td>
                          <span style="font-size: 32px; font-weight: bold; color: #2563eb; line-height: 1;">⚡</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 16px;">
                    <span style="font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">{{appName}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 40px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 24px;">
                    <h1 style="font-size: 28px; font-weight: 800; color: #0f172a; margin: 0; line-height: 1.25; letter-spacing: -0.5px;">¡Bienvenido a bordo, {{adminFullName}}!</h1>
                    <p style="font-size: 16px; color: #64748b; margin: 8px 0 0 0;">Estamos muy emocionados de ayudarte a hacer crecer tu negocio con {{companyName}}.</p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; padding: 24px; margin-bottom: 30px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td colspan="2" style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
                          <span style="font-size: 15px; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px;">Detalles de tu Cuenta</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 14px 0 8px 0; font-size: 14px; color: #64748b; width: 35%;"><strong>Empresa</strong></td>
                        <td style="padding: 14px 0 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">{{companyName}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;"><strong>Usuario</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #2563eb; font-family: monospace;">{{adminUsername}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b;"><strong>Email</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">{{adminEmail}}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-size: 14px; color: #64748b; border-bottom: 1px solid #e2e8f0;"><strong>Plan Seleccionado</strong></td>
                        <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #16a34a; border-bottom: 1px solid #e2e8f0;">{{planLabel}}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding: 30px 0 40px 0;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{{loginUrl}}" style="height:52px;v-text-anchor:middle;width:220px;" arcsize="10%" stroke="f" fillcolor="#2563eb">
                      <w:anchorlock/>
                      <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">Ir al Panel de Control →</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="{{loginUrl}}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 16px; font-weight: bold; text-decoration: none; padding: 16px 36px; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); transition: all 0.2s ease;">Ir al Panel de Control &rarr;</a>
                    <!--<![endif]-->
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom: 20px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="padding-bottom: 24px;">
                          <h2 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0;">Comienza en 3 sencillos pasos</h2>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">1</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Verifica tu Cuenta e Inicia Sesión</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Accede a tu panel con tus credenciales de administrador para inicializar tu espacio de trabajo.</p>
                              </td>
                            </tr>
                          </table>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 16px;">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">2</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Configura tus Ajustes</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Integra tus canales de comunicación, conecta tu chat web o personaliza tus respuestas automáticas.</p>
                              </td>
                            </tr>
                          </table>
                          <table border="0" cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td valign="top" style="width: 44px;">
                                <div style="background-color: #eff6ff; color: #2563eb; font-weight: 800; border-radius: 50%; width: 32px; height: 32px; line-height: 32px; text-align: center; font-size: 14px;">3</div>
                              </td>
                              <td valign="top" style="padding-top: 4px;">
                                <h3 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 4px 0;">Invita a tu Equipo</h3>
                                <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.4;">Añade a tus agentes de soporte, personaliza sus permisos y empieza a interactuar con tus clientes.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px 0 20px 0; border-top: 1px solid #e2e8f0;">
                    <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin: 0;">¡Estamos aquí para ayudarte! Si tienes cualquier duda para empezar, nuestro equipo de soporte está a un solo mensaje. Simplemente responde a este correo electrónico.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 30px 40px;" class="padding-mobile">
              <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
                    <p style="margin: 0 0 8px 0;">Recibes este correo porque creaste una cuenta de administrador en {{appName}}.</p>
                    <p style="margin: 0;">&copy; {{currentYear}} {{appName}}. Todos los derechos reservados.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;


// Legacy subject lines kept for backward-compatibility detection
const LEGACY_SUBJECTS_EN = [
  'Welcome to {{companyName}} - Your Account is Ready!',
  'Welcome to {{appName}} - Your Account is Ready!',
];

/**
 * Returns true when a stored template is still at its default (uncustomized) state
 * and should be replaced with the current locale-appropriate default on load or send.
 *
 * A template is uncustomized when:
 *  - It has never been saved (subject/body are undefined or empty), OR
 *  - Its subject AND body both match the same-language default exactly, OR
 *  - Its subject matches a legacy English subject and the body is absent or matches
 *    the current English default (legacy rows created before the i18n migration).
 *
 * Cross-language matching is intentionally NOT done: a custom body that happens to
 * share a default subject is still considered customized.
 */
export function isDefaultTemplate(subject: string | undefined, body: string | undefined): boolean {
  if (!subject && !body) return true;

  // Current English default
  if (subject === defaultSubjectEn && body === defaultBodyEn) return true;

  // Current Spanish default
  if (subject === defaultSubjectEs && body === defaultBodyEs) return true;

  // Legacy English subjects with no body (rows saved before appName fix)
  if (LEGACY_SUBJECTS_EN.includes(subject ?? '') && !body) return true;

  // Legacy English subjects whose body was never customised (matches current EN default)
  if (LEGACY_SUBJECTS_EN.includes(subject ?? '') && body === defaultBodyEn) return true;

  return false;
}
