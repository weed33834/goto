// 统一类型入口
// 桌面/Web 端权威类型集。原 mobile.ts 遗留已清除:仅保留实际被消费
// 的类型(直接导入 + 传递依赖),未实现模块(目标/习惯/分析/自动化/
// 模板/团队/日历/提醒/搜索/AI 洞察/移动端导航参数列表)的类型已移除。
// 所有代码统一从 '../../shared/types' 或 '../types' 导入。

// ===== 基础类型别名 =====

export type Priority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';
export type TaskStatus = 'todo' | 'in-progress' | 'waiting' | 'delegated' | 'completed' | 'cancelled' | 'on-hold';
export type ProjectStatus = 'active' | 'completed' | 'paused' | 'archived';
export type ViewType = 'list' | 'kanban' | 'calendar' | 'timeline' | 'table' | 'gantt' | 'mindmap' | 'time-block';
export type Theme = 'light' | 'dark' | 'system' | 'custom';
export type FilterOperator = 'equals' | 'not-equals' | 'contains' | 'greater-than' | 'less-than' | 'in' | 'between' | 'starts-with' | 'ends-with' | 'is-empty' | 'is-not-empty';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceEndType = 'never' | 'date' | 'count';
export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'multi-select' | 'checkbox' | 'url';
export type AttachmentType = 'image' | 'document' | 'audio' | 'video' | 'other';
export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'success';
export type SyncConflictStrategy = 'local' | 'remote' | 'newest' | 'merge' | 'ask';
export type SyncProvider = 'expo' | 'icloud' | 'google-drive' | 'dropbox' | 'onedrive' | 'custom';
/**
 * 同步协议模式:
 *   - 'http-rest':传统 REST API 拉取/推送(明文 HTTPS,中心服务器仲裁)
 *   - 'e2ee-p2p':端到端加密 P2P 协议(ECDH+Ed25519+AES-GCM,中继仅转发)
 *
 * 默认 'http-rest';完成 relay 连接与配对后可切换为 'e2ee-p2p'。
 */
export type SyncProtocol = 'http-rest' | 'e2ee-p2p';
export type GroupByOption = 'category' | 'project' | 'status' | 'priority' | 'due-date' | 'tag' | 'assignee' | 'date' | 'none';

// ===== 核心任务接口 =====

export interface Task {
  id: string;
  title: string;
  description: string;
  content: string;
  dueDate: Date | null;
  dueTime: Date | null;
  startDate: Date | null;
  startTime: Date | null;
  endDate: Date | null;
  reminderDate: Date | null;
  recurrence: RecurrenceRule | null;
  priority: Priority;
  status: TaskStatus;
  progress: number;
  categoryId: string | null;
  projectId: string | null;
  tags: string[];
  completed: boolean;
  completedAt: Date | null;
  estimatedTime: number | null;
  actualTime: number | null;
  createdAt: Date;
  updatedAt: Date;
  isRecurring: boolean;
  parentTaskId: string | null;
  subtasks: { id: string; title: string; completed: boolean; order: number }[];
  attachments: Attachment[];
  comments: Comment[];
  links: Link[];
  customFields: CustomField[];
  location: Location | null;
  dependencies: string[];
  blockedBy: string[];
  isStarred: boolean;
  isHidden: boolean;
  isArchived: boolean;
  notes: Note[];
  checklist: ChecklistItem[];
  assigneeId: string | null;
  createdBy: string | null;
  order: number;
  version: number;
  /**
   * 版本向量:{ [deviceId]: counter }。E2EE P2P 同步协议用它做因果偏序判定,
   * 区分"先后编辑"与"并发编辑"。HTTP REST 模式下可为 undefined(退化为
   * updatedAt last-write-wins)。与桌面端 WireSyncRecord.deviceVersion 对齐。
   */
  deviceVersion?: Record<string, number>;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface RecurrenceRule {
  type: RecurrenceType;
  interval: number;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  endType: RecurrenceEndType;
  endDate?: Date;
  endCount?: number;
  exceptions: Date[];
  exceptionsCount: number;
}

export interface Attachment {
  id: string;
  name: string;
  type: AttachmentType;
  uri: string;
  thumbnail?: string;
  size: number;
  mimeType: string;
  createdAt: Date;
  updatedAt: Date;
  taskId: string;
  uploadedBy: string | null;
}

export interface Comment {
  id: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  taskId: string;
  createdAt: Date;
  updatedAt: Date;
  mentions: string[];
  likes: number;
  isEdited: boolean;
  parentCommentId: string | null;
  replies: Comment[];
}

export interface Link {
  id: string;
  url: string;
  title: string;
  description: string;
  favicon: string;
  taskId: string;
  createdAt: Date;
}

export interface CustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  value: unknown;
  options?: string[];
  required: boolean;
  defaultValue?: unknown;
  order: number;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  placeId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  contentHtml: string;
  isMarkdown: boolean;
  tags: string[];
  categoryId: string | null;
  projectId: string | null;
  isPinned: boolean;
  isArchived: boolean;
  isLocked: boolean;
  color?: string;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
  attachments: Attachment[];
  links: Link[];
  taskLinks: string[];
  versionHistory: NoteVersion[];
  createdBy: string | null;
}

