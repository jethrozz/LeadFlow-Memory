import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";

type XhsMcpStdioClientOptions = {
  command: string;
  args: string[];
  cwd: string;
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
    return this.callTool<XhsDeviceResult>("xhs_connect_device", {
      device_id: input.deviceId,
      adb_address: input.adbAddress,
    });
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return this.callTool<XhsDeviceResult>("xhs_disconnect_device", {
      device_id: input.deviceId,
    });
  }

  async getConversation(input: XhsGetConversationInput): Promise<XhsConversationMessage[]> {
    return this.callTool<XhsConversationMessage[]>("xhs_get_conversation", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      since_time: input.sinceTime,
    });
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    return this.callTool<XhsSendPrivateMessageResult>("xhs_send_private_message", {
      device_id: input.deviceId,
      xhs_user_id: input.xhsUserId,
      xhs_username: input.xhsUsername,
      message: input.message,
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  private async callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
    const client = await this.getClient();
    const result = await client.callTool({ name: tool, arguments: args });
    if (result.isError) {
      throw new Error(`mcp-xhs-chat ${tool} failed: ${JSON.stringify(result.content)}`);
    }
    const textBlock = (result.content as Array<{ type: string; text?: string }>).find(
      (block) => block.type === "text" && typeof block.text === "string",
    );
    if (!textBlock?.text) {
      throw new Error(`mcp-xhs-chat ${tool} returned no text content`);
    }
    return JSON.parse(textBlock.text) as T;
  }
}
