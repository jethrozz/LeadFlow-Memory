// 从 mcp-xhs-chat/src/xhs/chat.ts 逐字移植。
import { ErrorCode } from "./errors.js";
import { createToolLogger } from "./logger.js";

const logger = createToolLogger("xhs-chat");

interface MidsceneAgent {
  aiInput: (
    locate: string,
    opt: {
      value: string | number;
      mode?: "replace" | "clear" | "typeOnly";
      cacheable?: boolean;
    },
  ) => Promise<void>;
  aiKeyboardPress: (locate: string, opt: { keyName: string; cacheable?: boolean }) => Promise<void>;
  aiTap: (locate: string, opt?: { cacheable?: boolean }) => Promise<void>;
  aiBoolean: (prompt: string) => Promise<boolean>;
}

const INPUT_BOX = "屏幕底部的消息文字输入框（左侧语音图标右边、表情图标左边的文本输入区域）";

/**
 * 发送私信。
 * 关键点 1（小红书 bug）：自动化直接输入会把"发消息…"占位符并进正文，
 *   绕过办法是先在输入框按一次回车，再输入正文。
 * 关键点 2（防刷屏）：发送后用"输入框是否清空"判断是否成功；
 *   重试只重点发送键、绝不重新打字，避免误判导致重复发送。
 * 关键点 3（防误分享）：发送只点打字后出现的发送按钮，不点加号/对方笔记卡片。
 */
export async function sendMessage(agent: unknown, message: string): Promise<void> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info({ messageLength: message.length }, "Sending message");

  // Step 0a: 先点输入框聚焦、打开键盘。否则未聚焦时按回车会被当成返回/导航离开聊天页。
  logger.info("聚焦输入框");
  await midsceneAgent.aiTap(INPUT_BOX);

  // Step 0b: 按回车 —— 绕过小红书"发消息…"占位符并进正文的 bug（此时已聚焦）。
  logger.info("输入回车（绕过占位符 bug）");
  await midsceneAgent.aiKeyboardPress(INPUT_BOX, { keyName: "Enter", cacheable: false });

  // Step 1: 输入正文。
  logger.info("输入消息内容");
  await midsceneAgent.aiInput(INPUT_BOX, { value: message, mode: "typeOnly", cacheable: false });

  // Step 2: 校验文字确实进了输入框（grounding 失败时不空发）。
  const hasText = await midsceneAgent.aiBoolean(
    '屏幕底部的消息输入框里现在是否已经有输入的文字内容（不是空的"发消息"占位符）？',
  );
  if (!hasText) {
    throw new Error(`${ErrorCode.SEND_FAILED}: 文字未成功输入到输入框`);
  }

  // Step 3: 点发送 + 校验"输入框已清空"=发送成功。重试只重点发送键、不重新打字。
  const maxSendTaps = 3;
  for (let attempt = 1; attempt <= maxSendTaps; attempt++) {
    logger.info({ attempt }, "点击发送按钮");
    try {
      await midsceneAgent.aiTap(
        '输入框最右侧那个打字后才出现的"发送"按钮（蓝色或红色）；不要点加号、不要点聊天里的笔记卡片',
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn({ attempt, error: msg }, "Tap send failed");
      if (attempt >= maxSendTaps) throw new Error(`${ErrorCode.SEND_FAILED}: 未找到发送按钮`);
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }

    const boxEmptied = await midsceneAgent.aiBoolean(
      '屏幕底部的消息输入框现在是否已经清空了（刚才输入的文字已消失，只剩"发消息"占位符，说明已发出）？',
    );
    if (boxEmptied) {
      logger.info({ attempt }, "消息发送成功");
      return;
    }
    logger.warn({ attempt }, "发送后输入框仍有文字，重试点发送（不重新打字）");
    await new Promise((r) => setTimeout(r, 800));
  }

  throw new Error(`${ErrorCode.SEND_FAILED}: 多次点击发送后输入框仍未清空`);
}
