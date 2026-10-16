import type { RequestDetail, Supply, User } from '../schemas';

const gelPen = '/mock/gel-pen.png';
const blackMarker = '/mock/black-marker.png';
const standardPen = '/mock/standard-pen.png';
const a4Paper = '/mock/a4-paper.png';

export const MOCK_PASSWORD = 'Atk#2026';
export const PICKUP_LOCATION = 'General Affair Office';

export type MockRequest = RequestDetail & { requesterId: string; pickedUpById: string | null };

export const LOGISTICS_USER_ID = 'usr_logi';

export const mockUsers: User[] = [
  {
    id: 'usr_dinda',
    name: 'Dinda Putri Ramadani',
    email: 'dinda@example.com',
    position: 'UI/UX Designer',
    department: 'UI/UX Designer',
    role: 'employee',
    unreadNotifications: 1,
    unreadMessages: 1,
  },
  {
    id: 'usr_budi',
    name: 'Budi Santoso',
    email: 'budi@example.com',
    position: 'Finance Staff',
    department: 'Finance',
    role: 'employee',
    unreadNotifications: 0,
    unreadMessages: 0,
  },
  {
    id: 'usr_ga',
    name: 'GA Admin',
    email: 'admin@example.com',
    position: 'GA Officer',
    department: 'General Affair',
    role: 'admin',
    unreadNotifications: 0,
    unreadMessages: 0,
  },
  {
    id: LOGISTICS_USER_ID,
    name: 'Andi Pratama',
    email: 'logistics@example.com',
    position: 'Office Logistics',
    department: 'Office Logistics',
    role: 'logistics',
    unreadNotifications: 0,
    unreadMessages: 0,
  },
];

const base: Array<Omit<Supply, 'id'>> = [
  { name: 'Gel Pen', stock: 300, unit: 'pcs', imageUrl: gelPen },
  { name: 'Black Marker', stock: 0, unit: 'pcs', imageUrl: blackMarker },
  { name: 'Standard Pen', stock: 200, unit: 'pcs', imageUrl: standardPen },
  { name: 'A4 75gsm', stock: 14, unit: 'pcs', imageUrl: a4Paper },
  { name: 'Blue Gel Pen', stock: 120, unit: 'pcs', imageUrl: gelPen },
  { name: 'Red Gel Pen', stock: 80, unit: 'pcs', imageUrl: gelPen },
  { name: 'Ballpoint Pen', stock: 45, unit: 'pcs', imageUrl: standardPen },
  { name: 'F4 70gsm', stock: 22, unit: 'pcs', imageUrl: a4Paper },
  { name: 'Whiteboard Marker', stock: 9, unit: 'pcs', imageUrl: blackMarker },
  { name: 'Fine Liner', stock: 60, unit: 'pcs', imageUrl: standardPen },
  { name: 'A3 80gsm', stock: 5, unit: 'pcs', imageUrl: a4Paper },
  { name: 'Permanent Marker', stock: 18, unit: 'pcs', imageUrl: blackMarker },
  { name: 'Sticky Notes', stock: 70, unit: 'pcs', imageUrl: null },
];

export const createMockSupplies = (): Supply[] => base.map((supply, index) => ({ ...supply, id: `sup_${index + 1}` }));

const at = (day: number) => new Date(Date.UTC(2026, 6, day, 2, 15)).toISOString();

const line = (supplyId: string, name: string, quantity: number) => ({ supplyId, name, quantity });

const userById = (id: string) => {
  const user = mockUsers.find((candidate) => candidate.id === id);
  if (!user) throw new Error(`Unknown mock user ${id}`);
  return user;
};

const detail = (
  day: number,
  seq: number,
  requesterId: string,
  status: RequestDetail['status'],
  items: RequestDetail['items'],
  rejectionReason: string | null = null,
  note: string | null = null,
): MockRequest => {
  const requester = userById(requesterId);
  const reviewed = status !== 'pending';
  const delivered = status === 'in_delivery' || status === 'finished';
  const hoursLater = (hours: number) => new Date(Date.parse(at(day)) + hours * 3_600_000).toISOString();
  const suffix = `202607${String(day).padStart(2, '0')}`;
  return {
    id: `req_${suffix}${String(seq).padStart(3, '0')}`,
    code: `REQ-${suffix}-${String(seq).padStart(3, '0')}`,
    createdAt: at(day),
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    pickupLocation: PICKUP_LOCATION,
    status,
    requester: { name: requester.name, department: requester.department },
    requesterId,
    items,
    rejectionReason,
    note,
    reviewedAt: reviewed ? hoursLater(1) : null,
    reviewedBy: reviewed ? 'GA Admin' : null,
    pickedUpById: delivered ? LOGISTICS_USER_ID : null,
    pickedUpBy: delivered ? userById(LOGISTICS_USER_ID).name : null,
    pickedUpAt: delivered ? hoursLater(3) : null,
    receivedAt: status === 'finished' ? hoursLater(4) : null,
  };
};

export const createMockRequests = (): MockRequest[] => [
  detail(26, 1, 'usr_budi', 'pending', [line('sup_7', 'Ballpoint Pen', 5), line('sup_8', 'F4 70gsm', 2)], null, 'For printing the quarterly audit files.'),
  detail(25, 1, 'usr_dinda', 'approved', [line('sup_1', 'Gel Pen', 3), line('sup_4', 'A4 75gsm', 3)]),
  detail(24, 1, 'usr_dinda', 'ready_for_pickup', [line('sup_3', 'Standard Pen', 1), line('sup_1', 'Gel Pen', 1)]),
  detail(23, 1, 'usr_dinda', 'pending', [line('sup_4', 'A4 75gsm', 2)]),
  detail(22, 1, 'usr_dinda', 'rejected', [line('sup_2', 'Black Marker', 1), line('sup_1', 'Gel Pen', 1), line('sup_3', 'Standard Pen', 1), line('sup_4', 'A4 75gsm', 1)], 'Black Marker is out of stock.'),
  detail(21, 1, 'usr_dinda', 'finished', [line('sup_1', 'Gel Pen', 2), line('sup_3', 'Standard Pen', 1), line('sup_4', 'A4 75gsm', 1)]),
  detail(20, 1, 'usr_budi', 'in_delivery', [line('sup_5', 'Blue Gel Pen', 4)]),
];