export interface NoteVersion {
  id: string;
  noteId: string;
  content: string;
  contentHtml: string;
  createdAt: Date;
  authorId: string | null;
  changes: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  completedAt: Date | null;
  order: number;
  dueDate: Date | null;
  assigneeId: string | null;
  createdAt: Date;
}

// ===== 项目 / 分类 / 标签系统 =====

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  isDefault: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  parentProjectId?: string | null;
  childProjectIds?: string[];
  createdAt: Date;
  updatedAt: Date;
  status: ProjectStatus;
  settings?: ProjectSettings;
  members?: ProjectMember[];
  customFields?: ProjectCustomField[];
  views?: View[];
  taskCount: number;
  completedTaskCount: number;
  progress: number;
  startDate: Date | null;
  dueDate: Date | null;
  ownerId: string | null;
  tags: string[];
  location: Location | null;
}

export interface ProjectSettings {
  defaultView: ViewType;
  taskDefaults: Partial<Task>;
  notifications: NotificationSettings;
  sharing: SharingSettings;
  autoArchive: boolean;
  autoArchiveDays: number;
  defaultPriority: Priority;
  defaultStatus: TaskStatus;
  enableTimeTracking: boolean;
  enableRecurrence: boolean;
  enableChecklist: boolean;
  enableAttachments: boolean;
  enableComments: boolean;
  enableCustomFields: boolean;
}

export interface ProjectMember {
  id: string;
  userId: string;
  role: TeamRole;
  joinedAt: Date;
  permissions: string[];
  canEdit: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canManageSettings: boolean;
}

export interface ProjectCustomField {
  id: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  required: boolean;
  defaultValue?: unknown;
  order: number;
  showInList: boolean;
  width: number;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  icon?: string;
  parentCategoryId?: string | null;
  childCategoryIds?: string[];
  isSystem?: boolean;
  isArchived?: boolean;
  taskCount?: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  projectId?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  icon: string;
  isSystem: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string | null;
}

// ===== 视图系统 =====

export interface View {
  id: string;
  name: string;
  type: ViewType;
  isSystem: boolean;
  isFavorite: boolean;
  projectId: string | null;
  filters: Filter[];
  sortOptions: SortOption[];
  groupBy: GroupByOption | null;
  layout: LayoutSettings;
  colorSchema: string;
  icon: string;
  iconName?: string;
  columns?: string[];
  kanbanColumns?: KanbanColumn[];
  timelineConfig?: TimelineConfig;
  ganttConfig?: GanttConfig;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}

export interface Filter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: unknown;
  isNegated: boolean;
  conjunction: 'and' | 'or';
  order: number;
}

