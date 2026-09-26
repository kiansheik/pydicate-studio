"""SMTP-only helper: message through stdin; never print bodies, credentials or reset URLs."""
import json
import os
import smtplib
import ssl
import sys
from email.message import EmailMessage
from email.utils import formataddr


def send(message, env=os.environ):
    host = env.get('SMTP_HOST', '')
    if not host:
        raise ValueError('SMTP_HOST is required')
    port = int(env.get('SMTP_PORT', '587'))
    tls = env.get('SMTP_USE_TLS', 'true').lower() == 'true'
    implicit = env.get('SMTP_USE_SSL', 'false').lower() == 'true'
    if implicit and tls:
        raise ValueError('Choose STARTTLS or implicit TLS, not both')
    sender = env.get('SMTP_FROM_EMAIL', 'no-reply@academiatupi.com')
    name = env.get('SMTP_FROM_NAME', 'Pydicate Studio')
    for value in [sender, name, message['to'], message['subject']]:
        if '\r' in value or '\n' in value:
            raise ValueError('Invalid mail header')
    mail = EmailMessage()
    mail['From'] = formataddr((name, sender))
    mail['To'] = message['to']
    mail['Subject'] = message['subject']
    mail.set_content(message['body'])
    context = ssl.create_default_context()
    client = smtplib.SMTP_SSL(host, port, timeout=15, context=context) if implicit else smtplib.SMTP(host, port, timeout=15)
    with client:
        client.ehlo()
        if tls:
            client.starttls(context=context)
            client.ehlo()
        username = env.get('SMTP_USERNAME', '')
        if username:
            if not (tls or implicit):
                raise ValueError('SMTP credentials require TLS')
            client.login(username, env.get('SMTP_PASSWORD', ''))
        client.send_message(mail)


if __name__ == '__main__':
    try:
        raw = sys.stdin.buffer.read(16385)
        if len(raw) > 16384:
            raise ValueError('Message too large')
        send(json.loads(raw))
    except Exception:
        # Deliberately exclude provider errors: some include recipients or message contents.
        sys.stderr.write('SMTP_DELIVERY_FAILED\n')
        sys.exit(1)
