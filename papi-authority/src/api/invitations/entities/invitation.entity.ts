import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne } from 'typeorm';

import type { AdminPanelEntity } from '$/api/admin-panels/entities/admin-panel.entity';
import type { ProjectEntity } from '$/api/projects/entities/project.entity';
import type { UserRoleEntity } from '$/api/users/entities/user-role.entity';
import { InvitationStatus } from '$/constants/enums/domain.enums';
import { TimestampedEntity } from '$/core/orm/base.entity';

/**
 * The whole onboarding pipeline lives here — there is NO `users` row until an
 * admin approves (dossier 0.8). Consequences worth restating:
 *
 *  - The authority principal needs no INSERT on `users` at all; only the
 *    console creates identities.
 *  - Approval creates the user + grants in one transaction and then DELETES
 *    this row (0.24), so no `approved` status exists. The audit event written
 *    BEFORE the delete is the surviving record of the onboarding.
 *  - Azure/SSO only (0.18). There is no password-hash column: password-mode
 *    users are created directly by an access-control admin.
 *
 * Two fixes over papi-back's `users_invite`, which has neither: the token is
 * stored HASHED (papi-back mails a token and stores it in plaintext, so a
 * database read yields working invitation links), and `expires_at` is NOT NULL
 * (papi-back's invites never expire).
 */
@Entity({ name: 'invitations' })
@Index('uq_invitations_token_hash', ['tokenHash'], { unique: true })
@Index('idx_invitations_email', ['email'])
@Index('idx_invitations_status_expires', ['status', 'expiresAt'])
export class InvitationEntity extends TimestampedEntity {
  /** SHA-256 hex of the single-use token that was emailed. */
  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({ name: 'email', type: 'varchar', length: 255 })
  email!: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: InvitationStatus,
    default: InvitationStatus.Created,
  })
  status!: InvitationStatus;

  @Column({ name: 'expires_at', type: 'datetime', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'sent_at', type: 'datetime', precision: 6, nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'accepted_at', type: 'datetime', precision: 6, nullable: true })
  acceptedAt!: Date | null;

  /** Who issued the invite. No FK: the record must outlive that admin's account. */
  @Column({ name: 'invited_by_user_id', type: 'char', length: 36, nullable: true })
  invitedByUserId!: string | null;

  @Column({ name: 'rejected_reason', type: 'varchar', length: 255, nullable: true })
  rejectedReason!: string | null;

  /* ------------------------- captured at accept, applied at approval ----- */

  /** Azure AD object id proven at the join step. */
  @Column({ name: 'accepted_oid', type: 'char', length: 36, nullable: true })
  acceptedOid!: string | null;

  @Column({ name: 'accepted_first_name', type: 'varchar', length: 100, nullable: true })
  acceptedFirstName!: string | null;

  @Column({ name: 'accepted_last_name', type: 'varchar', length: 100, nullable: true })
  acceptedLastName!: string | null;

  @Column({ name: 'accepted_language', type: 'varchar', length: 2, nullable: true })
  acceptedLanguage!: string | null;

  /* --------------------------- pre-assigned grants, applied at approval -- */

  @Column({ name: 'role_id', type: 'char', length: 36, nullable: true })
  roleId!: string | null;

  @ManyToOne('UserRoleEntity', { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'role_id' })
  role!: UserRoleEntity | null;

  @ManyToMany('ProjectEntity', { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'invitation_projects',
    joinColumn: { name: 'invitation_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'project_id', referencedColumnName: 'id' },
  })
  projects!: ProjectEntity[];

  @ManyToMany('AdminPanelEntity', { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'invitation_admin_panels',
    joinColumn: { name: 'invitation_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'admin_panel_id', referencedColumnName: 'id' },
  })
  adminPanels!: AdminPanelEntity[];
}