export interface SortOption {
  id: string;
  field: string;
  direction: 'asc' | 'desc';
  priority: number;
}

export interface LayoutSettings {
  density: 'compact' | 'comfortable' | 'spacious';
  cardStyle: 'minimal' | 'detailed' | 'expanded';
  showCompleted: boolean;
  showProgress: boolean;
  showTags: boolean;
  showDueDate: boolean;
  showPriority: boolean;
  showAssignee: boolean;
  showTime: boolean;
  showLocation: boolean;
  compactMode: boolean;
  showArchived: boolean;
  paginationSize: number;
  infiniteScroll: boolean;
}

export interface KanbanColumn {
  id: string;
  title: string;
  statuses: TaskStatus[];
  wipLimit: number | null;
  color: string;
  order: number;
  collapsed: boolean;
}

export interface TimelineConfig {
  showToday: boolean;
  showWeekends: boolean;
  showMilestones: boolean;
  zoomLevel: 'day' | 'week' | 'month';
  dateFormat: string;
}

export interface GanttConfig {
  showToday: boolean;
  showWeekends: boolean;
  showProgress: boolean;
  showDependencies: boolean;
  showCriticalPath: boolean;
  zoomLevel: 'day' | 'week' | 'month' | 'quarter';
  dateFormat: string;
  workDaysOnly: boolean;
}

// ===== 用户系统 =====

export interface UserPreferences {
  defaultView: ViewType;
  defaultProject: string | null;
  defaultCategory: string | null;
  startDayOfWeek: number;
  workHours: WorkHours;
  notifications: NotificationPreferences;
  integrations: IntegrationSettings;
  shortcuts: KeyboardShortcuts;
  displaySettings: DisplaySettings;
  privacySettings: PrivacySettings;
  languageSettings: LanguageSettings;
  accessibilitySettings: AccessibilitySettings;
  pomodoroSettings: PomodoroSettings;
}

export interface WorkHours {
  enabled: boolean;
  startHour: number;
  endHour: number;
  days: number[];
  timezone: string;
}

export interface IntegrationSettings {
  googleCalendar: boolean;
  appleCalendar: boolean;
  outlookCalendar: boolean;
  slack: boolean;
  teams: boolean;
  github: boolean;
  jira: boolean;
  notion: boolean;
  dropbox: boolean;
  onedrive: boolean;
  googleDrive: boolean;
}

export interface KeyboardShortcuts {
  [key: string]: string;
  quickAdd: string;
  search: string;
  toggleSidebar: string;
  markComplete: string;
  newTask: string;
  newProject: string;
  settings: string;
  help: string;
}

export interface DisplaySettings {
  compactMode: boolean;
  showAnimations: boolean;
  showTooltips: boolean;
  showAvatars: boolean;
  showTaskIcons: boolean;
  showCompletedTasks: boolean;
  showSubtasks: boolean;
  showAttachments: boolean;
  cardDensity: 'compact' | 'comfortable' | 'spacious';
  colorScheme: 'light' | 'dark' | 'auto';
  accentColor: string;
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  firstDayOfWeek: number;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private' | 'team';
  showEmail: boolean;
  showPhone: boolean;
  showActivity: boolean;
  allowMentions: boolean;
  allowInvites: boolean;
  dataCollection: boolean;
  analytics: boolean;
  biometricLock: boolean;
  autoLockTimeout: number;
}

export interface LanguageSettings {
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  firstDayOfWeek: number;
  numberFormat: string;
  currency: string;
}

export interface AccessibilitySettings {
  screenReaderEnabled: boolean;
  highContrastMode: boolean;
  largeText: boolean;
  reduceMotion: boolean;
  colorBlindMode: boolean;
  keyboardNavigation: boolean;
  voiceControl: boolean;
  hapticFeedback: boolean;
}

