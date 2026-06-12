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
  getConversation(input: XhsGetConversationInput): Promise<XhsConversationMessage[]>;
  sendPrivateMessage(input: XhsSendPrivateMessageInput): Promise<XhsSendPrivateMessageResult>;
};
