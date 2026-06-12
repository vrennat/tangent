/**
 * Open-state for the trail panel, as its own singleton so the layout header (which
 * owns the trail button) and the feed page (which renders the panel) can share it
 * without prop-drilling across the route boundary — same pattern as `reader`.
 */
class TrailPanelState {
	isOpen = $state(false);

	open(): void {
		this.isOpen = true;
	}

	close(): void {
		this.isOpen = false;
	}

	toggle(): void {
		this.isOpen = !this.isOpen;
	}
}

export const trailPanel = new TrailPanelState();
