import styles from './MobilePermissionGuideSheet.module.css';

interface GuideSection {
  key: string;
  title: string;
  desc: string;
}

const SECTIONS: GuideSection[] = [
  {
    key: 'biz',
    title: 'Biz Hub 主页面权限',
    desc: 'admin 来自环境变量；manager 跳过用户数据权限校验；user 执行用户数据权限校验。',
  },
  {
    key: 'skill',
    title: 'Skill Hub 权限',
    desc: 'approval 可审批 Skill 发布；user 可上传和查看 Skill。',
  },
  {
    key: 'console',
    title: '管理后台权限',
    desc: 'admin 来自环境变量；readonly 只能查看权限、数据权限、Session 和日志。',
  },
];

export default function MobilePermissionGuideSheet() {
  return (
    <div className={styles.list}>
      {SECTIONS.map((s) => (
        <article key={s.key} className={styles.item}>
          <h3 className={styles.title}>{s.title}</h3>
          <p className={styles.desc}>{s.desc}</p>
        </article>
      ))}
    </div>
  );
}
