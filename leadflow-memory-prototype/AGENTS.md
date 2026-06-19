# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## 国际化（i18n）

支持中英文切换，由 `src/i18n.js`（`LanguageProvider` + `useI18n`）驱动，右上角 `中文 / EN` 切换按钮，语言写入 `localStorage`（key `leadflow-lang`），默认中文。

**翻译范围约定**：只翻译界面 chrome（按钮、标题、字段标签、tab 等）。演示数据（线索姓名、来源信号、客户回复、时间线 label/summary、记忆值等）保持中文不翻译。新增界面文案时在 `translations` 的 `zh`/`en` 两份字典里同步加 key，并用 `t('key')` 引用；不要用中文字符串做状态判断（用稳定 key/id）。
