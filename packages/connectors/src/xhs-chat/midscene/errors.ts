// 从 mcp-xhs-chat/src/types/index.ts 移植：错误码 + 内部类型。

export enum ErrorCode {
  ADB_NOT_FOUND = "ADB_NOT_FOUND",
  DEVICE_OFFLINE = "DEVICE_OFFLINE",
  DEVICE_UNAUTHORIZED = "DEVICE_UNAUTHORIZED",
  CONNECT_FAILED = "CONNECT_FAILED",
  DEVICE_NOT_CONNECTED = "DEVICE_NOT_CONNECTED",
  XHS_APP_NOT_INSTALLED = "XHS_APP_NOT_INSTALLED",
  USER_NOT_FOUND = "USER_NOT_FOUND",
  BLOCKED = "BLOCKED",
  RATE_LIMITED = "RATE_LIMITED",
  NETWORK_ERROR = "NETWORK_ERROR",
  SEND_FAILED = "SEND_FAILED",
  GET_FAILED = "GET_FAILED",
}

// 聊天消息（内部表示，from='me' 表示当前登录账号自己发的）。
export interface ChatMessage {
  from: "me" | "them";
  content: string;
  time: string; // ISO format
}

// Midscene 模型配置。
export interface MidsceneConfig {
  apiKey: string;
  modelName: string;
  baseUrl: string;
  modelFamily: string;
}
