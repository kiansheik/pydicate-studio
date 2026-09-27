# DNS for studio.academiatupi.com

The Studio frontend and API are served together by the VPS. This differs from the static
Neo/xe-roka frontends on Cloudflare Pages: **do not copy their Pages CNAME target**.

Create at the DNS provider for `academiatupi.com`:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | studio | The existing Hetzner VPS's public origin IPv4 (same origin as api.academiatupi.com) | Auto or 300 |
| AAAA | studio | Optional: only the VPS IPv6 you have verified is routed/firewalled for 80/443 | Auto or 300 |

Do not use the public IP returned by a proxied Cloudflare record as the VPS origin. Read the
actual configured origin from your DNS/Hetzner dashboard. This PR does not claim a verified
live IP or modify DNS. Start DNS-only for direct Caddy validation; Cloudflare proxying can be
used afterward with **Full (strict)** TLS and no cache rule for authenticated pages/API/SSE.
Never use Flexible TLS. Existing restrictive CAA records must permit the issuer chosen by Caddy.

Add the supplied `Caddyfile.fragment` to the **existing shared xe-roka Caddy** and validate/reload
that deployment. It routes `studio.academiatupi.com` to `pydicate-studio:8787` over `caddy_edge`.
Do not replace existing apex, Neo or API blocks or start another container on public 80/443.
Only SSH and the existing 80/443 need to be reachable. Do not open PostgreSQL or SMTP publicly.

```sh
dig +short studio.academiatupi.com A
dig +short studio.academiatupi.com AAAA
curl --fail --show-error https://studio.academiatupi.com/healthz
```

Reusing the already-working SMTP relay and existing `@academiatupi.com` sender does **not** by
itself require a new MX/SPF/DKIM record for `studio`. Keep existing mail authentication records.
Only change mail DNS when changing the sender domain/provider, following that provider's exact
instructions; do not add a second independent SPF record. Password-reset links use the configured
HTTPS Studio origin. Studio roles/sessions remain private and separate even when the optional Neo identity login is
enabled. No shared cookie domain, password-hash import or CORS wildcard is needed.

Primary references: [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[Cloudflare DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/),
[Full (strict) TLS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
