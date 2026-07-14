export interface Me {
  loginName: string;
  staffId?: string | number;
  role: 'admin' | 'manager' | 'user' | 'guest' | string;
  bizHubRole?: 'admin' | 'manager' | 'user' | string;
  skillHubRoles?: string[];
  adminConsoleRole?: 'admin' | 'readonly' | '' | string;
  requiresDataAcl?: boolean;
  authorized: boolean;
  /** ACL_ADMIN_USERS 中配置的管理员 loginName 列表（用于无权限提示页展示联系人）。 */
  admins?: string[];
}

export interface SystemInfo {
  provider: string;
  model: string;
  cwd?: string;
  share_enabled?: boolean;
}
