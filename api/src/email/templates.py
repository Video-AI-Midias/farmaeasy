"""Email templates for FarmaEasy.

HTML templates following FarmaEasy visual identity:
- Primary green: #4A8F5B (oklch(55% 0.14 160))
- Dark green: #2D6E3E (oklch(40% 0.1 160))
- Accent teal: #3BA5A5 (oklch(60% 0.14 180))
- Background: #FAFBFC
- Card: #FFFFFF
- Text: #1A1D23
- Muted: #8E959E
- Border: #E5E7EB
- Warning: #F59E0B
- Error: #DC2626
"""

from datetime import datetime


# ==============================================================================
# Base Template
# ==============================================================================

BASE_TEMPLATE = """
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{title} - FarmaEasy</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Reset */
    body, table, td, p, a, li, blockquote {{
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }}
    table, td {{
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }}
    img {{
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }}
    /* Responsive */
    @media only screen and (max-width: 620px) {{
      .container {{
        width: 100% !important;
        padding: 20px 10px !important;
      }}
      .content-table {{
        width: 100% !important;
      }}
      .content-padding {{
        padding: 24px 20px !important;
      }}
      .code-box {{
        padding: 16px !important;
      }}
      .code-text {{
        font-size: 28px !important;
        letter-spacing: 4px !important;
      }}
    }}
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #FAFBFC; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #FAFBFC;">
    <tr>
      <td align="center" style="padding: 40px 20px;" class="container">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); max-width: 600px;" class="content-table">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #E5E7EB;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <!-- Logo Text (since image may not load) -->
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: #4A8F5B; letter-spacing: -0.5px;">
                      FarmaEasy
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;" class="content-padding">
              {content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #F9FAFB; border-top: 1px solid #E5E7EB; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #8E959E; text-align: center; line-height: 1.6;">
                &copy; {year} FarmaEasy. Todos os direitos reservados.<br>
                Este email foi enviado automaticamente, por favor não responda.
              </p>
            </td>
          </tr>
        </table>

        <!-- Security Notice -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;" class="content-table">
          <tr>
            <td style="padding: 20px 0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #8E959E;">
                Se você não solicitou este email, ignore-o com segurança.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


# ==============================================================================
# Template: Password Reset Code
# ==============================================================================

PASSWORD_RESET_CODE_CONTENT = """
<h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1A1D23; line-height: 1.3;">
  Recuperação de Senha
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4B5563; line-height: 1.6;">
  Olá, <strong style="color: #1A1D23;">{user_name}</strong>!<br><br>
  Recebemos uma solicitação para redefinir a senha da sua conta.
  Use o código abaixo para criar uma nova senha:
</p>

<!-- Code Box -->
<div style="background-color: #F0FDF4; border: 2px solid #4A8F5B; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;" class="code-box">
  <p style="margin: 0 0 8px; font-size: 14px; color: #4A8F5B; font-weight: 500;">
    Seu código de verificação
  </p>
  <p style="margin: 0; font-size: 36px; font-weight: 700; color: #2D6E3E; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;" class="code-text">
    {code}
  </p>
</div>

<!-- Warning Box -->
<div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
  <p style="margin: 0; font-size: 14px; color: #92400E; line-height: 1.5;">
    <strong>Importante:</strong> Este código expira em <strong>15 minutos</strong>.
  </p>
</div>

<p style="margin: 24px 0 0; font-size: 14px; color: #6B7280; line-height: 1.6;">
  Se você não solicitou esta redefinição, ignore este email.
  Sua senha permanecerá inalterada.
</p>
"""


def render_password_reset_code(user_name: str, code: str) -> tuple[str, str]:
    """Render password reset code email.

    Args:
        user_name: User's display name
        code: 6-digit verification code

    Returns:
        Tuple of (html_content, plain_text_content)
    """
    content = PASSWORD_RESET_CODE_CONTENT.format(user_name=user_name, code=code)
    html = BASE_TEMPLATE.format(
        title="Recuperação de Senha",
        content=content,
        year=datetime.now().year,
    )

    plain_text = f"""
Recuperação de Senha - FarmaEasy

Olá, {user_name}!

Recebemos uma solicitação para redefinir a senha da sua conta.

Seu código de verificação: {code}

IMPORTANTE: Este código expira em 15 minutos.

Se você não solicitou esta redefinição, ignore este email.
Sua senha permanecerá inalterada.

