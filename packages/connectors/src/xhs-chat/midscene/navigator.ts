// 从 mcp-xhs-chat/src/xhs/navigator.ts 逐字移植。
// 中文提示词是反复踩坑调出来的，不要"优化"。
import { ErrorCode } from "./errors.js";
import { createToolLogger } from "./logger.js";

const logger = createToolLogger("xhs-navigator");

const XHS_PACKAGE_NAME = "com.xingin.xhs";

interface MidsceneAgent {
  launch: (uri: string) => Promise<void>;
  aiAct: (taskPrompt: string, opt?: { cacheable?: boolean }) => Promise<string | undefined>;
  aiBoolean: (prompt: string) => Promise<boolean>;
}

/**
 * 检查当前是否在目标用户的私信聊天页。
 * 必须用只读的 aiBoolean —— 早期用 aiAct("只观察不操作") 会被模型执行成动作
 * （实测点开了右上角"..."进了聊天设置页），破坏后续发送。
 */
export async function checkCurrentChatPage(agent: unknown, targetUsername?: string): Promise<boolean> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info({ targetUsername }, "Checking if already in target chat page");

  // 没有用户名无法判定是否在目标聊天页，直接走导航流程。
  if (!targetUsername) {
    return false;
  }

  try {
    const inChat = await midsceneAgent.aiBoolean(
      `当前界面是否正处于与用户"${targetUsername}"的私信聊天对话页面（顶部标题是该用户名，底部有消息输入框）？`,
    );
    logger.info({ targetUsername, inChat }, "Chat page check result");
    return inChat === true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage }, "Failed to check current page, assuming not in chat");
    return false;
  }
}

export async function launchXhsApp(agent: unknown): Promise<void> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info("Launching XHS app");

  try {
    await midsceneAgent.launch(XHS_PACKAGE_NAME);
    logger.info("XHS app launched successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Failed to launch XHS app");

    if (errorMessage.includes("not installed") || errorMessage.includes("not found")) {
      throw new Error(ErrorCode.XHS_APP_NOT_INSTALLED);
    }

    throw new Error(`${ErrorCode.XHS_APP_NOT_INSTALLED}: ${errorMessage}`);
  }
}

export async function searchUser(agent: unknown, userId: string, username?: string): Promise<void> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info({ userId, username }, "Searching for user");

  // 有昵称用昵称搜，缺则只用小红书号。
  const searchTerm = username ? `"${username}"（小红书号: ${userId}）` : `小红书号 "${userId}"`;
  const inputHint = username ? `"${username}" 或 "${userId}"` : `"${userId}"`;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 使用更明确的提示词，避免 AI 返回 Take_over 等不支持的动作
      const searchPrompt = `找到用户 ${searchTerm} 并进入其主页。

具体步骤：
1. 点击搜索框
2. 输入 ${inputHint}
3. 点击搜索按钮或搜索结果中该用户的头像/名称
4. 确认进入了用户主页

注意：直接执行点击操作，不要请求用户确认。`;

      await midsceneAgent.aiAct(searchPrompt);

      logger.info({ userId, username, attempt }, "User found successfully");
      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      lastError = error instanceof Error ? error : new Error(errorMessage);
      logger.warn({ userId, username, attempt, error: errorMessage }, "Search attempt failed");

      // 如果是 Take_over 错误，重试
      if (errorMessage.includes("Take_over")) {
        logger.info({ attempt }, "Retrying due to Take_over error");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      // 其他错误直接抛出
      throw new Error(`${ErrorCode.USER_NOT_FOUND}: ${errorMessage}`);
    }
  }

  // 所有重试都失败了
  throw new Error(`${ErrorCode.USER_NOT_FOUND}: ${lastError?.message || "Max retries exceeded"}`);
}

export async function enterChatPage(agent: unknown): Promise<void> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info("Entering chat page");

  try {
    const prompt = `找到并点击"私信"按钮，进入私信聊天页面。

步骤：
1. 在当前页面找到"私信"按钮
2. 点击该按钮
3. 确认进入了私信/聊天页面`;

    await midsceneAgent.aiAct(prompt);

    logger.info("Entered chat page successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMessage }, "Failed to enter chat page");

    throw new Error(`${ErrorCode.BLOCKED}: ${errorMessage}`);
  }
}

export async function scrollToBottom(agent: unknown): Promise<void> {
  const midsceneAgent = agent as MidsceneAgent;
  logger.info("Scrolling to bottom of chat");

  try {
    // 使用 AndroidDevice 的 scrollUntilBottom 方法
    const androidDevice = (midsceneAgent as any).page;
    if (androidDevice && typeof androidDevice.scrollUntilBottom === "function") {
      await androidDevice.scrollUntilBottom();
      logger.info("Scrolled to bottom using AndroidDevice API");
    } else {
      // 后备方案：使用 aiAct 滚动
      const prompt = `在聊天界面执行滚动操作：

动作：从屏幕底部向上滑动，滚动到聊天最底部查看最新消息。

注意：这是滚动操作，不要输入任何文字。`;
      await midsceneAgent.aiAct(prompt);
      logger.info("Scrolled to bottom using aiAct");
    }

    // 等待一下让界面稳定
    await new Promise((resolve) => setTimeout(resolve, 500));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errorMessage }, "Failed to scroll to bottom, continuing anyway");
    // 不抛出错误，继续执行
  }
}
