export type XhsConversationMessage = {
  id: string;
  direction: "inbound" | "outbound";
  content: string;
  sentAt: string;
};

export type XhsLeadIdentity = {
  deviceId: string;
  xhsUserId?: string;
  xhsUsername?: string;
};

export type XhsGetConversationInput = XhsLeadIdentity & {
  sinceTime?: string;
};

// mcp-xhs-chat 返回 best-effort 解析的 messages + 原始屏幕文本 rawContent。
// rawContent 供调用方（LeadFlow）的 LLM 重解析，messages 仅作回退。
export type XhsGetConversationResult = {
  messages: XhsConversationMessage[];
  rawContent?: string;
};

export type XhsSendPrivateMessageInput = XhsLeadIdentity & {
  message: string;
};

export type XhsSendPrivateMessageResult = {
  status: "sent";
  remoteMessageId?: string;
  sentAt: string;
};

export type XhsDeviceInput = {
  deviceId: string;
  adbAddress?: string;
};

export type XhsDeviceResult = {
  deviceId: string;
  status: "connected" | "disconnected";
  adbAddress?: string;
  updatedAt: string;
};

export type XhsChatClient = {
  connectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  disconnectDevice(input: XhsDeviceInput): Promise<XhsDeviceResult>;
  getConversation(input: XhsGetConversationInput): Promise<XhsGetConversationResult>;
  sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult>;
};
