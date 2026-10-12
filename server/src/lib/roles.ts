import { prisma } from './db.js';

type Flags = { view?: boolean; add?: boolean; edit?: boolean; delete?: boolean };
const all: Flags = { view: true, add: true, edit: true, delete: true };

// The default roles (owner 12/10/2026, mockup 3gLnsvQrxnGWHKpPmbRxBA board 1). The Owner can change Partner/Admin later.
const DEFAULTS: { kind: 'partner' | 'admin'; name: string; description: string; perms: Record<string, Flags> }[] = [
  {
    kind: 'partner', name: 'Partner', description: 'หุ้นส่วน',
    perms: {
      dashboard: { view: true }, money: { view: true }, students: all, classes: all, teachers: all, calendar: all,
      receipts: { view: true, add: true, delete: true }, users: { view: true }, auditlog: { view: true }, company: { view: true },
    },
  },
  {
    kind: 'admin', name: 'Admin', description: 'แอดมินหน้าร้าน',
    perms: {
      dashboard: { view: true }, students: { view: true, add: true, edit: true }, classes: { view: true }, teachers: { view: true },
      calendar: { view: true, add: true, edit: true }, receipts: { view: true, add: true },
    },
  },
];

/** Makes sure the hidden SuperAdmin, the Owner, Partner and Admin roles exist. Safe to run on every start. */
export async function ensureRoles() {
  // The first-run "SuperAdmin" system position becomes the hidden Dev role.
  await prisma.position.updateMany({ where: { isSystem: true, kind: '', name: 'SuperAdmin' }, data: { kind: 'superadmin' } });
  if (!(await prisma.position.findFirst({ where: { kind: 'owner' } }))) {
    await prisma.position.create({ data: { name: 'Owner', description: 'เจ้าของ', isSystem: true, kind: 'owner' } });
  }
  for (const d of DEFAULTS) {
    if (await prisma.position.findFirst({ where: { kind: d.kind } })) continue;
    const p = await prisma.position.create({ data: { name: d.name, description: d.description, kind: d.kind } });
    for (const [menuKey, f] of Object.entries(d.perms)) {
      await prisma.positionPermission.create({ data: { positionId: p.id, menuKey, canView: !!f.view, canAdd: !!f.add, canEdit: !!f.edit, canDelete: !!f.delete } });
    }
  }
}
