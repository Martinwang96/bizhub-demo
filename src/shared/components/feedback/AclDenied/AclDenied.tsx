import wxworkIcon from './wxwork.svg';
import styles from './AclDenied.module.css';

export interface AclDeniedProps {
  /** true: 未检测到登录信息（401）；false: 已登录但 ACL 未授权 */
  authError: boolean;
  loginName?: string;
  /** 来自 /api/me 的 ACL 管理员 loginName 列表 */
  admins?: string[];
}

function handleAdminClick(name: string) {
  const a = document.createElement('a');
  a.href = `wxwork://message?username=${encodeURIComponent(name)}`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * 三端共享的 ACL 拦截毛玻璃遮罩。
 *
 * 不负责渲染背景，调用方需保证后方仍渲染主体骨架，
 * 以便 backdrop-filter 透出虚化内容。
 */
export default function AclDenied({ authError, loginName, admins }: AclDeniedProps) {
  const adminList = (admins ?? []).filter(Boolean);

  return (
    <div className={styles.overlay} role="alertdialog" aria-modal="true" aria-labelledby="acl-denied-title">
      <div className={styles.card}>
        <div className={`${styles.icon} ${authError ? styles.iconAuth : ''}`}>
          {authError ? '🔒' : '🚫'}
        </div>
        <h2 id="acl-denied-title" className={styles.title}>
          {authError ? '未检测到登录信息' : '暂无访问权限'}
        </h2>

        {authError ? (
          <p className={styles.desc}>请通过太湖网关访问</p>
        ) : (
          <>
            <p className={styles.desc}>您的账号尚未获得本平台的使用权限</p>
            <p className={styles.desc}>
              {adminList.length > 0 ? (
                <>
                  请联系管理员
                  {adminList.map((name, i) => (
                    <span key={name}>
                      <button
                        type="button"
                        className={styles.adminBtn}
                        title={`点击通过企业微信联系 ${name}`}
                        onClick={() => handleAdminClick(name)}
                      >
                        <img className={styles.wxworkIcon} src={wxworkIcon} alt="" aria-hidden="true" />
                        <span className={styles.adminName}>{name}</span>
                      </button>
                      {i < adminList.length - 1 && <span>、</span>}
                    </span>
                  ))}
                  开通访问权限
                </>
              ) : (
                '请联系管理员开通访问权限'
              )}
            </p>
          </>
        )}

        {loginName && (
          <div className={styles.hint}>
            当前账号：<span className={styles.hintAccount}>{loginName}</span>
          </div>
        )}
      </div>
    </div>
  );
}
