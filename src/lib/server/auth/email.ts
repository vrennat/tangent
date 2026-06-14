import { dev } from '$app/environment';
import type { CodePurpose } from './emailCode';

/**
 * Cloudflare Email Sending binding shape (the subset we use). Declared locally so this
 * compiles independent of the binding being present; wiring the real binding (and onboarding
 * tangent.page for sending) is a deploy-time step on the Workers Paid plan. In dev the binding
 * is absent, so sendCode surfaces the code + link in the API response instead of mailing them.
 */
interface SendEmailBinding {
	send(message: { to: string; from: string; subject: string; html: string; text: string }): Promise<void>;
}

const FROM = 'Tangent <login@tangent.page>';

/** What the caller hands us to build the message: the magic link is primary, the code is the
 * cross-device fallback (read it off one device, type it on another). */
export interface LoginEmail {
	code: string;
	link: string;
}

/**
 * Build the branded sign-in email. Email HTML is its own constrained medium — table layout,
 * inline styles, web-safe fonts, and an explicit color on every element (no inherited
 * background) so dark-mode transforms in Outlook/Apple Mail can't land dark-on-dark. The
 * palette mirrors the app's "Nightstand" theme. Verified rendering in Gmail only.
 */
function body(
	{ code, link }: LoginEmail,
	purpose: CodePurpose
): { subject: string; html: string; text: string } {
	const recover = purpose === 'recovery';
	const action = recover ? 'recover your account' : 'sign in';
	const subject = recover ? 'Recover your Tangent account' : 'Sign in to Tangent';

	// Nightstand tokens, inlined (email clients don't do CSS variables).
	const void_ = '#15110c';
	const surface = '#1f1a13';
	const surface2 = '#2a2319';
	const hair = '#342d22';
	const ink = '#ece4d6';
	const muted = '#a89c8a';
	const faint = '#9b8f76';
	const accent = '#e0a14e';
	const serif = "Georgia,'Times New Roman',serif";
	const sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

	const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:${void_};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${void_};">Your one-tap sign-in link for Tangent — or use code ${code}. Expires in 10 minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${void_};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:${surface};border:1px solid ${hair};border-radius:14px;">
<tr><td style="padding:32px 32px 0;">
<div style="font-family:${serif};font-size:23px;font-weight:600;color:${ink};letter-spacing:-0.01em;">
<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${accent};vertical-align:middle;margin-right:9px;"></span>tangent</div>
</td></tr>
<tr><td style="padding:24px 32px 0;">
<h1 style="margin:0 0 10px;font-family:${serif};font-size:21px;font-weight:600;color:${ink};">${subject}</h1>
<p style="margin:0 0 24px;font-family:${sans};font-size:15px;line-height:1.55;color:${muted};">Tap below to ${action} on this device. The link works once and expires in 10 minutes.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${accent}" style="border-radius:999px;">
<a href="${link}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${sans};font-size:15px;font-weight:600;line-height:1;color:${void_};text-decoration:none;border-radius:999px;">Sign in to Tangent</a>
</td></tr></table>
<p style="margin:30px 0 10px;font-family:${sans};font-size:13px;color:${faint};">On a different device? Enter this code instead:</p>
<div style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:27px;font-weight:700;letter-spacing:8px;color:${ink};background-color:${surface2};border:1px solid ${hair};border-radius:10px;padding:15px 0;text-align:center;">${code}</div>
</td></tr>
<tr><td style="padding:26px 32px 32px;">
<p style="margin:16px 0 0;padding-top:18px;border-top:1px solid ${hair};font-family:${sans};font-size:12px;line-height:1.5;color:${faint};">If you didn't request this, you can safely ignore this email — no one can sign in without it.<br>tangent.page</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	const text = `Sign in to Tangent

Tap to ${action} on this device (works once, expires in 10 minutes):
${link}

On a different device? Enter this code instead: ${code}

If you didn't request this, you can safely ignore this email.
tangent.page`;

	return { subject, html, text };
}

/**
 * Deliver a sign-in email (magic link + code). Returns the code + link ONLY in dev (so local +
 * automated tests can complete the flow without a real inbox); in production it sends via the
 * email binding and returns nulls. If no binding is configured in production it throws —
 * failing loudly beats silently dropping a sign-in.
 */
export async function sendCode(
	platform: App.Platform | undefined,
	email: string,
	msg: LoginEmail,
	purpose: CodePurpose
): Promise<{ devCode: string | null; devLink: string | null }> {
	const binding = (platform?.env as Record<string, unknown> | undefined)?.EMAIL as
		| SendEmailBinding
		| undefined;

	if (binding) {
		const { subject, html, text } = body(msg, purpose);
		await binding.send({ to: email, from: FROM, subject, html, text });
	} else if (!dev) {
		throw new Error('email transport not configured');
	}
	// In dev, always surface the code + link so the flow can be completed locally without an
	// inbox — even when a remote-bound EMAIL also sent the real message. Production never leaks.
	return dev ? { devCode: msg.code, devLink: msg.link } : { devCode: null, devLink: null };
}
