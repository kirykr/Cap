import type { DetectedDisplayRecordingMode } from "@cap/recorder-core/recorder-constants";
import type { RecordingMode } from "./RecordingModeSelector";

export * from "@cap/recorder-core/recorder-constants";

// Compile-time guard: recorder-core can't import RecordingModeSelector, so it
// hand-writes DetectedDisplayRecordingMode. Fail the build if the two unions
// ever diverge.
type MutuallyAssignable<A, B> = [A] extends [B]
	? [B] extends [A]
		? true
		: never
	: never;
const _detectedDisplayRecordingModeStaysInSync: MutuallyAssignable<
	DetectedDisplayRecordingMode,
	Exclude<RecordingMode, "camera">
> = true;
void _detectedDisplayRecordingModeStaysInSync;

export const dialogVariants = {
	hidden: {
		opacity: 0,
		scale: 0.9,
		y: 20,
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			type: "spring",
			duration: 0.4,
			damping: 25,
			stiffness: 500,
		},
	},
	exit: {
		opacity: 0,
		scale: 0.95,
		y: 10,
		transition: {
			duration: 0.2,
		},
	},
};
