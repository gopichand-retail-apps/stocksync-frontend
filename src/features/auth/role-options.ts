import { UserRoleSchema, type UserRole } from '../../api/client';
import { dataStringRecord } from '../../content-schema';
import type { ContentModel } from '../../content-schema';

export type RoleOption = {
  role: UserRole;
  email: string;
  summary: string;
};

export function roleOptionsForCodes(model: ContentModel, roleCodes: readonly string[]): RoleOption[] {
  if (roleCodes.length === 0) throw new Error('SYNTHETIC_ROLE_OPTIONS_EMPTY');

  const profileEmails = dataStringRecord(model, 'profileEmails');
  const profileSummaries = dataStringRecord(model, 'profileSummaries');
  return roleCodes.map((roleCode) => {
    const parsedRole = UserRoleSchema.safeParse(roleCode);
    if (!parsedRole.success) throw new Error('SYNTHETIC_ROLE_INVALID');

    const role = parsedRole.data;
    if (!Object.hasOwn(profileEmails, role) || !Object.hasOwn(profileSummaries, role)) {
      throw new Error(`CONTENT_ROLE_PROFILE_MISSING:${role}`);
    }

    return { role, email: profileEmails[role], summary: profileSummaries[role] };
  });
}
