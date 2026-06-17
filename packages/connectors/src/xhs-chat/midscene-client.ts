import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsGetConversationResult,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";
import { DevicePool } from "./midscene/device.js";
import type { MidsceneConfig } from "./midscene/errors.js";
import {
  checkCurrentChatPage,
  enterChatPage,
  launchXhsApp,
  scrollToBottom,
  searchUser,
} from "./midscene/navigator.js";
import { sendMessage } from "./midscene/chat.js";
import { extractChatContent } from "./midscene/parser.js";
import { createToolLogger } from "./midscene/logger.js";

const logger = createToolLogger("xhs-midscene-client");

export type XhsMidsceneClientOptions = {
  config: MidsceneConfig;
};

/**
 * 进程内 Midscene 客户端：用 @midscene/android 直接驱动 ADB 真机上的小红书 App，
 * 取代原来通过 stdio 启动 mcp-xhs-chat 子进程的 XhsMcpStdioClient。
 * 编排逻辑直接复刻原 mcp-xhs-chat 的 tools/*.ts handler。
 */
export class XhsMidsceneClient implements XhsChatClient {
  private readonly devices: DevicePool;

  constructor(options: XhsMidsceneClientOptions) {
    this.devices = new DevicePool(options.config);
  }

  async connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    const adbAddress = input.adbAddress ?? input.deviceId;
    const res = await this.devices.connect(input.deviceId, adbAddress);
    return {
      deviceId: res.deviceId,
      status: "connected",
      adbAddress: input.adbAddress,
      updatedAt: res.connectedAt,
    };
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    this.devices.disconnect(input.deviceId);
    return {
      deviceId: input.deviceId,
      status: "disconnected",
      adbAddress: input.adbAddress,
      updatedAt: new Date().toISOString(),
    };
  }

  async getConversation(input: XhsGetConversationInput): Promise<XhsGetConversationResult> {
    const { deviceId, xhsUserId, xhsUsername } = input;
    logger.info({ deviceId, xhsUserId, xhsUsername }, "Handling get conversation request");

    await this.ensureConnected(deviceId);
    const agent = this.devices.getAgent(deviceId);

    // Step 1: 检查是否已经在目标用户的聊天界面
    const alreadyInChat = await checkCurrentChatPage(agent, xhsUsername);

    if (!alreadyInChat) {
      logger.info("Not in target chat page, navigating to it");
      await launchXhsApp(agent);
      await searchUser(agent, xhsUserId ?? "", xhsUsername);
      await enterChatPage(agent);
      await scrollToBottom(agent);
    } else {
      logger.info("Already in target chat page, skipping navigation");
    }

    // Step 2: 提取聊天内容（raw_content 供调用方 LLM 重解析，messages 仅作回退）
    const extractResult = await extractChatContent(agent);
    logger.info(
      { deviceId, xhsUserId, rawContentLength: extractResult.raw_content.length },
      "Conversation extracted successfully",
    );

    const messages: XhsConversationMessage[] = extractResult.messages.map((msg, index) => ({
      id: `xhs_${deviceId}_${index}`,
      direction: msg.from === "me" ? "outbound" : "inbound",
      content: msg.content,
      sentAt: msg.time,
    }));

    return { messages, rawContent: extractResult.raw_content || undefined };
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    const { deviceId, xhsUserId, xhsUsername, message } = input;
    logger.info({ deviceId, xhsUserId, xhsUsername }, "Handling send message request");

    await this.ensureConnected(deviceId);
    const agent = this.devices.getAgent(deviceId);

    // 总是重新导航：跨调用的界面状态会漂移（实测会误判"已在聊天页"而实际停在个人主页/设置页），
    // 每次从启动 App 开始确保落到目标用户的私信聊天页，输入框稳定可见。
    logger.info("Navigating to target chat page (always fresh)");
    await launchXhsApp(agent);
    await searchUser(agent, xhsUserId ?? "", xhsUsername);
    await enterChatPage(agent);

    await sendMessage(agent, message);
    logger.info({ deviceId, xhsUserId }, "Message sent successfully");

    return {
      status: "sent",
      sentAt: new Date().toISOString(),
    };
  }

  async close(): Promise<void> {
    this.devices.clear();
  }

  // 未连接则自动连接（adbAddress 回退用 deviceId），复刻原 handler 的自动连接行为。
  private async ensureConnected(deviceId: string): Promise<void> {
    if (this.devices.isConnected(deviceId)) return;
    logger.info({ deviceId }, "Device not connected, attempting to connect");
    await this.devices.connect(deviceId, deviceId);
    logger.info({ deviceId }, "Device connected successfully");
  }
}
