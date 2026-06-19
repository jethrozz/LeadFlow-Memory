import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsGetConversationResult,
  XhsScreenshotResult,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";

type XhsMcpStdioClientOptions = {
  command: string;
  args: string[];
  cwd: string;
  /** 单次工具调用超时（毫秒）。Midscene 设备自动化很慢（启动 App+搜索+发送），默认 180s。 */
  callTimeoutMs?: number;
  /** 传输/超时类失败的最大重试次数（不含首次）。默认 1。 */
  maxRetries?: number;
};

const DEFAULT_CALL_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_RETRIES = 1;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// mcp-xhs-chat 工具的原始返回（蛇形字段）。逻辑失败用 success:false 文本返回，不设 MCP isError。
type ServerError = { success: false; error: { code: string; message: string }; device_id?: string };
type ServerConnectResult = ServerError | { success: true; device_id: string; connected_at: string };
type ServerDisconnectResult = ServerError | { success: true; device_id: string };
type ServerSendResult =
  | ServerError
  | { success: true; device_id: string; xhs_user_id: string; message_sent: string; sent_at: string };
type ServerChatMessage = { from: "me" | "them"; content: string; time: string };
type ServerGetConversationResult =
  | ServerError
  | {
      success: true;
      device_id: string;
      xhs_user_id: string;
      messages: ServerChatMessage[];
      total: number;
      raw_content?: string;
    };

export class XhsMcpStdioClient implements XhsChatClient {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;

  constructor(private readonly options: XhsMcpStdioClientOptions) {}

  // Device connection state lives inside the mcp-xhs-chat process; reuse the same connection.
  private getClient(): Promise<Client> {
    if (this.client) {
      return Promise.resolve(this.client);
    }
    if (!this.connecting) {
      this.connecting = (async () => {
        const transport = new StdioClientTransport({
          command: this.options.command,
          args: this.options.args,
          cwd: this.options.cwd,
        });
        const client = new Client({ name: "leadflow-api", version: "0.1.0" });
        await client.connect(transport);
        this.client = client;
        return client;
      })().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  async connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    const res = await this.callTool<ServerConnectResult>("xhs_connect_device", {
      device_id: input.deviceId,
      adb_address: input.adbAddress ?? input.deviceId,
    });
    return {
      deviceId: res.device_id,
      status: "connected",
      adbAddress: input.adbAddress,
      updatedAt: res.connected_at,
    };
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    const res = await this.callTool<ServerDisconnectResult>("xhs_disconnect_device", {
      device_id: input.deviceId,
    });
    return {
      deviceId: res.device_id,
      status: "disconnected",
      adbAddress: input.adbAddress,
      updatedAt: new Date().toISOString(),
    };
  }

  async getConversation(input: XhsGetConversationInput): Promise<XhsGetConversationResult> {
    const res = await this.callTool<ServerGetConversationResult>("xhs_get_conversation", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      since_time: input.sinceTime,
    });
    const messages: XhsConversationMessage[] = res.messages.map((msg, index) => ({
      id: `xhs_${res.device_id}_${index}`,
      direction: msg.from === "me" ? "outbound" : "inbound",
      content: msg.content,
      sentAt: msg.time,
    }));
    return { messages, rawContent: res.raw_content };
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    const res = await this.callTool<ServerSendResult>("xhs_send_private_message", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      message: input.message,
    });
    return {
      status: "sent",
      sentAt: res.sent_at,
    };
  }

  async getScreenshot(_input: XhsDeviceInput): Promise<XhsScreenshotResult> {
    throw new Error("NOT_SUPPORTED: getScreenshot is unavailable in legacy MCP stdio mode");
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  private async callTool<T extends { success: boolean }>(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Extract<T, { success: true }>> {
    const client = await this.getClient();
    const timeout = this.options.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
    const maxRetries = this.options.maxRetries ?? DEFAULT_MAX_RETRIES;

    // 仅对传输层/超时失败重试；工具自身的 isError / success:false 在循环外处理一次，不重试。
    let result: Awaited<ReturnType<typeof client.callTool>> | undefined;
    let lastErr: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout });
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) await sleep(1000 * (attempt + 1));
      }
    }
    if (lastErr) throw lastErr;
    if (!result) throw new Error(`mcp-xhs-chat ${tool} returned no result`);

    if (result.isError) {
      throw new Error(`mcp-xhs-chat ${tool} failed: ${JSON.stringify(result.content)}`);
    }
    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new Error(`mcp-xhs-chat ${tool} returned no text content`);
    }
    const parsed = JSON.parse(textBlock.text) as T;
    // 逻辑失败：server 用 success:false + error 文本返回，需主动抛出，否则被当成功吞掉。
    if (parsed.success === false) {
      const err = (parsed as unknown as ServerError).error;
      throw new Error(`mcp-xhs-chat ${tool} failed [${err?.code}]: ${err?.message}`);
    }
    return parsed as Extract<T, { success: true }>;
  }
}
