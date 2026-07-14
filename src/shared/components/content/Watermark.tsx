import { useEffect } from 'react';

interface Props {
  text: string;
}

/**
 * 纯副作用水印组件，return null。
 * MutationObserver 双防护：防 style 篡改（自愈）+ 防 DOM 删除（重建）。
 * 仅在授权用户分支渲染，未登录/ACL 拒绝用户不渲染。
 */
function Watermark({ text }: Props) {
  useEffect(() => {
    if (!text) return;

    const safeText = text.replace(/[&<>"']/g, (c) => (
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' } as Record<string, string>)[c]
    ));

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="110">` +
      `<text x="0" y="70" fill="#1d2129" font-size="12" ` +
      `font-family="-apple-system,BlinkMacSystemFont,PingFang SC,Microsoft YaHei,sans-serif" ` +
      `transform="rotate(-22 45 70)">${safeText}</text>` +
      `</svg>`;

    const bgUrl = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

    let node: HTMLDivElement;

    function build(): HTMLDivElement {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      Object.assign(el.style, {
        position: 'fixed',
        inset: '0',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: '9998',
        opacity: '0.064',
        backgroundRepeat: 'repeat',
        backgroundImage: bgUrl,
      });
      document.body.appendChild(el);
      return el;
    }

    node = build();

    const selfObs = new MutationObserver(() => {
      const st = node.style;
      if (
        st.display === 'none' ||
        st.visibility === 'hidden' ||
        st.opacity === '0' ||
        st.backgroundImage === 'none' ||
        st.backgroundImage === ''
      ) {
        st.display = '';
        st.visibility = '';
        st.opacity = '0.064';
        st.backgroundImage = bgUrl;
      }
    });
    selfObs.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });

    const bodyObs = new MutationObserver(() => {
      if (!document.body.contains(node)) {
        node = build();
        selfObs.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
      }
    });
    bodyObs.observe(document.body, { childList: true });

    return () => {
      selfObs.disconnect();
      bodyObs.disconnect();
      if (document.body.contains(node)) {
        document.body.removeChild(node);
      }
    };
  }, [text]);

  return null;
}

export default Watermark;