---
© {datetime.now().year} FarmaEasy. Todos os direitos reservados.
Este email foi enviado automaticamente, por favor não responda.
"""
    return html, plain_text.strip()


# ==============================================================================
# Template: Password Changed Notification
# ==============================================================================

PASSWORD_CHANGED_CONTENT = """
<h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1A1D23; line-height: 1.3;">
  Senha Alterada com Sucesso
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4B5563; line-height: 1.6;">
  Olá, <strong style="color: #1A1D23;">{user_name}</strong>!
</p>

<!-- Success Box -->
<div style="background-color: #F0FDF4; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
  <p style="margin: 0; font-size: 16px; color: #166534; line-height: 1.5;">
    ✓ Sua senha foi alterada em <strong>{date}</strong> às <strong>{time}</strong>.
  </p>
</div>

<p style="margin: 0 0 16px; font-size: 14px; color: #6B7280; line-height: 1.6;">
  Se você realizou esta alteração, nenhuma ação adicional é necessária.
</p>

<!-- Warning Box -->
<div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
  <p style="margin: 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
    <strong>Não foi você?</strong> Se você não realizou esta alteração, sua conta pode estar comprometida.
    Entre em contato conosco imediatamente.
  </p>
</div>
"""


def render_password_changed(user_name: str) -> tuple[str, str]:
    """Render password changed notification email.

    Args:
        user_name: User's display name

    Returns:
        Tuple of (html_content, plain_text_content)
    """
    now = datetime.now()
    date_str = now.strftime("%d/%m/%Y")
    time_str = now.strftime("%H:%M")

    content = PASSWORD_CHANGED_CONTENT.format(
        user_name=user_name,
        date=date_str,
        time=time_str,
    )
    html = BASE_TEMPLATE.format(
        title="Senha Alterada",
        content=content,
        year=now.year,
    )

    plain_text = f"""
Senha Alterada com Sucesso - FarmaEasy

Olá, {user_name}!

Sua senha foi alterada em {date_str} às {time_str}.

Se você realizou esta alteração, nenhuma ação adicional é necessária.

NÃO FOI VOCÊ?
Se você não realizou esta alteração, sua conta pode estar comprometida.
Entre em contato conosco imediatamente.

---
© {now.year} FarmaEasy. Todos os direitos reservados.
Este email foi enviado automaticamente, por favor não responda.
"""
    return html, plain_text.strip()


# ==============================================================================
# Template: Email Change Code
# ==============================================================================

EMAIL_CHANGE_CODE_CONTENT = """
<h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1A1D23; line-height: 1.3;">
  Confirme seu Novo Email
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4B5563; line-height: 1.6;">
  Olá, <strong style="color: #1A1D23;">{user_name}</strong>!<br><br>
  Uma solicitação foi feita para alterar o email da sua conta FarmaEasy
  para este endereço.
</p>

<!-- Code Box -->
<div style="background-color: #F0FDF4; border: 2px solid #4A8F5B; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;" class="code-box">
  <p style="margin: 0 0 8px; font-size: 14px; color: #4A8F5B; font-weight: 500;">
    Código de confirmação
  </p>
  <p style="margin: 0; font-size: 36px; font-weight: 700; color: #2D6E3E; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;" class="code-text">
    {code}
  </p>
</div>

<!-- Warning Box -->
<div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
  <p style="margin: 0; font-size: 14px; color: #92400E; line-height: 1.5;">
    <strong>Atenção:</strong> Código válido por <strong>15 minutos</strong>.
    Se não foi você, ignore este email.
  </p>
</div>

<p style="margin: 24px 0 0; font-size: 14px; color: #6B7280; line-height: 1.6;">
  Após confirmar, você precisará fazer login novamente com o novo email.
</p>
"""


def render_email_change_code(user_name: str, code: str) -> tuple[str, str]:
    """Render email change code email.

    Args:
        user_name: User's display name
        code: 6-digit verification code

    Returns:
        Tuple of (html_content, plain_text_content)
    """
    content = EMAIL_CHANGE_CODE_CONTENT.format(user_name=user_name, code=code)
    html = BASE_TEMPLATE.format(
        title="Confirme seu Novo Email",
        content=content,
        year=datetime.now().year,
    )

    plain_text = f"""
Confirme seu Novo Email - FarmaEasy

Olá, {user_name}!

