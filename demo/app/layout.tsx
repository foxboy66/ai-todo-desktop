import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI ToDo · 今日执行台',
  description: '帮助你规划、开始并完成今日任务的 AI ToDo 交互原型。',
  metadataBase: new URL('https://ai-todo-focus-demo.dear-scout-7480.chatgpt.site'),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
