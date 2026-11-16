import type { CheckoutStatusClient } from "@/git/checkout-status-cache";
import { confirmDialog } from "@/utils/confirm-dialog";
import { i18n } from "@/i18n/i18next";

export interface WorktreeArchiveRisk {
  isDirty?: boolean | null;
  unpushedCommitCount?: number | null;
  diffStat?: { additions: number; deletions: number } | null;
}

export interface WorktreeArchiveRiskInput {
  archiveHasUncommittedChanges?: boolean | null;
  archiveUnpushedCommitCount?: number | null;
  diffStat?: WorktreeArchiveRisk["diffStat"];
}

export interface WorktreeArchiveConfirmationInput extends WorktreeArchiveRisk {
  workspaceName: string;
}

export interface WorktreeArchiveWarningLabels {
  title: (workspaceName: string) => string;
  confirm: string;
  cancel: string;
  uncommittedChanges: string;
  uncommittedChangesWithDiff: (diffStat: string) => string;
  addedLine: (count: number) => string;
  deletedLine: (count: number) => string;
  unpushedCommit: (count: number) => string;
}

export const DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS: WorktreeArchiveWarningLabels = {
  title: (workspaceName) => i18n.t("workspace.git.actions.archiveWarning.title", { workspaceName }),
  confirm: i18n.t("workspace.git.actions.archiveWarning.confirm"),
  cancel: i18n.t("workspace.git.actions.archiveWarning.cancel"),
  uncommittedChanges: i18n.t("workspace.git.actions.archiveWarning.uncommittedChanges"),
  uncommittedChangesWithDiff: (diffStat) =>
    i18n.t("workspace.git.actions.archiveWarning.uncommittedChangesWithDiff", { diffStat }),
  addedLine: (count) =>
    count === 1
      ? i18n.t("workspace.git.actions.archiveWarning.addedLine", { count })
      : i18n.t("workspace.git.actions.archiveWarning.addedLines", { count }),
  deletedLine: (count) =>
    count === 1
      ? i18n.t("workspace.git.actions.archiveWarning.deletedLine", { count })
      : i18n.t("workspace.git.actions.archiveWarning.deletedLines", { count }),
  unpushedCommit: (count) =>
    count === 1
      ? i18n.t("workspace.git.actions.archiveWarning.unpushedCommit", { count })
      : i18n.t("workspace.git.actions.archiveWarning.unpushedCommits", { count }),
};

interface WorktreeCommitCounts {
  aheadOfOrigin?: number | null;
  detachedCommitCount?: number | null;
}

/**
 * The commits a worktree holds that its remote doesn't: on a branch, the ones ahead of its
 * upstream; on a detached HEAD, the ones no other ref holds, which archiving loses.
 */
export function countUnpushedCommits(git: WorktreeCommitCounts): number | null | undefined {
  return git.detachedCommitCount ?? git.aheadOfOrigin;
}

/**
 * Reads the worktree's uncommitted changes and unpushed commits from its host. A directory the
 * host no longer reads as a git checkout has neither. Rejects when the host can't read it.
 */
export async function readWorktreeArchiveRisk(
  client: CheckoutStatusClient,
  workspaceDirectory: string,
): Promise<Pick<WorktreeArchiveRisk, "isDirty" | "unpushedCommitCount">> {
  const status = await client.getCheckoutStatus(workspaceDirectory);
  if (status.error) {
    throw new Error(status.error.message);
  }
  return { isDirty: status.isDirty ?? false, unpushedCommitCount: countUnpushedCommits(status) };
}

export function toWorktreeArchiveRisk(input: WorktreeArchiveRiskInput): WorktreeArchiveRisk {
  return {
    isDirty: input.archiveHasUncommittedChanges,
    unpushedCommitCount: input.archiveUnpushedCommitCount,
    diffStat: input.diffStat,
  };
}

function formatDiffStat(
  diffStat: WorktreeArchiveRisk["diffStat"],
  labels: WorktreeArchiveWarningLabels,
): string | null {
  if (!diffStat) {
    return null;
  }

  const parts: string[] = [];
  if (diffStat.additions > 0) {
    parts.push(labels.addedLine(diffStat.additions));
  }
  if (diffStat.deletions > 0) {
    parts.push(labels.deletedLine(diffStat.deletions));
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildWorktreeArchiveRiskReasons(
  input: WorktreeArchiveRisk,
  labels: WorktreeArchiveWarningLabels = DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS,
): string[] {
  const reasons: string[] = [];
  const diffStat = input.diffStat;
  const hasDiffStatChanges = diffStat ? diffStat.additions > 0 || diffStat.deletions > 0 : false;
  const hasUncommittedChanges =
    input.isDirty === true || (input.isDirty == null && hasDiffStatChanges);

  if (hasUncommittedChanges) {
    const diffStatLabel = formatDiffStat(diffStat, labels);
    reasons.push(
      diffStatLabel ? labels.uncommittedChangesWithDiff(diffStatLabel) : labels.uncommittedChanges,
    );
  }

  const unpushedCommitCount = input.unpushedCommitCount ?? 0;
  if (unpushedCommitCount > 0) {
    reasons.push(labels.unpushedCommit(unpushedCommitCount));
  }

  return reasons;
}

export function buildWorktreeArchiveConfirmationMessage(
  input: WorktreeArchiveConfirmationInput,
  labels: WorktreeArchiveWarningLabels = DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS,
): string | null {
  const reasons = buildWorktreeArchiveRiskReasons(input, labels);
  if (reasons.length === 0) {
    return null;
  }

  return reasons.join("\n");
}

export async function confirmRiskyWorktreeArchive(
  input: WorktreeArchiveConfirmationInput,
  labels: WorktreeArchiveWarningLabels = DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS,
): Promise<boolean> {
  const message = buildWorktreeArchiveConfirmationMessage(input, labels);
  if (!message) {
    return true;
  }

  return await confirmDialog({
    title: labels.title(input.workspaceName),
    message,
    confirmLabel: labels.confirm,
    cancelLabel: labels.cancel,
    destructive: true,
  });
}
