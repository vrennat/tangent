import { dev } from '$app/environment';
import type { CodePurpose } from './emailCode';

/**
 * Cloudflare Email Sending binding shape (the subset we use). Declared locally so this
 * compiles before the `send_email` binding is added to wrangler.jsonc — wiring the real
 * binding (and onboarding tangent.page for sending) is a deploy-time step, gated on the
 * Workers Paid plan. Until then, dev surfaces the code in the API response instead.
 */
interface SendEmailBinding {
	send(message: { to: string; from: string; subject: string; html: string; text: string }): Promise<void>;
}

const FROM = 'Tangent <login@tangent.page>';

function body(code: string, purpose: CodePurpose): { subject: string; html: string; text: string } {
	const action = purpose === 'recovery' ? 'recover your account' : 'sign in';
	const subject = `Your Tangent code: ${code}`;
	const text = `Your code to ${action} on Tangent is ${code}. It expires in 10 minutes. If you didn't request this, ignore this email.`;
	const html = `<p>Your code to ${action} on Tangent is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`;
	return { subject, html, text };
}

/**
 * Deliver a login/recovery code. Returns the code ONLY in dev (so local + automated tests
 * can complete the flow without a real inbox); in production it sends via the email binding
 * and returns null. If no binding is configured in production, it throws — failing loudly
 * beats silently dropping a sign-in code.
 */
export async function sendCode(
	platform: App.Platform | undefined,
	email: string,
	code: string,
	purpose: CodePurpose
): Promise<{ devCode: string | null }> {
	const binding = (platform?.env as Record<string, unknown> | undefined)?.EMAIL as
		| SendEmailBinding
		| undefined;

	if (binding) {
		const { subject, html, text } = body(code, purpose);
		await binding.send({ to: email, from: FROM, subject, html, text });
		return { devCode: null };
	}
	if (dev) return { devCode: code };
	throw new Error('email transport not configured');
}
