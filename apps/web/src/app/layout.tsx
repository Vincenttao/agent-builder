import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agent Builder',
  description:
    '自然语言生成基于 OpenJiuwen 的 Python Agent/Workflow 工程，并运行、测试、查看源码与导出。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
