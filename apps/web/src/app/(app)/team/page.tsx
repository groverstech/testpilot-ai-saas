"use client";
import * as React from "react";
import { MailPlus, MoreHorizontal, Trash2, UserMinus, Users } from "lucide-react";
import {
  Alert,
  AlertDescription,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Field,
  Input,
  NativeSelect,
  Skeleton,
} from "@testpilot/ui";
import { canManageRole, ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type InvitationDTO, type MemberDTO, type Role } from "@testpilot/shared";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { useToast } from "@/components/toaster";
import { PageHeader } from "@/components/page-header";
import { relativeTime } from "@/components/format";

export default function TeamPage() {
  const { session, can, refresh } = useSession();
  const toast = useToast();
  const myRole = session!.activeOrganization!.role;
  const members = useApi<{ data: MemberDTO[] }>("/members");
  const invitations = useApi<{ data: InvitationDTO[] }>("/invitations");
  const [inviteOpen, setInviteOpen] = React.useState(false);

  async function changeRole(m: MemberDTO, role: Role) {
    try {
      await api.patch(`/members/${m.id}`, { role });
      await members.mutate();
      if (m.user.id === session!.user.id) await refresh();
      toast({ title: `${m.user.name} is now ${ROLE_LABELS[role]}`, variant: "success" });
    } catch (err) {
      toast({ title: "Could not change role", description: errorMessage(err), variant: "error" });
    }
  }

  async function remove(m: MemberDTO) {
    const self = m.user.id === session!.user.id;
    if (!window.confirm(self ? "Leave this organization?" : `Remove ${m.user.name} from the organization?`)) return;
    try {
      await api.delete(`/members/${m.id}`);
      if (self) {
        window.location.href = "/dashboard";
        return;
      }
      await members.mutate();
      toast({ title: `${m.user.name} removed`, variant: "success" });
    } catch (err) {
      toast({ title: "Could not remove member", description: errorMessage(err), variant: "error" });
    }
  }

  async function revoke(inv: InvitationDTO) {
    try {
      await api.delete(`/invitations/${inv.id}`);
      await invitations.mutate();
      toast({ title: "Invitation revoked", variant: "success" });
    } catch (err) {
      toast({ title: "Could not revoke", description: errorMessage(err), variant: "error" });
    }
  }

  return (
    <>
      <PageHeader
        title="Team members"
        description="Manage who has access to this organization and what they can do."
        actions={
          can("members:invite") && (
            <Button onClick={() => setInviteOpen(true)}>
              <MailPlus /> Invite member
            </Button>
          )
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>{members.data ? `${members.data.data.length} member${members.data.data.length === 1 ? "" : "s"}` : "Loading…"}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {!members.data ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : (
              <ul className="divide-y divide-border" data-testid="member-list">
                {members.data.data.map((m) => {
                  const self = m.user.id === session!.user.id;
                  const manageable = !self && canManageRole(myRole, m.role, m.role);
                  return (
                    <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                      <Avatar name={m.user.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {m.user.name} {self && <span className="text-muted-foreground">(you)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{m.user.email}</p>
                      </div>
                      <span className="hidden text-xs text-muted-foreground sm:inline">Joined {relativeTime(m.joinedAt)}</span>
                      <Badge variant={m.role === "OWNER" ? "default" : "outline"}>{ROLE_LABELS[m.role]}</Badge>
                      {(manageable || self) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${m.user.name}`}>
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {manageable && (
                              <>
                                <DropdownMenuLabel>Change role</DropdownMenuLabel>
                                {ROLES.filter((r) => r !== m.role && canManageRole(myRole, r, m.role)).map((r) => (
                                  <DropdownMenuItem key={r} onSelect={() => changeRole(m, r)}>
                                    {ROLE_LABELS[r]}
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem onSelect={() => remove(m)} className="text-destructive focus:text-destructive">
                              <UserMinus /> {self ? "Leave organization" : "Remove member"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Invitations expire after 7 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {invitations.data && invitations.data.data.length === 0 ? (
              <EmptyState icon={Users} title="No pending invitations" className="py-8" />
            ) : (
              <ul className="divide-y divide-border" data-testid="invitation-list">
                {invitations.data?.data.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {inv.invitedBy.name} {relativeTime(inv.createdAt)} · expires {relativeTime(inv.expiresAt).replace(" ago", "")}
                      </p>
                    </div>
                    <Badge variant="outline">{ROLE_LABELS[inv.role]}</Badge>
                    {can("members:invite") && (
                      <Button variant="ghost" size="icon" onClick={() => revoke(inv)} aria-label={`Revoke invitation for ${inv.email}`}>
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r}>
                  <dt className="text-sm font-medium">{ROLE_LABELS[r]}</dt>
                  <dd className="text-sm text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} myRole={myRole} onInvited={() => invitations.mutate()} />
    </>
  );
}

function InviteDialog({ open, onOpenChange, myRole, onInvited }: { open: boolean; onOpenChange: (o: boolean) => void; myRole: Role; onInvited: () => void }) {
  const toast = useToast();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<Role>("DEVELOPER");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setEmail("");
      setRole("DEVELOPER");
      setErrors({});
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setError(null);
    try {
      await api.post("/invitations", { email, role });
      onInvited();
      onOpenChange(false);
      toast({ title: "Invitation sent", description: email, variant: "success" });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "VALIDATION_FAILED") setErrors(err.fieldErrors);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>They will receive an email with a link to join.</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label="Email address" htmlFor="invite-email" error={errors.email}>
            <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" autoFocus />
          </Field>
          <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role]}>
            <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.filter((r) => canManageRole(myRole, r)).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
