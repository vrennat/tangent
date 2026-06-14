/**
 * WebAuthn relying-party config, derived from the request URL so it's correct across dev
 * ports and prod without hardcoding. The RP ID is the effective domain (no scheme/port):
 * `localhost` in dev, `tangent.page` in prod. The expected origin is the full origin.
 */
export interface RpConfig {
	rpName: string;
	rpID: string;
	origin: string;
}

const RP_NAME = 'Tangent';

export function rpConfig(url: URL): RpConfig {
	return { rpName: RP_NAME, rpID: url.hostname, origin: url.origin };
}
