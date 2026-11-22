export type UserRole = 'super_admin' | 'admin' | 'moderator' | 'user';
export type UserStatus = 'active' | 'kicked' | 'banned';
export type ListingStatus = 'pending' | 'active' | 'sold' | 'rejected';
export type PhoneCondition = 'Yeni (Qutuda)' | 'İdeal' | 'Yaxşı' | 'Orta';
export type ReportStatus = 'open' | 'resolved' | 'dismissed';

export interface AdminPermissions {
  canApproveListings: boolean;
  canEditDeleteListings: boolean;
  canKickBanUsers: boolean;
  canManageReports: boolean;
  canManageSettings: boolean;
  canManageCatalog: boolean;
  canSendBroadcasts: boolean;
  canUseDangerousMod: boolean;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  role: UserRole;
  permissions: AdminPermissions;
  verifiedSeller: boolean;
  canPostListings: boolean;
  isShadowbanned: boolean;
  warningsCount: number;
  lastWarning?: string;
  status: UserStatus;
  kickReason?: string;
  kickedUntil?: string | null;
  banReason?: string;
  bannedUntil?: string | null;
  createdAt: string;
  lastActiveAt: string;
  listingsCount?: number;
}

export interface PreassignedRole {
  email: string;
  role: 'admin' | 'moderator';
  permissions: AdminPermissions;
  assignedBy: string;
  assignedAt: string;
}

export interface PhoneListing {
  id: string;
  sellerId: string;
  sellerEmail: string;
  sellerName: string;
  sellerVerified: boolean;
  title: string;
  brand: string;
  model: string;
  price: number;
  storage: string;
  ram: string;
  batteryHealth: number;
  condition: PhoneCondition;
  city: string;
  color: string;
  imeiVerified: boolean;
  warranty: string;
  barter: boolean;
  credit: boolean;
  phone: string;
  description: string;
  imageUrl: string;
  status: ListingStatus;
  rejectionReason?: string;
  isFeatured: boolean;
  views: number;
  favoritesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListingReport {
  id: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerEmail: string;
  reporterId: string;
  reporterEmail: string;
  reason: string;
  details: string;
  status: ReportStatus;
  resolvedBy?: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: 'listing' | 'user' | 'report' | 'settings' | 'role' | 'catalog' | 'broadcast' | 'moderator';
  targetId: string;
  targetLabel: string;
  reason?: string;
  createdAt: string;
}

export interface PlatformSettings {
  autoApproveListings: boolean;
  maintenanceMode: boolean;
  announcementBanner: string;
  maxListingsPerUser: number;
  blockedKeywords: string[];
  allowNewRegistrations: boolean;
}

export interface CatalogConfig {
  brands: string[];
  cities: string[];
}

export interface UserNotification {
  id: string;
  targetUserId: string; // 'all' or specific user id
  title: string;
  message: string;
  kind: 'info' | 'warning' | 'system';
  sentBy: string;
  readBy: string[];
  createdAt: string;
}

export interface AdminOverviewStats {
  totalListings: number;
  activeListings: number;
  pendingListings: number;
  soldListings: number;
  rejectedListings: number;
  totalMarketValueAzn: number;
  totalViews: number;
  totalUsers: number;
  kickedUsers: number;
  bannedUsers: number;
  mutedUsers: number;
  shadowbannedUsers: number;
  adminCount: number;
  openReports: number;
  blacklistedCount: number;
  brandBreakdown: { brand: string; count: number; valueAzn: number }[];
  cityBreakdown: { city: string; count: number }[];
  topViewedListings: { id: string; title: string; views: number; price: number }[];
}

export interface RiskFlaggedListing {
  listing: PhoneListing;
  reasons: string[];
  riskScore: number;
}

export interface PanelActorInfo {
  id: string;
  name: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  isReshid: boolean;
  isMasterPasscode: boolean;
  isOwner: boolean;
  canManageAccess: boolean;
  allowAdminPanel: boolean;
  allowModeratorPanel: boolean;
  permissions: AdminPermissions;
  authMethod: 'master_passcode' | 'operator_passcode' | 'gmail';
}

export interface OperatorAccess {
  id: string;
  isReshid: boolean;
  displayName: string;
  email: string;
  hasPasscode: boolean;
  allowAdminPanel: boolean;
  allowModeratorPanel: boolean;
  permissions: AdminPermissions;
  active: boolean;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

