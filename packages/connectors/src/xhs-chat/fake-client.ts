import type {
  XhsChatClient,
  XhsConversationMessage,
  XhsDeviceInput,
  XhsDeviceResult,
  XhsGetConversationInput,
  XhsSendPrivateMessageInput,
  XhsSendPrivateMessageResult,
} from "./types.js";

export class FakeXhsChatClient implements XhsChatClient {
  private readonly outbound: XhsConversationMessage[] = [];

  async connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return {
      deviceId: input.deviceId,
      adbAddress: input.adbAddress,
      status: "connected",
      updatedAt: new Date().toISOString(),
    };
  }

  async disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult> {
    return {
      deviceId: input.deviceId,
      adbAddress: input.adbAddress,
      status: "disconnected",
      updatedAt: new Date().toISOString(),
    };
  }

  async getConversation(_input: XhsGetConversationInput): Promise<XhsConversationMessage[]> {
    return [
      {
        id: "xhs_msg_001",
        direction: "inbound",
        content: "想看看渝北 130 万以内的三房，新房有没有补贴？",
        sentAt: "2026-06-11T10:00:00.000Z",
      },
      ...this.outbound,
    ];
  }

  async sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult> {
    const message: XhsConversationMessage = {
      id: `xhs_msg_out_${this.outbound.length + 1}`,
      direction: "outbound",
      content: input.message,
      sentAt: new Date().toISOString(),
    };
    this.outbound.push(message);
    return {
      status: "sent",
      remoteMessageId: message.id,
      sentAt: message.sentAt,
    };
  }
}
