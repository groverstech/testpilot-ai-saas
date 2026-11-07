export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const ACTION_LABELS: Record<string, string> = {
  "organization.created": "created the organization",
  "organization.updated": "updated organization settings",
  "project.created": "created a project",
  "project.updated": "updated a project",
  "project.archived": "archived a project",
  "project.restored": "restored a project",
  "project.deleted": "deleted a project",
  "project.secret_upserted": "updated a project secret",
  "project.secret_deleted": "deleted a project secret",
  "invitation.created": "invited a team member",
  "invitation.revoked": "revoked an invitation",
  "invitation.accepted": "joined the organization",
  "member.role_changed": "changed a member's role",
  "member.removed": "removed a member",
  "member.left": "left the organization",
  "workspace.created": "created a workspace",
};

export function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/[._]/g, " ");
}