Uma solicitação foi feita para alterar o email da sua conta FarmaEasy
para este endereço.

Código de confirmação: {code}

ATENÇÃO: Código válido por 15 minutos.
Se não foi você, ignore este email.

Após confirmar, você precisará fazer login novamente com o novo email.

---
© {datetime.now().year} FarmaEasy. Todos os direitos reservados.
Este email foi enviado automaticamente, por favor não responda.
"""
    return html, plain_text.strip()


# ==============================================================================
# Template: Email Changed Notification
# ==============================================================================

EMAIL_CHANGED_CONTENT = """
<h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1A1D23; line-height: 1.3;">
  Email Alterado com Sucesso
</h1>

<p style="margin: 0 0 24px; font-size: 16px; color: #4B5563; line-height: 1.6;">
  Olá, <strong style="color: #1A1D23;">{user_name}</strong>!
</p>

<!-- Success Box -->
<div style="background-color: #F0FDF4; border-radius: 12px; padding: 20px; margin: 0 0 24px;">
  <p style="margin: 0; font-size: 16px; color: #166534; line-height: 1.5;">
    ✓ O email da sua conta foi alterado em <strong>{date}</strong> às <strong>{time}</strong>.<br>
    Novo email: <strong>{new_email}</strong>
  </p>
</div>

{warning_section}

<p style="margin: 24px 0 0; font-size: 14px; color: #6B7280; line-height: 1.6;">
  {footer_message}
</p>
"""

EMAIL_CHANGED_WARNING_OLD = """
<!-- Warning for old email -->
<div style="background-color: #FEF2F2; border-left: 4px solid #DC2626; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
  <p style="margin: 0; font-size: 14px; color: #991B1B; line-height: 1.5;">
    <strong>Não foi você?</strong> Se você não realizou esta alteração, sua conta pode estar comprometida.
    Entre em contato conosco imediatamente.
  </p>
</div>
"""

EMAIL_CHANGED_WARNING_NEW = """
<!-- Info for new email -->
<div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 24px 0;">
  <p style="margin: 0; font-size: 14px; color: #1E40AF; line-height: 1.5;">
    <strong>Bem-vindo!</strong> Este é agora o email principal da sua conta FarmaEasy.
  </p>
</div>
"""


def render_email_changed(
    user_name: str,
    new_email: str,
    is_new_email: bool = False,
) -> tuple[str, str]:
    """Render email changed notification.

    Args:
        user_name: User's display name
        new_email: The new email address
        is_new_email: True if sending to new email, False if sending to old email

    Returns:
        Tuple of (html_content, plain_text_content)
    """
    now = datetime.now()
    date_str = now.strftime("%d/%m/%Y")
    time_str = now.strftime("%H:%M")

    if is_new_email:
        warning_section = EMAIL_CHANGED_WARNING_NEW
        footer_message = "Use este email para fazer login na sua conta."
    else:
        warning_section = EMAIL_CHANGED_WARNING_OLD
        footer_message = "Este email não está mais associado à sua conta FarmaEasy."

    content = EMAIL_CHANGED_CONTENT.format(
        user_name=user_name,
        date=date_str,
        time=time_str,
        new_email=new_email,
        warning_section=warning_section,
        footer_message=footer_message,
    )
    html = BASE_TEMPLATE.format(
        title="Email Alterado",
        content=content,
        year=now.year,
    )

    if is_new_email:
        plain_text = f"""
Email Alterado com Sucesso - FarmaEasy

Olá, {user_name}!

O email da sua conta foi alterado em {date_str} às {time_str}.
Novo email: {new_email}

BEM-VINDO!
Este é agora o email principal da sua conta FarmaEasy.

Use este email para fazer login na sua conta.

---
© {now.year} FarmaEasy. Todos os direitos reservados.
Este email foi enviado automaticamente, por favor não responda.
"""
    else:
        plain_text = f"""
Email Alterado com Sucesso - FarmaEasy

Olá, {user_name}!

O email da sua conta foi alterado em {date_str} às {time_str}.
Novo email: {new_email}

NÃO FOI VOCÊ?
Se você não realizou esta alteração, sua conta pode estar comprometida.
Entre em contato conosco imediatamente.

Este email não está mais associado à sua conta FarmaEasy.

---
© {now.year} FarmaEasy. Todos os direitos reservados.
Este email foi enviado automaticamente, por favor não responda.
"""
    return html, plain_text.strip()
