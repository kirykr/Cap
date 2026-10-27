export function isAgentUploadDurationValid(
	durationSeconds: number | undefined,
) {
	return (
		durationSeconds === undefined ||
		(Number.isFinite(durationSeconds) && durationSeconds >= 0)
	);
}

export function isAgentUploadAllowedForMeasuredDuration({
	durationSeconds,
	isPro,
}: {
	durationSeconds: number;
	isPro: boolean;
}) {
	return isPro || (Number.isFinite(durationSeconds) && durationSeconds > 0);
}