export interface PomodoroSettings {
  enabled: boolean;
  focusDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
  dailyGoal: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface NotificationSettings {
  taskReminders: boolean;
  projectUpdates: boolean;
  comments: boolean;
  mentions: boolean;
  dailyDigest: boolean;
  weeklyReport: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export type NotificationType = 'notification' | 'email' | 'sms' | 'push';

export interface QuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: number[];
  timezone: string;
}

export interface NotificationChannel {
  id: string;
  type: NotificationType;
  enabled: boolean;
  priority: number;
  filters: string[];
}

export interface NotificationPreferences {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  badgeEnabled: boolean;
  quietHours: QuietHours;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  notificationChannels: NotificationChannel[];
  taskReminders: boolean;
  projectUpdates: boolean;
  comments: boolean;
  mentions: boolean;
  dailyDigest: boolean;
  weeklyReport: boolean;
}

export interface SharingSettings {
  isPublic: boolean;
  allowComments: boolean;
  allowAttachments: boolean;
  allowAssign: boolean;
  linkExpiry: number | null;
  maxMembers: number;
}

// ===== 通知 / AI 建议 =====

export interface Notification {
  id: string;
  type: 'task' | 'project' | 'comment' | 'mention' | 'reminder' | 'system' | 'collaboration';
  title: string;
  message: string;
  data: Record<string, unknown>;
  isRead: boolean;
  isArchived: boolean;
  actionUrl: string | null;
  createdAt: Date;
}

export interface AISuggestion {
  id: string;
  type: 'task-suggestion' | 'priority-suggestion' | 'schedule-suggestion' | 'summary' | 'brainstorm' | 'rewrite' | 'analyze';
  title: string;
  content: string;
  confidence: number;
  reason: string;
  isAccepted: boolean;
  isDismissed: boolean;
  createdAt: Date;
  context: Record<string, unknown>;
}

// ===== 主题系统 =====

export interface ThemePreset {
  id: string;
  name: string;
  type: Theme;
  colors: ThemeColors;
  typography: TypographySettings;
  spacing: SpacingSettings;
  borderRadius: BorderRadiusSettings;
  shadows: ShadowSettings;
  isCustom: boolean;
  isSystem: boolean;
  createdAt: Date;
}

export interface ThemeColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  onPrimary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  card: string;
  cardElevated: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  border: string;
  borderStrong: string;
  error: string;
  warning: string;
  success: string;
  info: string;
  divider: string;
  overlay: string;
  glassBackground: string;
  glassBorder: string;
  shimmer: string;
  priorities: {
    low: string;
    medium: string;
    high: string;
    urgent: string;
    critical: string;
  };
  status: {
    todo: string;
    'in-progress': string;
    waiting: string;
    delegated: string;
    completed: string;
    cancelled: string;
    'on-hold': string;
  };
  categories: { [key: string]: string };
}

export interface TypographySettings {
  fontFamily: string;
  fontSizeXs: number;
  fontSizeSm: number;
  fontSizeBase: number;
  fontSizeLg: number;
  fontSizeXl: number;
  fontSize2xl: number;
  fontSize3xl: number;
  fontSize4xl: number;
  fontWeightLight: number;
  fontWeightNormal: number;
  fontWeightMedium: number;
  fontWeightSemibold: number;
  fontWeightBold: number;
  lineHeightTight: number;
  lineHeightNormal: number;
  lineHeightRelaxed: number;
  letterSpacingTight: number;
  letterSpacingNormal: number;
  letterSpacingWide: number;
}

export interface SpacingSettings {
  space1: number;
  space2: number;
  space3: number;
  space4: number;
  space5: number;
  space6: number;
  space7: number;
  space8: number;
  space10: number;
  space12: number;
  space16: number;
}

export interface BorderRadiusSettings {
  none: number;
  xs: number;
  sm: number;
  base: number;
  md: number;
  lg: number;
  xl: number;
  '2xl': number;
  full: number;
}

export interface ShadowSettings {
  none: string;
  xs: string;
  sm: string;
  base: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
  ring: string;
}

// ===== 同步与配对 =====

