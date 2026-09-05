# 陪伴形象生成记录

- 参考：用户确认的根目录 `5.jpg` 中探出绿色列车窗口的白色毛茸茸小家伙。
- 方式：内置 `image_gen`。本地参考路径读取失败，已查看图片后将视觉特征整理成文字提示词生成；未使用 API/CLI 回退。
- 输出：`product/src/renderer/public/fluffy-cat.png`（透明 PNG，保留生成的 alpha 通道）。
- 当前使用位置：左侧导航下方、存储提示上方，三个页面共用；窄屏顶部导航模式下隐藏。生成时原计划置于右侧，后按用户要求移回左侧，图片与生成提示词保持不变。
- 范围：替换旧的 SVG 吉祥物与展示位置，保留排程、进度和倒计时实现。

## 完整生成提示词

```text
Generate a finished transparent PNG mascot illustration for a gentle sage-green personal to-do app. Exactly one very cute white fluffy kitten, using this observed visual reference description: a little white creature peeking out of a mossy green train window has a round pear-shaped fluffy white body, tiny soft triangular ears, widely spaced black dot eyes, a minimal tiny mouth and faint apricot blush. Reinterpret that innocent soft forest-storybook character as a standalone kitten, not the train scene.
The kitten is a plump fluffy white mochi-like little friend, large round body and tiny rounded triangular cat ears. Very small widely spaced dark dot eyes, tiny delicate content mouth, peach-pink round cheeks, little front paws resting forward, little feet, tiny fluffy curled tail. Childlike rounded proportions, gentle slightly shy expression. No clothes, no accessories.
Medium: beautiful hand-painted 2D storybook illustration with delicate warm-gray pencil outlines, soft gouache shading, short irregular fur tufts along its silhouette. Cream-white fur with very pale sage reflected shading. NOT a flat vector icon, NOT a realistic cat, NOT a glossy 3D toy, NOT giant anime eyes.
Full body facing forward sitting calmly, centered in a square canvas, filling 82 percent of frame, ears and paws fully in frame. Designed to remain readable at 160–220 CSS pixels. Genuinely transparent alpha background with clean fluffy edges, no opaque panel, no painted checkerboard, no scenery or floor. Very subtle small contact shadow under paws only. No text, no logo, no watermark. Exactly one character.
```
