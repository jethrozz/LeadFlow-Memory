// 设备连接管理 + Android agent 创建 + Midscene 配置加载。
// 合并自 mcp-xhs-chat 的 device/manager.ts + device/midscene.ts + utils/config.ts。
import { agentFromAdbDevice } from "@midscene/android";
import type { AndroidAgent } from "@midscene/android";
import { ErrorCode, type MidsceneConfig } from "./errors.js";
import { createToolLogger } from "./logger.js";

const logger = createToolLogger("device");

export function loadMidsceneConfig(env: NodeJS.ProcessEnv = process.env): MidsceneConfig {
  return {
    apiKey: env.MIDSCENE_MODEL_API_KEY || "",
    modelName: env.MIDSCENE_MODEL_NAME || "glm-4v-flash",
    baseUrl: env.MIDSCENE_MODEL_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
    modelFamily: env.MIDSCENE_MODEL_FAMILY || "glm",
  };
}

async function createAndroidAgent(adbAddress: string, config: MidsceneConfig): Promise<AndroidAgent> {
  if (!adbAddress) {
    throw new Error("ADB address is required");
  }

  // Midscene 通过环境变量读取模型配置。
  process.env.MIDSCENE_MODEL_API_KEY = config.apiKey;
  process.env.MIDSCENE_MODEL_NAME = config.modelName;
  process.env.MIDSCENE_MODEL_BASE_URL = config.baseUrl;
  process.env.MIDSCENE_MODEL_FAMILY = config.modelFamily;

  logger.info({ adbAddress }, "Creating Android agent");
  const agent = await agentFromAdbDevice(adbAddress);
  logger.info({ adbAddress }, "Android agent created successfully");
  return agent;
}

interface DeviceConnection {
  deviceId: string;
  adbAddress: string;
  connectedAt: Date;
  agent: AndroidAgent;
}

export interface ConnectResult {
  deviceId: string;
  connectedAt: string;
}

// 设备连接池：连接状态随客户端实例存活，复用同一 agent。
export class DevicePool {
  private readonly pool = new Map<string, DeviceConnection>();

  constructor(private readonly config: MidsceneConfig) {}

  async connect(deviceId: string, adbAddress: string): Promise<ConnectResult> {
    logger.info({ deviceId, adbAddress }, "Connecting device");

    const existing = this.pool.get(deviceId);
    if (existing) {
      logger.info({ deviceId }, "Device already connected");
      return { deviceId, connectedAt: existing.connectedAt.toISOString() };
    }

    try {
      const agent = await createAndroidAgent(adbAddress, this.config);
      const connection: DeviceConnection = {
        deviceId,
        adbAddress,
        connectedAt: new Date(),
        agent,
      };
      this.pool.set(deviceId, connection);
      logger.info({ deviceId }, "Device connected successfully");
      return { deviceId, connectedAt: connection.connectedAt.toISOString() };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ deviceId, error: errorMessage }, "Device connection failed");

      let errorCode = ErrorCode.CONNECT_FAILED;
      if (errorMessage.includes("offline") || errorMessage.includes("unreachable")) {
        errorCode = ErrorCode.DEVICE_OFFLINE;
      } else if (errorMessage.includes("unauthorized")) {
        errorCode = ErrorCode.DEVICE_UNAUTHORIZED;
      } else if (errorMessage.includes("ADB not found") || errorMessage.includes("adb: not found")) {
        errorCode = ErrorCode.ADB_NOT_FOUND;
      }
      throw new Error(`${errorCode}: ${errorMessage}`);
    }
  }

  disconnect(deviceId: string): void {
    logger.info({ deviceId }, "Disconnecting device");
    this.pool.delete(deviceId);
  }

  getAgent(deviceId: string): AndroidAgent {
    const connection = this.pool.get(deviceId);
    if (!connection) {
      throw new Error(`Device '${deviceId}' is not connected`);
    }
    return connection.agent;
  }

  isConnected(deviceId: string): boolean {
    return this.pool.has(deviceId);
  }

  clear(): void {
    this.pool.clear();
  }
}