/**
 * 已配对设备:经过 ECDH 握手 + Ed25519 签名验证后信任的对端设备。
 * 存储在 SyncConfig.pairedDevices 中,HELLO 阶段据此校验对端公钥。
 */
export interface PairedDevice {
  deviceId: string;
  name: string;
  publicKeyPem: string;
  pairedAt: Date;
  lastSeenAt: Date | null;
}

export interface SyncConfig {
  enabled: boolean;
  provider: SyncProvider;
  syncInterval: number;
  lastSyncAt: Date | null;
  syncStatus: SyncStatus;
  conflictStrategy: SyncConflictStrategy;
  autoSync: boolean;
  syncOnStart: boolean;
  syncOnEdit: boolean;
  wifiOnly: boolean;
  credentials: Record<string, unknown> | null;
  /**
   * 同步协议模式。Phase 6a 新增:默认 'http-rest'(兼容现有行为),
   * 6b 完成 relay + 配对后可切换为 'e2ee-p2p' 启用端到端加密 P2P 同步。
   */
  syncProtocol?: SyncProtocol;
  /**
   * 本机设备指纹(Ed25519 公钥 sha256 前 16 hex)。首次生成设备身份后填入,
   * 用于版本向量中的本机计数器键名。
   */
  deviceId?: string | null;
  /**
   * 中继服务器 URL(wss://...)。E2EE P2P 模式下用于 NAT 穿透的消息转发,
   * 6b 启用。中继只转发密文帧,不参与解密。
   *
   * 留空时按 relayMode 决定:official 用 DEFAULT_RELAY_URL,
   * self-hosted 用 SyncSettingsPanel 配置的 URL。
   */
  relayUrl?: string | null;
  /**
   * 中继模式。'official' 用官方 relay(默认,开箱即用);
   * 'self-hosted' 用自托管 relay(隐私偏好用户);'auto' 未来扩展。
   * 详见 src/shared/sync/syncPolicy.ts。
   */
  relayMode?: import('./sync/syncPolicy').RelayMode;
  /**
   * 设备数量上限。null = 无限制(默认)。
   * 业务代码用 shouldLimitDevices() 判断,避免直接比较 null/Infinity。
   * 详见 src/shared/sync/syncPolicy.ts。
   */
  maxDevices?: number | null;
  /**
   * 已配对并信任的对端设备列表。HELLO 握手时据此验证对端公钥指纹。
   */
  pairedDevices?: PairedDevice[];
}

// ===== 桌面/Web 端专有类型(移动端 types 中不存在) =====

/** 保险库条目:Web 端独立于移动端的密码/卡片/安全笔记存储 */
export interface VaultItem {
  id: string;
  type: 'password' | 'card' | 'secureNote';
  title: string;
  fields: VaultField[];
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VaultField {
  id: string;
  name: string;
  value: string;
  isSensitive: boolean;
}

/** Web 端安全设置(与移动端 PrivacySettings 不同,Web 端更简单) */
export interface SecuritySettings {
  lockMethod: 'password' | 'pin' | 'biometric';
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  screenshotProtection: boolean;
  privacyModeEnabled: boolean;
}

/** Web 端同步状态(webAPI.sync.getState 的返回类型) */
export interface SyncDeviceInfo {
  deviceId: string;
  publicKey: string;
  name: string | null;
  pairedAt: number;
  lastSeenAt: number | null;
}

export interface SyncState {
  enabled: boolean;
  relayUrl: string;
  devices: SyncDeviceInfo[];
  lastSyncAt: number | null;
  /** 异步配对失败时透传给 UI 的错误信息;无错误时该字段不出现。 */
  lastError?: string | null;
}

export type PeerState =
  | 'connecting'
  | 'handshaking'
  | 'syncing'
  | 'idle'
  | 'error'
  | 'closed';

export interface SyncPeerInfo {
  deviceId: string;
  state: PeerState;
  lastSyncAt: number | null;
  error: string | null;
}
