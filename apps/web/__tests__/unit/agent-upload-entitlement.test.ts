import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	isAgentUploadAllowedForMeasuredDuration,
	isAgentUploadDurationValid,
} from "@/lib/agent-upload-entitlement";

describe("agent upload duration validation", () => {
	it("allows any finite nonnegative declared duration, including an omitted duration", () => {
		expect(isAgentUploadDurationValid(1)).toBe(true);
		expect(isAgentUploadDurationValid(301)).toBe(true);
		expect(isAgentUploadDurationValid(0)).toBe(true);
		expect(isAgentUploadDurationValid(undefined)).toBe(true);
		expect(isAgentUploadDurationValid(-1)).toBe(false);
		expect(isAgentUploadDurationValid(Number.NaN)).toBe(false);
	});

	it("requires a positive finite server-measured duration", () => {
		expect(
			isAgentUploadAllowedForMeasuredDuration({
				durationSeconds: 301,
				isPro: false,
			}),
		).toBe(true);
		for (const durationSeconds of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(
				isAgentUploadAllowedForMeasuredDuration({
					durationSeconds,
					isPro: false,
				}),
			).toBe(false);
		}
	});

	it("does not cap long measured recordings", () => {
		expect(
			isAgentUploadAllowedForMeasuredDuration({
				durationSeconds: 4 * 60 * 60,
				isPro: false,
			}),
		).toBe(true);
	});

	it("validates optional duration metadata before creating a storage upload target", () => {
		const source = readFileSync(
			join(process.cwd(), "app/api/v1/[...route]/route.ts"),
			"utf8",
		);
		const uploadSource = source.slice(
			source.indexOf('.handle("createUpload"'),
			source.indexOf('.handle("completeUpload"'),
		);
		const entitlementCheck = uploadSource.indexOf("isAgentUploadDurationValid");

		expect(entitlementCheck).toBeGreaterThan(-1);
		expect(uploadSource).toContain("AGENT_UPLOAD_INVALID_DURATION_MESSAGE");
		expect(uploadSource).not.toContain("isAgentUploadAllowedForPlan");
		expect(uploadSource).toContain('agentUpload: { state: "pending" }');
		expect(uploadSource).toContain("agentUploadPendingRawFileKey");
		expect(uploadSource).not.toContain("raw-upload.mp4");
		expect(entitlementCheck).toBeLessThan(
			uploadSource.indexOf("storage.getWritableAccessForUser"),
		);
		expect(entitlementCheck).toBeLessThan(
			uploadSource.indexOf("tx.insert(Db.videos)"),
		);
	});

	it("verifies an immutable server-owned copy before processing", () => {
		const source = readFileSync(
			join(process.cwd(), "app/api/v1/[...route]/route.ts"),
			"utf8",
		);
		const completionSource = source.slice(
			source.indexOf('.handle("completeUpload"'),
			source.indexOf('.handle("importLoomCap"'),
		);
		const idempotencyValidation = completionSource.indexOf(
			"isAgentIdempotencyKey",
		);
		const copy = completionSource.indexOf("bucket.copyObject");
		const probe = completionSource.indexOf("probeVideoViaMediaServer");
		const accept = completionSource.indexOf("rawFileKey: candidateRawFileKey");
		const processing = completionSource.indexOf("startVideoProcessingWorkflow");

		expect(idempotencyValidation).toBeGreaterThan(-1);
		expect(copy).toBeGreaterThan(-1);
		expect(probe).toBeGreaterThan(-1);
		expect(completionSource).toContain("maxRetries: 0");
		expect(completionSource).toContain("candidateRawFileKey");
		expect(completionSource).toContain(
			"isAgentUploadAllowedForMeasuredDuration",
		);
		expect(completionSource).toContain("AGENT_UPLOAD_INVALID_DURATION_MESSAGE");
		expect(completionSource).toMatch(
			/agentUploadVerifiedRawFileKey\(\s*principal\.id,\s*path\.id,\s*requestId,/,
		);
		expect(idempotencyValidation).toBeLessThan(copy);
		expect(copy).toBeLessThan(probe);
		expect(probe).toBeLessThan(accept);
		expect(accept).toBeLessThan(processing);
	});

	it("checks the accepted upload key against the video before processing", () => {
		const source = readFileSync(
			join(process.cwd(), "app/api/v1/[...route]/route.ts"),
			"utf8",
		);
		const completionSource = source.slice(
			source.indexOf('.handle("completeUpload"'),
			source.indexOf('.handle("importLoomCap"'),
		);
		const acceptedKeyCheck = completionSource.search(
			/isVideoStorageKey\(\s*\{ id: path\.id, ownerId: principal\.id \},\s*acceptedRawFileKey,/,
		);
		const stateKeyCheck = completionSource.search(
			/isVideoStorageKey\(\s*\{ id: state\.id, ownerId: state\.ownerId \},\s*state\.rawFileKey,/,
		);

		expect(acceptedKeyCheck).toBeGreaterThan(-1);
		expect(stateKeyCheck).toBeGreaterThan(-1);
		expect(acceptedKeyCheck).toBeLessThan(
			completionSource.indexOf("runAgentMutation"),
		);
		expect(stateKeyCheck).toBeLessThan(
			completionSource.indexOf("startVideoProcessingWorkflow"),
		);
	});

	it("durably rejects only marked agent uploads and cleans storage first", () => {
		const source = readFileSync(
			join(process.cwd(), "app/api/v1/[...route]/route.ts"),
			"utf8",
		);
		const completionSource = source.slice(
			source.indexOf('.handle("completeUpload"'),
			source.indexOf('.handle("importLoomCap"'),
		);
		const cleanupSource = completionSource.slice(
			completionSource.indexOf("const deleteRejectedUpload"),
			completionSource.indexOf('if (initialAgentUpload.state === "rejected")'),
		);

		expect(completionSource).toContain("const initialAgentUpload =");
		expect(completionSource).toContain("uploadVideo.metadata?.agentUpload");
		expect(completionSource).toContain("const [createUploadRecord]");
		expect(completionSource).toContain("const [completedUploadRecord]");
		expect(completionSource).toContain("'$.rawFileKey'");
		expect(completionSource).toContain("legacyRawFileKey");
		expect(completionSource).toMatch(
			/`\$\{bucket\.bucketName\}\/\$\{payload\.rawFileKey\}`/,
		);
		expect(completionSource).toContain('agentUpload: { state: "rejected" }');
		expect(completionSource).toContain(
			"payload.rawFileKey !== acceptedRawFileKey",
		);
		expect(cleanupSource.indexOf("bucket.deleteObjects")).toBeLessThan(
			cleanupSource.indexOf("db.transaction"),
		);
		expect(completionSource).toContain(".delete(Db.agentApiIdempotency)");
		expect(completionSource).toContain(".delete(Db.comments)");
		expect(completionSource).toContain(".delete(Db.notifications)");
		expect(completionSource).toContain(".delete(Db.videoUploads)");
		expect(completionSource).toContain(".delete(Db.importedVideos)");
		expect(completionSource).toContain(".delete(Db.sharedVideos)");
		expect(completionSource).toContain(".delete(Db.spaceVideos)");
		expect(completionSource).toContain(".delete(Db.videoEdits)");
		expect(completionSource).toContain(".delete(Db.videos)");
	});
});
