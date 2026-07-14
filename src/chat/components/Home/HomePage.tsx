import { useCallback, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useSessionStore } from '../../store/useSessionStore';
import type { ShellOutletContext } from '../Shell/AppShell';
import HomeHero from './HomeHero';
import HomeSearch from './HomeSearch';
import HomeChips from './HomeChips';
import styles from './HomePage.module.css';

export default function HomePage() {
  const shell = useOutletContext<ShellOutletContext | undefined>();
  const isMobile = shell?.isMobile ?? false;
  const navigate = useNavigate();

  const user = useSessionStore((s) => s.user);
  const newSession = useSessionStore((s) => s.newSession);
  const patchSession = useSessionStore((s) => s.patchSession);

  const [draft, setDraft] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (text: string, options?: { visualize?: boolean }) => {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const session = await newSession();
      if (!session) {
        setSubmitError('创建对话失败，请稍后重试');
        return;
      }
      const shortTitle = text.length > 30 ? text.slice(0, 30) + '...' : text;
      patchSession(session.sessionId, { title: shortTitle });
      navigate(`/c/${session.sessionId}`, { state: { initialPrompt: text, initialVisualize: options?.visualize } });
    } catch {
      setSubmitError('网络异常，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  }, [newSession, patchSession, navigate, submitting]);

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <HomeHero loginName={user?.loginName} />

        <div className={styles.searchWrap}>
          <HomeSearch
            value={draft}
            onChange={setDraft}
            onSubmit={(v, options) => void handleSubmit(v, options)}
            placeholder="输入你的问题，开始分析..."
            autoFocus={!isMobile}
            disabled={submitting}
            inputRef={searchInputRef}
          />
          {submitError && (
            <p className={styles.submitError}>{submitError}</p>
          )}
        </div>

        <div className={styles.hiddenChipsSlot} aria-hidden="true">
          <HomeChips
            onSelect={(q) => {
              setDraft(q);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          />
        </div>
      </div>
    </div>
  );
}
