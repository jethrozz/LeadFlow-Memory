import { useEffect, useRef, useState } from "react";
import { fetchActiveDevice, fetchDeviceScreenshot } from "./api";
import { useI18n } from "./i18n";

const POLL_MS = 700;
const FAIL_THRESHOLD = 5;

type ScreenStatus = "connecting" | "live" | "no-device" | "stalled";

export function DeviceScreen() {
  const { t } = useI18n();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);
  const [status, setStatus] = useState<ScreenStatus>("connecting");
  const inFlight = useRef(false);
  const failCount = useRef(0);

  // 1) 解析要轮询的设备 id
  useEffect(() => {
    let active = true;
    fetchActiveDevice()
      .then((d) => {
        if (!active) return;
        if (d?.deviceId) setDeviceId(d.deviceId);
        else setStatus("no-device");
      })
      .catch(() => active && setStatus("no-device"));
    return () => {
      active = false;
    };
  }, []);

  // 2) 轮询截图
  useEffect(() => {
    if (!deviceId) return;
    let stopped = false;

    async function tick() {
      if (stopped || inFlight.current || document.hidden) return;
      inFlight.current = true;
      try {
        const shot = await fetchDeviceScreenshot(deviceId!);
        if (stopped) return;
        setFrame(shot.imageDataUrl);
        setCapturedAt(shot.capturedAt);
        setStatus("live");
        failCount.current = 0;
      } catch {
        failCount.current += 1;
        if (failCount.current >= FAIL_THRESHOLD) {
          setStatus((s) => (s === "live" ? "stalled" : "no-device"));
        }
      } finally {
        inFlight.current = false;
      }
    }

    const timer = setInterval(tick, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [deviceId]);

  const time = capturedAt
    ? new Date(capturedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "";

  return (
    <div className="device-screen">
      <div className="device-screen-head">
        <span className="device-title">{t("deviceTitle")}</span>
        <span className={`device-live device-live-${status}`}>
          {status === "live" && <>● LIVE {time}</>}
          {status === "connecting" && t("deviceConnecting")}
          {status === "no-device" && t("deviceNoDevice")}
          {status === "stalled" && t("deviceStalled")}
        </span>
      </div>
      <div className="device-frame">
        {frame ? (
          <img className="device-img" src={frame} alt={t("deviceTitle")} />
        ) : (
          <div className="device-placeholder">
            {status === "no-device" ? t("deviceWaitSession") : t("deviceWaitFrame")}
          </div>
        )}
      </div>
    </div>
  );
}
