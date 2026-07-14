import { memo, useMemo, Fragment } from 'react';
import styles from './HomeChips.module.css';

export const DEFAULT_CHIPS: readonly string[] = [
  '你可以查询什么数据？',
  '部门本月的毛利环比变化',
  '国内CDN近三个月的回源率趋势',
  '海外主要国家的损益表现',
  'AI相关收入趋势',
];

interface Props {
  onSelect: (q: string) => void;
}

// 每行最多展示的 chip 数量（按字数升序后每 N 个换一行）
const MAX_PER_ROW = 3;

function HomeChips({ onSelect }: Props) {
  // 按字数升序排序：短的在上，长的在下；同行内也是越靠右字数越多。
  // 使用 Array.from(str) 计数，避免代理对（Emoji）被算成 2 个；同字数时保持原顺序（slice 得到稳定排序）。
  const sortedChips = useMemo(() => {
    return DEFAULT_CHIPS.slice().sort(
      (a, b) => Array.from(a).length - Array.from(b).length,
    );
  }, []);

  return (
    <div className={styles.grid}>
      {sortedChips.map((q, index) => {
        // 每 MAX_PER_ROW 个之后强制换行（除了第 0 个）。
        // rowBreak 是一个零高度、占满整行的 flex item，用 flex-basis:100% 把后续 chip 推到下一行。
        const needBreakBefore = index > 0 && index % MAX_PER_ROW === 0;
        return (
          <Fragment key={q}>
            {needBreakBefore && (
              <span className={styles.rowBreak} aria-hidden="true" />
            )}
            <button
              type="button"
              className={styles.chip}
              onClick={() => onSelect(q)}
            >
              {q}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

export default memo(HomeChips);
