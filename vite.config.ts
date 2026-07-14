import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';
import fs from 'fs';

// 自定义插件：将 Vite 输出的 dist/chat/index.html 等多页产物拍平到 dist 根目录
function flattenHtmlEntries(): Plugin {
  return {
    name: 'flatten-html-entries',
    closeBundle() {
      const webDir = path.resolve(__dirname, 'dist');
      const moves: Array<[string, string, string]> = [
        [path.join(webDir, 'chat/index.html'), path.join(webDir, 'index.html'), path.join(webDir, 'chat')],
        [path.join(webDir, 'skillhub/skill-hub.html'), path.join(webDir, 'skill-hub.html'), path.join(webDir, 'skillhub')],
        [path.join(webDir, 'share/share.html'), path.join(webDir, 'share.html'), path.join(webDir, 'share')],
        [path.join(webDir, 'admin/admin.html'), path.join(webDir, 'admin.html'), path.join(webDir, 'admin')],
      ];
      for (const [src, dest, dir] of moves) {
        if (fs.existsSync(src)) {
          fs.renameSync(src, dest);
          try { fs.rmdirSync(dir); } catch (_) {}
        }
      }
    },
  };
}

// mock 引导脚本已直接写入 4 个 HTML 入口（<script src="/mock/bootstrap.ts">，
// 位于应用主脚本之前），会随 Vite 构建进入模块图并被打包/hash。
// 此插件只负责把硬编码的 /static/favicon.svg 修正为 base='/' 下的 /favicon.svg。
function fixFavicon(): Plugin {
  return {
    name: 'fix-favicon-path',
    transformIndexHtml(html) {
      return html.replace(/\/static\/favicon\.svg/g, '/favicon.svg');
    },
  };
}

// serve / preview 下把 SPA 路由重写到对应 HTML 入口（等价 EdgeOne clean-URL 重写）。
function spaRewrite(): Plugin {
  const rewrite = (rawUrl: string): string | undefined => {
    const pathOnly = rawUrl.split('?')[0].split('#')[0];
    if (
      pathOnly.startsWith('/api') ||
      pathOnly.startsWith('/admin/api') ||
      pathOnly.startsWith('/skill-hub/api') ||
      pathOnly.startsWith('/mock') ||
      pathOnly.startsWith('/@') ||
      pathOnly.startsWith('/node_modules') ||
      pathOnly.startsWith('/__vite') ||
      /\.[a-zA-Z0-9]+($|\?)/.test(pathOnly)
    ) {
      return undefined;
    }
    const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
    return pathOnly;
  };

  const middleware = (isServe: boolean) => (req: any, _res: any, next: any) => {
    const rawUrl = req.url || '';
    const p = rewrite(rawUrl);
    if (p === undefined) return next();
    const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
    // serve 模式指向源 HTML（root=src）；preview 模式指向拍平后的产物
    if (isServe) {
      if (p === '/skill-hub' || p.startsWith('/skill-hub/')) req.url = '/skillhub/skill-hub.html' + qs;
      else if (p === '/admin' || p.startsWith('/admin/')) req.url = '/admin/admin.html' + qs;
      else if (p === '/share' || p.startsWith('/s/')) req.url = '/share/share.html' + qs;
      else if (p === '/' || p === '/chat' || p.startsWith('/chat/')) req.url = '/chat/index.html' + qs;
    } else {
      if (p === '/skill-hub' || p.startsWith('/skill-hub/')) req.url = '/skill-hub.html' + qs;
      else if (p === '/admin' || p.startsWith('/admin/')) req.url = '/admin.html' + qs;
      else if (p === '/share' || p.startsWith('/s/')) req.url = '/share.html' + qs;
      else if (p === '/' || p === '/chat' || p.startsWith('/chat/')) req.url = '/index.html' + qs;
    }
    next();
  };

  return {
    name: 'spa-rewrite',
    configureServer(server) {
      server.middlewares.use(middleware(true));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(false));
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [fixFavicon(), react(), flattenHtmlEntries(), spaRewrite()],
    root: 'src',
    // Demo 站部署在域名根路径（EdgeOne Pages），base 固定为 '/'
    base: '/',
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared'),
        '@chat': path.resolve(__dirname, 'src/chat'),
        '@skillhub': path.resolve(__dirname, 'src/skillhub'),
        '@admin': path.resolve(__dirname, 'src/admin'),
      },
    },
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: false,
      rollupOptions: {
        input: {
          index:    path.resolve(__dirname, 'src/chat/index.html'),
          skillHub: path.resolve(__dirname, 'src/skillhub/skill-hub.html'),
          share:    path.resolve(__dirname, 'src/share/share.html'),
          admin:    path.resolve(__dirname, 'src/admin/admin.html'),
        },
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            marked: ['marked', 'dompurify'],
            tdesign: ['tdesign-react', 'tdesign-icons-react'],
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
    },
  };
});
