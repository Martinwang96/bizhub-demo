import { useEffect, useState } from 'react';
import Watermark from '@shared/components/content/Watermark';
import BrandLogo from '@shared/components/brand/BrandLogo';
import { isAclError } from '@shared/api/httpClient';
import {
  getReportLinkShare,
  importReportLinkShare,
  reportShareViewUrl,
  type ReportShareData,
} from '../chat/api/reports';
import styles from './SharePage.module.css';

function fmtDate(ts?: number): string {
  if (!ts) return '';
  const raw = ts < 1e12 ? ts * 1000 : ts;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    + ' '
    + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function ReportSharePage() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [token, setToken] = useState('');
  const [share, setShare] = useState<ReportShareData | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [openState, setOpenState] = useState<'idle' | 'loading'>('idle');
  const [openErr, setOpenErr] = useState('');

  useEffect(() => {
    const match = window.location.pathname.match(/^\/rs\/([A-Za-z0-9_-]+)$/);
    if (!match) {
      setErrorMsg('无效的报表分享链接');
      setState('error');
      return;
    }
    const matchedToken = match[1];
    setToken(matchedToken);
    void getReportLinkShare(matchedToken)
      .then((data) => {
        setShare(data);
        document.title = `${data.title || '分享看板'} - Biz-Hub`;
        setState('ok');
      })
      .catch((e) => {
        if (isAclError(e)) {
          setErrorMsg('请先登录并确认你具备 Biz-Hub user 访问权限');
        } else {
          setErrorMsg(e instanceof Error ? e.message : '加载失败');
        }
        setState('error');
      });
  }, []);

  // 看板分享：加入当前用户报表区（作为「可查看」报表）并跳转到报表详情页。
  // 权限校验保留：无 Biz-Hub 访问权限时提示，不落地。
  async function handleOpenReport() {
    if (openState === 'loading' || !token) return;
    setOpenErr('');
    setOpenState('loading');
    try {
      const data = await importReportLinkShare(token);
      window.location.href = data.url;
    } catch (e) {
      if (isAclError(e)) {
        setOpenErr('无访问权限');
      } else {
        setOpenErr(e instanceof Error ? e.message : '打开看板失败');
      }
      setOpenState('idle');
    }
  }

  if (state === 'loading') return <div className={styles.loading}>正在加载分享看板...</div>;

  if (state === 'error') {
    return (
      <div className={styles.error}>
        <div className={styles.errorIcon}>链接</div>
        <h2 className={styles.errorTitle}>无法加载看板分享</h2>
        <p className={styles.errorDesc}>{errorMsg}</p>
      </div>
    );
  }

  return (
    <>
      {share?.owner && <Watermark text={`${share.owner}的看板分享`} />}

      <div className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <BrandLogo size="sm" />
          <div className={styles.meta}>
            <div className={styles.title}>{share?.title || '分享看板'}</div>
            <div className={styles.creator}>
              <span>{share?.owner || '匿名'} 的看板分享</span>
              {share?.updatedAt && (
                <>
                  <span className={styles.dot} />
                  <span>{fmtDate(share.updatedAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className={styles.topbarRight}>
          {openErr && <span className={styles.btnError} role="alert" title={openErr}>{openErr}</span>}
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleOpenReport}
            disabled={openState === 'loading' || !token}
            aria-busy={openState === 'loading'}
          >
            <span className={styles.labelDesktop}>{openState === 'loading' ? '正在打开...' : '查看报表'}</span>
            <span className={styles.labelMobile}>{openState === 'loading' ? '...' : '看板'}</span>
          </button>
        </div>
      </div>

      <main className={`${styles.body} ${styles.reportShareBody}`}>
        <section className={styles.reportShareCard} aria-label="分享看板预览">
          {token && (
            <iframe
              className={styles.reportShareFrame}
              src={reportShareViewUrl(token)}
              title={share?.title || '分享看板'}
              sandbox="allow-scripts allow-same-origin"
            />
          )}
        </section>
      </main>

      <div className={styles.footer}>由 Biz-Hub 生成的看板分享</div>
    </>
  );
}
