import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppScreen, ScannedCopy, ScannedCopyDraft } from '@/features/correctai/types';
import { OCR_SERVICE_URL } from '@/constants/api';
import { uploadScannerMultipart } from '@/features/correctai/upload';

type CornerPoint = { x: number; y: number };

type ScannerProps = {
  activeTab?: string;
  onNavigate?: (screen: AppScreen) => void;
  onRegisterAnswerKeyScan?: () => void;
  onRegisterExamScan?: (draft?: ScannedCopyDraft) => ScannedCopy | null;
  scannerMode?: 'copies' | 'key';
  selectedExam?: { questions?: number } | null;
};

const STABILITY_FRAMES = 3;
const DETECTION_INTERVAL_MS = 400;
// Detection snapshots at 0.6 quality: enough for corner detection, not so heavy
// that it saturates the upload pipeline.
const SMALL_PICTURE_QUALITY = 0.6;
const MIN_CAPTURE_INTERVAL_MS = 3000;
// We require 4 consecutive stable frames (at ~2fps, this is about 1.5-2 seconds)
const STABILITY_HISTORY_LENGTH = 4;

/* ---------- Geometry helpers ---------- */

function polygonArea(corners: CornerPoint[]): number {
  if (corners.length < 3) return 0;
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += corners[i].x * corners[j].y;
    area -= corners[j].x * corners[i].y;
  }
  return Math.abs(area) / 2;
}

function documentAspectRatio(corners: CornerPoint[]): number {
  if (corners.length !== 4) return 0;
  const topLeft = corners[0];
  const topRight = corners[1];
  const bottomRight = corners[2];
  const bottomLeft = corners[3];
  const topWidth = Math.sqrt((topRight.x - topLeft.x) ** 2 + (topRight.y - topLeft.y) ** 2);
  const bottomWidth = Math.sqrt((bottomRight.x - bottomLeft.x) ** 2 + (bottomRight.y - bottomLeft.y) ** 2);
  const leftHeight = Math.sqrt((bottomLeft.x - topLeft.x) ** 2 + (bottomLeft.y - topLeft.y) ** 2);
  const rightHeight = Math.sqrt((bottomRight.x - topRight.x) ** 2 + (bottomRight.y - topRight.y) ** 2);
  const width = (topWidth + bottomWidth) / 2;
  const height = (leftHeight + rightHeight) / 2;
  if (height === 0) return 0;
  return width / height;
}

function normalizedDocumentAspectRatio(corners: CornerPoint[]): number {
  const ratio = documentAspectRatio(corners);
  if (ratio <= 0) return 0;

  return ratio >= 1 ? 1 / ratio : ratio;
}

function cornersWithinFrame(corners: CornerPoint[], frameW: number, frameH: number): boolean {
  return corners.every((corner) => corner.x >= 0 && corner.x <= frameW && corner.y >= 0 && corner.y <= frameH);
}

function documentBounds(corners: CornerPoint[]) {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    boundingWidth: maxX - minX,
    boundingHeight: maxY - minY,
  };
}

function documentEdgeMetrics(corners: CornerPoint[]) {
  if (corners.length !== 4) {
    return {
      documentWidth: 0,
      documentHeight: 0,
    };
  }

  const topLeft = corners[0];
  const topRight = corners[1];
  const bottomRight = corners[2];
  const bottomLeft = corners[3];
  const topWidth = Math.sqrt((topRight.x - topLeft.x) ** 2 + (topRight.y - topLeft.y) ** 2);
  const bottomWidth = Math.sqrt((bottomRight.x - bottomLeft.x) ** 2 + (bottomRight.y - bottomLeft.y) ** 2);
  const leftHeight = Math.sqrt((bottomLeft.x - topLeft.x) ** 2 + (bottomLeft.y - topLeft.y) ** 2);
  const rightHeight = Math.sqrt((bottomRight.x - topRight.x) ** 2 + (bottomRight.y - topRight.y) ** 2);

  return {
    documentWidth: (topWidth + bottomWidth) / 2,
    documentHeight: (leftHeight + rightHeight) / 2,
  };
}

type PictureSizeInfo = {
  raw: string;
  width: number;
  height: number;
  area: number;
  portrait: boolean;
  aspectRatio: number;
};

function parsePictureSize(size: string): PictureSizeInfo | null {
  const [width, height] = size.split('x').map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    raw: size,
    width,
    height,
    area: width * height,
    portrait: height >= width,
    aspectRatio: width / height,
  };
}

function selectPictureSize(
  sizes: string[],
  targetWidth: number,
  targetHeight: number,
  preferLargest: boolean,
): string | undefined {
  const parsedSizes = [...new Set(sizes)]
    .map(parsePictureSize)
    .filter((size): size is PictureSizeInfo => Boolean(size));

  if (!parsedSizes.length) {
    return undefined;
  }

  const targetPortrait = targetHeight >= targetWidth;
  const targetAspectRatio = targetWidth > 0 && targetHeight > 0 ? targetWidth / targetHeight : 0;

  const rankedSizes = [...parsedSizes].sort((a, b) => {
    const orientationScoreA = a.portrait === targetPortrait ? 0 : 1;
    const orientationScoreB = b.portrait === targetPortrait ? 0 : 1;
    if (orientationScoreA !== orientationScoreB) {
      return orientationScoreA - orientationScoreB;
    }

    const aspectScoreA = targetAspectRatio > 0 ? Math.abs(a.aspectRatio - targetAspectRatio) : 0;
    const aspectScoreB = targetAspectRatio > 0 ? Math.abs(b.aspectRatio - targetAspectRatio) : 0;
    if (aspectScoreA !== aspectScoreB) {
      return aspectScoreA - aspectScoreB;
    }

    return preferLargest ? b.area - a.area : a.area - b.area;
  });

  return rankedSizes[0]?.raw;
}

function scaleCorners(
  corners: CornerPoint[],
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): CornerPoint[] {
  if (!corners.length || sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return corners;
  }

  const scaleX = targetWidth / sourceWidth;
  const scaleY = targetHeight / sourceHeight;

  return corners.map((corner) => ({
    x: corner.x * scaleX,
    y: corner.y * scaleY,
  }));
}

type ValidationFrameChoice = {
  width: number;
  height: number;
  orientation: 'native' | 'swapped' | 'native-fallback';
  nativeInside: boolean;
  swappedInside: boolean;
};

function chooseValidationFrame(
  corners: CornerPoint[],
  snapshotWidth: number,
  snapshotHeight: number,
): ValidationFrameChoice {
  const nativeInside = cornersWithinFrame(corners, snapshotWidth, snapshotHeight);
  const swappedInside = cornersWithinFrame(corners, snapshotHeight, snapshotWidth);

  if (swappedInside && !nativeInside) {
    return {
      width: snapshotHeight,
      height: snapshotWidth,
      orientation: 'swapped',
      nativeInside,
      swappedInside,
    };
  }

  return {
    width: snapshotWidth,
    height: snapshotHeight,
    orientation: nativeInside ? 'native' : 'native-fallback',
    nativeInside,
    swappedInside,
  };
}

const A4_RATIO = 210 / 297;
const MIN_VALID_AREA_RATIO = 0.03;
const MAX_RATIO_DEVIATION = 0.35;

/* ---------- Validation ---------- */

type CornerValidation = {
  valid: boolean;
  score: number;
  reason: string;
};

function validateCorners(corners: CornerPoint[], snapshotWidth: number, snapshotHeight: number): CornerValidation {
  console.log(
    '[Scanner] validateCorners: start snapshotWidth=%d snapshotHeight=%d corners=%d',
    snapshotWidth,
    snapshotHeight,
    corners.length,
  );

  if (corners.length !== 4) {
    console.log('[Scanner] validateCorners: rule cornersCount -> FAIL (need exactly 4 corners)');
    const result = { valid: false, score: 0, reason: 'Need exactly 4 corners' };
    console.log('[Scanner] validateCorners: final result valid=%s score=%d reason=%s', result.valid, result.score, result.reason);
    return result;
  }

  const frameChoice = chooseValidationFrame(corners, snapshotWidth, snapshotHeight);
  const { boundingWidth, boundingHeight } = documentBounds(corners);
  const { documentWidth, documentHeight } = documentEdgeMetrics(corners);
  const area = polygonArea(corners);
  const frameArea = frameChoice.width * frameChoice.height;
  const areaRatio = area / frameArea;
  const rawRatio = documentAspectRatio(corners);
  const normalizedRatio = normalizedDocumentAspectRatio(corners);
  const ratioDeviation = Math.abs(normalizedRatio - A4_RATIO) / A4_RATIO;

  console.log(
    '[Scanner] validateCorners: corners=%s',
    JSON.stringify(corners),
  );

  console.log(
    '[Scanner] validateCorners: frame choice native=%dx%d nativeInside=%s swapped=%dx%d swappedInside=%s selected=%s %dx%d',
    snapshotWidth,
    snapshotHeight,
    frameChoice.nativeInside,
    snapshotHeight,
    snapshotWidth,
    frameChoice.swappedInside,
    frameChoice.orientation,
    frameChoice.width,
    frameChoice.height,
  );

  console.log(
    '[Scanner] validateCorners: document metrics width=%s height=%s boundingWidth=%d boundingHeight=%d area=%d frameArea=%d areaPct=%s rawRatio=%s normalizedRatio=%s ratioDeviation=%s',
    documentWidth.toFixed(1),
    documentHeight.toFixed(1),
    Math.round(boundingWidth),
    Math.round(boundingHeight),
    Math.round(area),
    Math.round(frameArea),
    (areaRatio * 100).toFixed(2),
    rawRatio.toFixed(4),
    normalizedRatio.toFixed(4),
    ratioDeviation.toFixed(4),
  );

  console.log(
    '[Scanner] validateCorners: rule cornersCount -> PASS (count=%d)',
    corners.length,
  );

  if (areaRatio < MIN_VALID_AREA_RATIO) {
    const result = { valid: false, score: Math.round(areaRatio / MIN_VALID_AREA_RATIO * 20), reason: 'Document too small' };
    console.log('[Scanner] validateCorners: rule areaMinimum -> FAIL (areaPct=%s minPct=%s)', (areaRatio * 100).toFixed(2), (MIN_VALID_AREA_RATIO * 100).toFixed(2));
    console.log('[Scanner] validateCorners: final result valid=%s score=%d reason=%s', result.valid, result.score, result.reason);
    return result;
  }
  console.log('[Scanner] validateCorners: rule areaMinimum -> PASS (areaPct=%s minPct=%s)', (areaRatio * 100).toFixed(2), (MIN_VALID_AREA_RATIO * 100).toFixed(2));

  if (ratioDeviation > MAX_RATIO_DEVIATION) {
    console.log('[Scanner] validateCorners: rule aspectRatio -> WARN (deviation=%s max=%s)', ratioDeviation.toFixed(4), MAX_RATIO_DEVIATION.toFixed(4));
  } else {
    console.log('[Scanner] validateCorners: rule aspectRatio -> PASS (deviation=%s max=%s)', ratioDeviation.toFixed(4), MAX_RATIO_DEVIATION.toFixed(4));
  }

  const allInside = cornersWithinFrame(corners, frameChoice.width, frameChoice.height);
  if (!allInside) {
    const result = { valid: false, score: 10, reason: 'Corners outside frame' };
    console.log('[Scanner] validateCorners: rule frameBounds -> FAIL (selectedFrame=%dx%d)', frameChoice.width, frameChoice.height);
    console.log('[Scanner] validateCorners: final result valid=%s score=%d reason=%s', result.valid, result.score, result.reason);
    return result;
  }
  console.log('[Scanner] validateCorners: rule frameBounds -> PASS (selectedFrame=%dx%d)', frameChoice.width, frameChoice.height);

  /* -------- Confidence scoring -------- */
  const ratioScore = Math.round(Math.max(0, 1 - Math.min(ratioDeviation / 1.5, 1)) * 40);
  const areaScore = Math.round(Math.min(areaRatio / 0.4, 1) * 30);

  const score = Math.min(ratioScore + areaScore, 70);
  const result = { valid: true, score, reason: '' };
  console.log('[Scanner] validateCorners: final result valid=%s score=%d reason=%s', result.valid, result.score, result.reason || 'none');

  return result;
}

function averageCorners(a: CornerPoint[], b: CornerPoint[]): boolean {
  if (a.length !== 4 || b.length !== 4) return false;
  const threshold = 45; // Increased for handheld stability
  for (let i = 0; i < 4; i++) {
    const dx = Math.abs(a[i].x - b[i].x);
    const dy = Math.abs(a[i].y - b[i].y);
    if (dx > threshold || dy > threshold) return false;
  }
  return true;
}

export function ProfessorScannerScreen(props: ScannerProps) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [isAligned, setIsAligned] = useState(false);
  const [isStable, setIsStable] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<CornerPoint[]>([]);
  const [detectionMessage, setDetectionMessage] = useState('');
  const [detectionConfidence, setDetectionConfidence] = useState(0);
  const [cameraDimensions, setCameraDimensions] = useState({ width: 0, height: 0 });
  const [detectionFrameSize, setDetectionFrameSize] = useState({ width: 0, height: 0 });

  const [scanResultVisible, setScanResultVisible] = useState(false);
  const [capturedImageUri, setCapturedImageUri] = useState<string | null>(null);
  const [stableImageUri, setStableImageUri] = useState<string | null>(null);
  const [capturedCopy, setCapturedCopy] = useState<ScannedCopy | null>(null);
  const [cameraFrozen, setCameraFrozen] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [flashMode, setFlashMode] = useState<'off' | 'on' | 'auto'>('off');
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(true);
  const [imageQuality, setImageQuality] = useState<number>(0.9);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraPictureSize, setCameraPictureSize] = useState<string | undefined>(undefined);
  // Dimensions of the image that the backend actually used for corner detection.
  // These are returned by /detect-corners and MUST be passed to /scan so that
  // the backend can scale the corners from detection-space to original-image-space.
  const [detectionBackendFrame, setDetectionBackendFrame] = useState({ width: 0, height: 0 });

  const autoCaptureDone = useRef(false);
  const isCapturingRef = useRef(false);
  const scanResultVisibleRef = useRef(false);
  const isDetectingRef = useRef(false);
  const lastCaptureTime = useRef(0);
  const stabilityHistory = useRef<{ corners: CornerPoint[]; time: number }[]>([]);
  const detectionFailures = useRef(0);
  const detectionPictureSizeRef = useRef<string | undefined>(undefined);
  const capturePictureSizeRef = useRef<string | undefined>(undefined);
  const pictureSizesLoadedRef = useRef(false);
  // AbortController for the currently in-flight detect-corners request.
  // Replaced each tick so a stale response from the previous tick is discarded.
  const detectionAbortRef = useRef<AbortController | null>(null);

  const questionCount = props.selectedExam?.questions ?? 20;
  const isKeyMode = props.scannerMode === 'key';
  const canAutoCapture = isAligned && isStable && !isCapturing && autoCaptureEnabled;
  const canManualCapture = isAligned && isStable && !isCapturing && !autoCaptureEnabled;

  isCapturingRef.current = isCapturing;
  scanResultVisibleRef.current = scanResultVisible;

  console.log('[Scanner] Render: isAligned=%s isStable=%s isCapturing=%s canAutoCapture=%s canManualCapture=%s',
    isAligned, isStable, isCapturing, canAutoCapture, canManualCapture);

  useEffect(() => {
    console.log('[Scanner] scanResultVisible changed to:', scanResultVisible);
  }, [scanResultVisible]);

  useEffect(() => {
    console.log('[Scanner] Alignment state changed: isAligned=%s', isAligned);
  }, [isAligned]);

  useEffect(() => {
    console.log('[Scanner] Stability state changed: isStable=%s', isStable);
  }, [isStable]);

  const configurePictureSizes = useCallback(async () => {
    if (pictureSizesLoadedRef.current) {
      return;
    }

    const camera = cameraRef.current;
    if (!camera) {
      console.log('[Scanner] Picture size probe skipped: cameraRef.current is null');
      return;
    }

    if (cameraDimensions.width <= 0 || cameraDimensions.height <= 0) {
      console.log('[Scanner] Picture size probe deferred until camera layout is measured');
      return;
    }

    try {
      const availableSizes = await camera.getAvailablePictureSizesAsync();
      const detectionSize =
        selectPictureSize(availableSizes, cameraDimensions.width, cameraDimensions.height, false) ??
        selectPictureSize(availableSizes, cameraDimensions.width, cameraDimensions.height, true);
      const captureSize =
        selectPictureSize(availableSizes, cameraDimensions.width, cameraDimensions.height, true) ??
        selectPictureSize(availableSizes, cameraDimensions.width, cameraDimensions.height, false);

      if (!detectionSize && !captureSize) {
        console.log('[Scanner] Camera picture size probe returned no sizes');
        return;
      }

      detectionPictureSizeRef.current = detectionSize;
      capturePictureSizeRef.current = captureSize;
      pictureSizesLoadedRef.current = true;
      setCameraPictureSize(detectionSize);

      console.log(
        '[Scanner] Camera picture sizes ready: detection=%s capture=%s total=%d preview=%dx%d',
        detectionSize,
        captureSize,
        availableSizes.length,
        cameraDimensions.width,
        cameraDimensions.height,
      );
    } catch (error) {
      console.log(
        '[Scanner] Camera picture size probe failed: %s',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [cameraDimensions.height, cameraDimensions.width]);

  useEffect(() => {
    console.log(
      '[Scanner] Permission state changed: granted=%s canAskAgain=%s status=%s',
      permission?.granted ?? false,
      permission?.canAskAgain ?? false,
      permission?.status ?? 'unknown',
    );
    if (!permission?.granted) {
      console.log('[Scanner] Requesting camera permission');
      requestPermission();
    }
  }, [permission?.granted, requestPermission]);

  useEffect(() => {
    console.log('[Scanner] Init effect fired: resetting all state');
    setIsAligned(false);
    setIsStable(false);
    setCameraReady(false);
    setIsCapturing(false);
    setDetectedCorners([]);
    setDetectionMessage('');
    setDetectionConfidence(0);
    setScanResultVisible(false);
    setCapturedImageUri(null);
    setCapturedCopy(null);
    setDetectionFrameSize({ width: 0, height: 0 });
    stabilityHistory.current = [];
    detectionPictureSizeRef.current = undefined;
    capturePictureSizeRef.current = undefined;
    pictureSizesLoadedRef.current = false;
    setCameraPictureSize(undefined);
  }, [isKeyMode, props.selectedExam?.questions]);

  useEffect(() => {
    console.log('[Scanner] Camera readiness changed: cameraReady=%s', cameraReady);
  }, [cameraReady]);

  useEffect(() => {
    console.log(
      '[Scanner] Detection gate snapshot: cameraReady=%s permissionGranted=%s',
      cameraReady,
      permission?.granted ?? false,
    );
  }, [cameraReady, permission?.granted]);

  useEffect(() => {
    if (cameraReady && cameraDimensions.width > 0 && cameraDimensions.height > 0 && !pictureSizesLoadedRef.current) {
      void configurePictureSizes();
    }
  }, [cameraDimensions.height, cameraDimensions.width, cameraReady, configurePictureSizes]);

  // Expo Camera in Expo Go does not expose live frame processors here, so the
  // detection loop samples low-res snapshots as the best available fallback.
  const runDetection = useCallback(async () => {
    const guardReasons: string[] = [];
    if (!cameraReady) guardReasons.push('cameraReady=false');
    if (!permission?.granted) guardReasons.push('permissionGranted=false');
    if (isCapturingRef.current) guardReasons.push('isCapturing=true');
    if (scanResultVisibleRef.current) guardReasons.push('scanResultVisible=true');
    if (autoCaptureDone.current) guardReasons.push('autoCaptureDone=true');
    // NOTE: isDetecting is NOT a skip condition anymore.
    // Instead we cancel the previous in-flight request via AbortController and start fresh.
    // Keeping the guard only to prevent concurrent takePictureAsync calls (can crash on some devices).
    if (isDetectingRef.current) guardReasons.push('isDetecting=true (snapshot in progress)');

    console.log(
      '[Scanner] runDetection: enter cameraReady=%s permissionGranted=%s isCapturing=%s scanResultVisible=%s autoCaptureDone=%s isDetecting=%s',
      cameraReady,
      permission?.granted ?? false,
      isCapturingRef.current,
      scanResultVisibleRef.current,
      autoCaptureDone.current,
      isDetectingRef.current,
    );

    if (guardReasons.length > 0) {
      console.log('[Scanner] runDetection: skip -> %s', guardReasons.join(', '));
      return;
    }

    const camera = cameraRef.current;
    if (!camera) {
      console.log('[Scanner] runDetection: skip -> cameraRef.current is null');
      return;
    }

    try {
      isDetectingRef.current = true;
      // Cancel any in-flight request from the previous tick before starting a new one.
      detectionAbortRef.current?.abort();
      const abortController = new AbortController();
      detectionAbortRef.current = abortController;

      console.log('[Scanner] runDetection: detection lock acquired');
      console.log('[Scanner] runDetection: sampling preview snapshot for detect-corners (Expo Camera fallback)');
      // Do NOT use skipProcessing:true here — on Android it bypasses EXIF orientation
      // correction so the backend receives a rotated image and corner detection fails.
      const image = await camera.takePictureAsync({
        quality: SMALL_PICTURE_QUALITY,
      });

      if (!image?.uri) {
        console.log('[Scanner] runDetection: skip -> takePictureAsync returned no uri');
        return;
      }

      console.log(
        '[Scanner] runDetection: snapshot captured uri=%s snapshotWidth=%s snapshotHeight=%s',
        image.uri,
        image.width ?? 'unknown',
        image.height ?? 'unknown',
      );

      console.log(
        '[Scanner] runDetection: detect-corners request url=%s',
        `${OCR_SERVICE_URL}/detect-corners`,
      );

      const uploadResult = await uploadScannerMultipart({
        requestUrl: `${OCR_SERVICE_URL}/detect-corners`,
        imageUri: image.uri,
        label: 'detect-corners',
        signal: abortController.signal,
      });

      if (isCapturingRef.current || scanResultVisibleRef.current || autoCaptureDone.current) {
        console.log('[Scanner] runDetection: skip -> state changed while awaiting detect-corners');
        return;
      }

      console.log(
        '[Scanner] detect-corners response: status=%d ok=%s body=%s',
        uploadResult.status,
        uploadResult.status === 200,
        uploadResult.body,
      );

      if (uploadResult.status !== 200) {
        console.log('[Scanner] runDetection: skip -> non-OK status from detect-corners');
        return;
      }

      let data: { detected?: boolean; corners?: CornerPoint[]; message?: string };
      try {
        data = JSON.parse(uploadResult.body);
      } catch {
        console.log('[Scanner] runDetection: skip -> invalid JSON from detect-corners');
        return;
      }

      // Store the backend's internal detection frame dimensions so we can pass
      // them back to /scan for correct corner→original-image scaling.
      const backendDetW = (data as any).detection_image_width ?? 0;
      const backendDetH = (data as any).detection_image_height ?? 0;
      
      const frameWidth = backendDetW > 0 ? backendDetW : (image.width || cameraDimensions.width || 1000);
      const frameHeight = backendDetH > 0 ? backendDetH : (image.height || cameraDimensions.height || 1000);
      
      setDetectionFrameSize({ width: frameWidth, height: frameHeight });

      if (backendDetW > 0 && backendDetH > 0) {
        setDetectionBackendFrame({ width: backendDetW, height: backendDetH });
        console.log(
          '[Scanner] detect-corners: backend detection frame=%dx%d',
          backendDetW, backendDetH,
        );
      }

      const now = Date.now();
      console.log(
        '[Scanner] detect-corners parsed: detected=%s corners=%d frameWidth=%d frameHeight=%d backendDetW=%d backendDetH=%d',
        data.detected ?? false,
        data.corners?.length ?? 0,
        frameWidth,
        frameHeight,
        backendDetW,
        backendDetH,
      );
      console.log(
        '[Scanner] detect-corners: validation frame source image=%sx%s layout=%sx%s',
        image.width ?? 'unknown',
        image.height ?? 'unknown',
        cameraDimensions.width,
        cameraDimensions.height,
      );
      console.log(
        '[Scanner] detect-corners: returned corners=%s',
        JSON.stringify(data.corners ?? []),
      );

      /* -------- Run client-side validation on every detection cycle -------- */
      if (data.detected && data.corners?.length === 4) {
        const newCorners: CornerPoint[] = data.corners;
        console.log('[Scanner] detect-corners: four corners received -> validating');

        const validation = validateCorners(newCorners, frameWidth, frameHeight);

        if (validation.valid) {
          /* -------- Valid document -------- */
          console.log('[Scanner] detect-corners: validation passed -> updating alignment/stability');
          setDetectedCorners(newCorners);
          setStableImageUri(image.uri);
          setDetectionMessage(data.message ?? 'Document détecté');
          setDetectionConfidence(validation.score);

          /* -------- Stability tracking via history window -------- */
          const history = stabilityHistory.current;
          detectionFailures.current = 0;

          /* Purge entries older than 5 s (to allow accumulating 6 frames at ~500ms/frame) */
          while (history.length > 0 && now - history[0].time > 5000) {
            history.shift();
          }

          history.push({ corners: newCorners, time: now });
          if (history.length > STABILITY_HISTORY_LENGTH) {
            history.shift();
          }

          /* Check consecutive frames match instead of every frame to the last */
          let allMatch = history.length >= STABILITY_HISTORY_LENGTH;
          if (allMatch) {
            for (let i = 0; i < history.length - 1; i++) {
              if (!averageCorners(history[i].corners, history[i + 1].corners)) {
                allMatch = false;
                break;
              }
            }
          }

          console.log(
            '[Scanner] detect-corners: stability window length=%d allMatch=%s',
            history.length,
            allMatch,
          );

          if (allMatch) {
            const windowDuration = now - history[0].time;
            console.log('[Scanner] detect-corners: windowDuration=%dms', windowDuration);
            if (windowDuration >= 1200) {
              if (!isStable) {
                console.log('[Scanner] Document validated & stable – setting isStable=true, confidence=%d', validation.score);
              }
              setIsAligned(true);
              setIsStable(true);
            } else {
              setIsAligned(true);
              setIsStable(false);
            }
          } else {
            setIsAligned(true);
            setIsStable(false);
          }
        } else {
          /* -------- Corners exist but failed validation -------- */
          console.log('[Scanner] Validation failed: %s (score=%d)', validation.reason, validation.score);
          if (validation.score > 0) {
            setDetectedCorners(newCorners);
            setStableImageUri(image.uri);
            setDetectionConfidence(validation.score);
            setDetectionMessage(validation.reason);
          } else {
            setDetectedCorners([]);
            setDetectionConfidence(0);
          }
          
          detectionFailures.current += 1;
          if (detectionFailures.current >= 3) {
            stabilityHistory.current = [];
            setIsAligned(false);
            setIsStable(false);
          }
          setDetectionMessage(validation.reason);
        }
      } else {
        /* -------- No corners from backend -------- */
        console.log('[Scanner] detect-corners: invalid payload or no corners detected');
        if (detectedCorners.length > 0) {
          console.log('[Scanner] No corners detected – waiting for 3 consecutive failures before clearing state');
        }
        setDetectedCorners([]);
        setDetectionConfidence(0);
        
        detectionFailures.current += 1;
        if (detectionFailures.current >= 3) {
          stabilityHistory.current = [];
          setIsAligned(false);
          setIsStable(false);
        }
        setDetectionMessage(data.message ?? '');
      }
    } catch (error) {
      // An AbortError means we intentionally cancelled this tick's request (the next
      // tick already started a fresh one).  Do NOT clear corners state – that would
      // flicker the overlay for no reason.
      const isAbort =
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.includes('timed out'));
      if (!isAbort) {
        console.log(
          '[Scanner] runDetection: exception while processing frame: %s',
          error instanceof Error ? error.message : String(error),
        );
        setDetectedCorners([]);
        setDetectionConfidence(0);
        setIsAligned(false);
        setIsStable(false);
      } else {
        console.log('[Scanner] runDetection: aborted (stale tick) – state preserved');
      }
    } finally {
      isDetectingRef.current = false;
      console.log('[Scanner] runDetection: detection lock released');
    }
  // NOTE: detectedCorners.length intentionally removed from deps — it caused unnecessary
  // re-creation of the callback on every detection cycle (stale closure + extra re-mounts).
  // detectedCorners is only needed for the "clear" path which is fine with a stale length=0.
  }, [cameraReady, permission?.granted, cameraDimensions, isStable]);

  const runDetectionRef = useRef(runDetection);
  runDetectionRef.current = runDetection;

  useEffect(() => {
    console.log(
      '[Scanner] Detection interval effect: cameraReady=%s permissionGranted=%s',
      cameraReady,
      permission?.granted ?? false,
    );
    if (!permission?.granted || !cameraReady) {
      console.log('[Scanner] Detection interval not started because gate is closed');
      return;
    }

    console.log('[Scanner] Detection loop fallback: Expo Camera snapshot sampling is active in place of live frame processing');
    console.log('[Scanner] Detection interval started: every %dms', DETECTION_INTERVAL_MS);
    const interval = setInterval(() => {
      console.log('[Scanner] Detection interval tick -> runDetection');
      runDetectionRef.current();
    }, DETECTION_INTERVAL_MS);
    return () => {
      console.log('[Scanner] Detection interval cleared');
      clearInterval(interval);
    };
  }, [cameraReady, permission?.granted]);

  const doCapture = useCallback(async () => {
    console.log('[Scanner] doCapture called: isAligned=%s isStable=%s autoCaptureDone=%s scanResultVisible=%s',
      isAligned, isStable, autoCaptureDone.current, scanResultVisible);
      
    // Strict guard: NEVER allow capture (manual or auto) if not aligned and stable
    if (!isAligned || !isStable || isCapturing || autoCaptureDone.current || scanResultVisible) {
      console.log('[Scanner] doCapture blocked by strict guard conditions');
      return;
    }

    const now = Date.now();
    if (now - lastCaptureTime.current < MIN_CAPTURE_INTERVAL_MS) return;
    lastCaptureTime.current = now;

    const camera = cameraRef.current;
    if (!camera) {
      console.log('[Scanner] doCapture: cameraRef.current is null');
      return;
    }

    autoCaptureDone.current = true;
    setIsCapturing(true);
    console.log('[Scanner] doCapture: autoCaptureDone set, isCapturing set, calling takePictureAsync...');

    try {
      // ── Use the exact snapshot that was verified as stable ───────────────
      // CRITICAL: We previously took a new picture here, but network latency
      // meant the phone could have moved between detection and capture.
      // This caused the pre-detected corners to map to the wrong locations on
      // the new image, resulting in a bad crop.
      // Solution: use the exact same image URI that was saved during the
      // stable detection tick.
      console.log('[Scanner] doCapture: using the exact preview-quality snapshot from the stable detection tick');
      let finalImageUri = stableImageUri;
      
      if (!finalImageUri) {
        console.log('[Scanner] doCapture: stableImageUri is null, taking fallback picture');
        const fallbackImage = await camera.takePictureAsync({ quality: SMALL_PICTURE_QUALITY });
        finalImageUri = fallbackImage?.uri ?? null;
      }
      console.log('[Scanner] capture image uri:', finalImageUri ? `${finalImageUri.substring(0, 50)}...` : 'null');

      let studentName: string | null = null;
      let matricule: string | null = null;
      let className: string | null = null;
      let answers: string[] = [];
      let conf = 0;
      let ocrResultPayload: ScannedCopyDraft['ocrResult'];
      let omrResultPayload: ScannedCopyDraft['omrResult'];
      // warpedImageUri is the perspective-corrected flat document returned by /scan.
      // It replaces the raw camera frame as the stored scanned copy image.
      let warpedImageUri: string | undefined;

      if (finalImageUri && detectedCorners.length === 4) {
        // ── Unified /scan endpoint ────────────────────────────────────────────
        // We pass the pre-detected corners (from the live preview detection loop)
        // together with the backend frame dimensions so the backend can scale
        // them correctly to the snapshot resolution for the perspective warp.
        // Since the snapshot was taken at the SAME quality/FOV as the detection
        // frames, the corners are in the correct coordinate space.
        const cornersJson = JSON.stringify(
          detectedCorners.map((c) => ({ x: Math.round(c.x), y: Math.round(c.y) })),
        );
        console.log(
          '[Scanner] Calling /scan with pre-detected corners=%s backendFrame=%dx%d questions=%d imageUri=%s',
          cornersJson,
          detectionBackendFrame.width,
          detectionBackendFrame.height,
          questionCount,
          finalImageUri.substring(0, 60),
        );

        const scanUpload = await uploadScannerMultipart({
          requestUrl: `${OCR_SERVICE_URL}/scan`,
          imageUri: finalImageUri,
          label: 'scan',
          fields: {
            questions: questionCount,
            lang: 'fra+eng',
            corners_json: cornersJson,
            detection_image_width: detectionBackendFrame.width,
            detection_image_height: detectionBackendFrame.height,
          },
        });

        console.log(
          '[Scanner] /scan response: status=%d body_length=%d',
          scanUpload.status,
          scanUpload.body?.length ?? 0,
        );

        if (scanUpload.status === 200) {
          const scanData = JSON.parse(scanUpload.body);
          console.log(
            '[Scanner] /scan parsed: detected=%s ocr_extracted=%s omr_detected=%s warped_image=%s',
            scanData.detected ?? false,
            scanData.ocr?.extracted ?? false,
            scanData.omr?.detected ?? false,
            scanData.warped_image_base64 ? `${scanData.warped_image_base64.length} chars` : 'null',
          );

          // If the backend returned detected=false, the perspective warp failed.
          // Do NOT show the scan result modal with a raw camera frame.
          if (!scanData.detected) {
            console.log('[Scanner] /scan: detected=false – aborting capture, asking user to retry');
            autoCaptureDone.current = false;
            Alert.alert(
              'Repositionner la feuille',
              'La feuille n\'a pas pu être recadrée. Repositionnez-la et réessayez.',
            );
            return;
          }

          // The warped image is the perspective-corrected flat document.
          // Save it to the filesystem so it can be used as the imageUri.
          if (scanData.warped_image_base64) {
            try {
              const warpedPath = `${FileSystem.cacheDirectory}warped_${Date.now()}.jpg`;
              await FileSystem.writeAsStringAsync(
                warpedPath,
                scanData.warped_image_base64,
                { encoding: FileSystem.EncodingType.Base64 },
              );
              warpedImageUri = warpedPath;
              console.log('[Scanner] Warped image saved to: %s', warpedPath);
            } catch (err) {
              console.log('[Scanner] Failed to save warped image: %s', String(err));
            }
          }

          // Parse OCR from unified response
          if (scanData.ocr) {
            const ocr = scanData.ocr;
            studentName = ocr.name || null;
            matricule = ocr.matricule || null;
            className = ocr.class_name || ocr.className || null;
            ocrResultPayload = {
              extracted: Boolean(ocr.extracted),
              name: ocr.name || null,
              matricule: ocr.matricule || null,
              className: ocr.class_name || ocr.className || null,
              confidence: Math.round((ocr.confidence ?? 0) * 100),
              missingFields: Array.isArray(ocr.missing_fields)
                ? ocr.missing_fields
                : Array.isArray(ocr.missingFields)
                  ? ocr.missingFields
                  : [],
            };
            console.log('[Scanner] OCR: name=%s matricule=%s class=%s', studentName, matricule, className);
          }

          // Parse OMR from unified response
          if (scanData.omr) {
            const omrRaw = scanData.omr;
            if (omrRaw.answers?.length) {
              const parsedAnswers = omrRaw.answers.map((a: any, index: number) => ({
                question: Number(a.question) || index + 1,
                answer: a.answer ?? null,
                confidence: Math.round((a.confidence ?? 0) * 100),
              }));
              answers = parsedAnswers.map((a: { answer: string | null }) => a.answer ?? '');
              omrResultPayload = {
                detected: Boolean(omrRaw.detected),
                answers: parsedAnswers,
              };
              conf = Math.round(
                omrRaw.answers.reduce((s: number, a: any) => s + (a.confidence ?? 0), 0) /
                  omrRaw.answers.length * 100,
              );
              console.log('[Scanner] OMR: %d answers, conf=%d', parsedAnswers.length, conf);
            } else {
              omrResultPayload = { detected: false, answers: [] };
            }
          }
        } else {
          console.log('[Scanner] /scan HTTP error: status=%d body=%s',
            scanUpload.status, scanUpload.body?.substring(0, 200));
          // HTTP error from /scan – reset auto-capture so the user can retry
          autoCaptureDone.current = false;
          Alert.alert('Erreur serveur', `Le serveur a retourné une erreur (${scanUpload.status}). Réessayez.`);
          return;
        }
      } else {
        console.log('[Scanner] Skipping /scan: finalImageUri=%s, detectedCorners.length=%d',
          finalImageUri ? 'valid' : 'null', detectedCorners.length);
      }

      console.log('[Scanner] Setting capture state: cameraFrozen=true, scanResultVisible=true');
      console.log('[Scanner] warpedImageUri=%s rawImageUri=%s',
        warpedImageUri ?? 'none',
        finalImageUri?.substring(0, 60) ?? 'none',
      );
      // Show the perspective-corrected (warped) image in the frozen preview if available.
      // Otherwise fall back to the raw camera image.
      const displayImageUri = warpedImageUri ?? finalImageUri ?? null;
      setCameraFrozen(true);
      setCapturedImageUri(displayImageUri);
      setScanResultVisible(true);
      setIsAligned(false);
      setIsStable(false);
      console.log('[Scanner] Capture state set - Bottom Sheet should be visible');

      console.log('[Scanner] Calling onRegisterExamScan...');
      console.log('[Scanner] onRegisterExamScan exists:', typeof props.onRegisterExamScan);
      const createdCopy = props.onRegisterExamScan?.({
        studentName: studentName ?? 'À extraire plus tard',
        matricule: matricule ?? 'À extraire plus tard',
        className: className ?? undefined,
        calculatedScore: '--',
        aiConfidence: conf,
        detectedAnswers: answers,
        detectedAnswersCount: answers.length,
        // Use the warped (perspective-corrected) image as the canonical document image.
        // Only fall back to the raw camera frame if perspective correction failed.
        imageUri: warpedImageUri ?? finalImageUri ?? '',
        ocrResult: ocrResultPayload,
        omrResult: omrResultPayload,
        metadata: { source: 'scanner', processedAt: new Date().toISOString() },
      }) ?? null;
      console.log('[Scanner] onRegisterExamScan returned:', createdCopy ? `id=${createdCopy.id}` : 'null');

      if (!createdCopy) {
        console.log('[Scanner] No createdCopy - showing alert');
        Alert.alert('Scan impossible', "La copie n'a pas pu être enregistrée.");
      } else {
        console.log('[Scanner] Setting capturedCopy with id=%s', createdCopy.id);
        setCapturedCopy(createdCopy);
      }
    } catch (error) {
      console.log(
        '[Scanner] doCapture outer catch - unexpected error: %s',
        error instanceof Error ? error.message : String(error),
      );
      Alert.alert('Scan impossible', "Nous n'avons pas pu capturer le document. Réessayez.");
      setIsAligned(false);
      setIsStable(false);
      autoCaptureDone.current = false;
    } finally {
      console.log('[Scanner] doCapture finally: setIsCapturing(false)');
      setIsCapturing(false);
    }
  }, [
    isAligned,
    isStable,
    isCapturing,
    permission,
    requestPermission,
    detectedCorners,
    questionCount,
    scanResultVisible,
    imageQuality,
    props.onRegisterExamScan,
    cameraPictureSize,
    detectionBackendFrame,
  ]);

  useEffect(() => {
    console.log('[Scanner] Auto-capture effect: canAutoCapture=%s autoCaptureDone=%s scanResultVisible=%s',
      canAutoCapture, autoCaptureDone.current, scanResultVisible);
    if (canAutoCapture && !autoCaptureDone.current && !scanResultVisible) {
      console.log('[Scanner] Auto-capture condition met - calling doCapture()');
      doCapture();
    }
  }, [canAutoCapture, doCapture, scanResultVisible]);

  const onCameraLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    console.log('[Scanner] Camera layout measured: width=%d height=%d', width, height);
    setCameraDimensions({ width, height });
  }, []);

  const goBack = () => {
    props.onNavigate?.(isKeyMode ? 'professor-answer-key' : 'professor-exam-menu');
  };

  const closeBottomSheet = () => {
    console.log('[Scanner] closeBottomSheet called - resetting state');
    setScanResultVisible(false);
    setCameraFrozen(false);
    setCapturedImageUri(null);
    setStableImageUri(null);
    setCapturedCopy(null);
    setDetectionFrameSize({ width: 0, height: 0 });
    setDetectedCorners([]);
    setDetectionConfidence(0);
    setIsAligned(false);
    setIsStable(false);
    setDetectionMessage('');
    autoCaptureDone.current = false;
    lastCaptureTime.current = 0;
    stabilityHistory.current = [];
    detectionFailures.current = 0;
    const detectionPictureSize = detectionPictureSizeRef.current;
    if (detectionPictureSize) {
      console.log('[Scanner] closeBottomSheet: restoring detection pictureSize=%s', detectionPictureSize);
      setCameraPictureSize(detectionPictureSize);
    }
  };

  const handleReviewCopy = () => {
    console.log('[Scanner] handleReviewCopy called - opening persisted copy detail');
    closeBottomSheet();
    props.onNavigate?.('professor-copy-detail');
  };

  const handleContinueAndSave = () => {
    console.log('[Scanner] handleContinueAndSave called - closing sheet and resuming live scan');
    closeBottomSheet();
  };

  const overlayCorners = scaleCorners(
    detectedCorners,
    detectionFrameSize.width,
    detectionFrameSize.height,
    cameraDimensions.width,
    cameraDimensions.height,
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.headerIcon}>
          <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Scanner</Text>
        <Pressable accessibilityRole="button" onPress={() => setSettingsVisible(true)} style={styles.headerIcon}>
          <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.9)" />
        </Pressable>
      </View>

      <View style={styles.content}>
        {permission?.granted ? (
          <View style={styles.scannerShell} onLayout={onCameraLayout}>
            <CameraView
              ref={cameraRef}
              facing="back"
              flash={flashMode}
              animateShutter={false}
              pictureSize={cameraPictureSize}
              enableTorch={torchEnabled}
              onCameraReady={() => {
                console.log('[Scanner] Camera ready event received');
                setCameraReady(true);
                void configurePictureSizes();
              }}
              style={StyleSheet.absoluteFill}
            />

            {cameraFrozen && capturedImageUri && (
              <Image source={{ uri: capturedImageUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}

            <View style={styles.scannerTint} pointerEvents="none" />

            <View style={styles.a4Frame} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTopLeft, isAligned && isStable && styles.cornerReady]} />
              <View style={[styles.corner, styles.cornerTopRight, isAligned && isStable && styles.cornerReady]} />
              <View style={[styles.corner, styles.cornerBottomLeft, isAligned && isStable && styles.cornerReady]} />
              <View style={[styles.corner, styles.cornerBottomRight, isAligned && isStable && styles.cornerReady]} />
              <View style={[styles.frameOutline, isAligned && isStable && styles.frameOutlineReady]} />
            </View>

            {overlayCorners.length === 4 && cameraDimensions.width > 0 && (
              <View style={StyleSheet.absoluteFill} pointerEvents="none">
                <CornerQuadrilateral
                  corners={overlayCorners}
                  isStable={isStable}
                />
                <CornerOverlay
                  corners={overlayCorners}
                  isStable={isStable}
                />
              </View>
            )}

            <View style={styles.guidanceWrap}>
              {!isAligned || !isStable ? (
                <Text style={styles.guidanceText}>
                  Alignez la feuille dans le cadre
                </Text>
              ) : null}

              {isAligned && isStable ? (
                <View style={styles.alignBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#4ADE80" />
                  <Text style={styles.alignBadgeText}>Document détecté</Text>
                </View>
              ) : detectionMessage ? (
                <Text style={styles.subText}>{detectionMessage}</Text>
              ) : null}
            </View>

            {/* Manual capture button (only when auto-capture is disabled) */}
            {!autoCaptureEnabled && (
              <View style={styles.manualCaptureWrap}>
                <Pressable
                  style={[
                    styles.manualCaptureBtn,
                    (!isAligned || !isStable) && styles.manualCaptureBtnDisabled,
                  ]}
                  onPress={doCapture}
                  disabled={!isAligned || !isStable || isCapturing}
                >
                  <View style={styles.manualCaptureInner} />
                </Pressable>
              </View>
            )}

          </View>
        ) : (
          <View style={styles.permissionPanel}>
            <Ionicons name="camera-outline" size={32} color="#B7B8C9" />
            <Text style={styles.permissionText}>Autorisation caméra requise</Text>
          </View>
        )}
      </View>

      <Modal
        transparent
        animationType="slide"
        visible={scanResultVisible}
        onRequestClose={closeBottomSheet}
      >
        <View style={styles.bottomSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />

            <Text style={styles.bottomSheetTitle}>Scan terminé</Text>
            <Text style={styles.bottomSheetSubtitle}>Vérifiez les informations extraites avant de continuer.</Text>

            <View style={styles.bottomSheetSummaryCard}>
              <View style={styles.bottomSheetSummaryItem}>
                <Text style={styles.bottomSheetSummaryLabel}>Nom complet</Text>
                <Text numberOfLines={1} style={styles.bottomSheetSummaryValue}>
                  {capturedCopy?.studentName ?? 'À extraire plus tard'}
                </Text>
              </View>
              <View style={styles.bottomSheetSummaryItem}>
                <Text style={styles.bottomSheetSummaryLabel}>Matricule</Text>
                <Text numberOfLines={1} style={styles.bottomSheetSummaryValue}>
                  {capturedCopy?.matricule ?? 'À extraire plus tard'}
                </Text>
              </View>
              <View style={styles.bottomSheetSummaryItem}>
                <Text style={styles.bottomSheetSummaryLabel}>Note obtenue</Text>
                <Text numberOfLines={1} style={styles.bottomSheetSummaryValue}>
                  {capturedCopy?.calculatedScore ?? '--'}
                </Text>
              </View>
            </View>

            <View style={styles.bottomSheetActions}>
              <Pressable style={styles.bsSecondaryBtn} onPress={handleReviewCopy}>
                <Text style={styles.bsSecondaryBtnText}>Réviser la copie</Text>
              </Pressable>
              <Pressable style={styles.bsPrimaryBtn} onPress={handleContinueAndSave}>
                <Text style={styles.bsPrimaryBtnText}>Continuer et enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={settingsVisible} onRequestClose={() => setSettingsVisible(false)}>
        <Pressable style={styles.settingsBackdrop} onPress={() => setSettingsVisible(false)}>
          <Pressable style={styles.settingsPanel} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.settingsTitle}>Paramètres appareil photo</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Flash</Text>
              <View style={styles.settingOptions}>
                {(['auto', 'on', 'off'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    style={[styles.settingChip, flashMode === mode && styles.settingChipActive]}
                    onPress={() => setFlashMode(mode)}>
                    <Text style={[styles.settingChipText, flashMode === mode && styles.settingChipTextActive]}>
                      {mode === 'auto' ? 'Auto' : mode === 'on' ? 'Activé' : 'Désactivé'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Capture auto</Text>
              <View style={styles.settingOptions}>
                {([true, false] as const).map((val) => (
                  <Pressable
                    key={String(val)}
                    style={[styles.settingChip, autoCaptureEnabled === val && styles.settingChipActive]}
                    onPress={() => setAutoCaptureEnabled(val)}>
                    <Text style={[styles.settingChipText, autoCaptureEnabled === val && styles.settingChipTextActive]}>
                      {val ? 'Activée' : 'Désactivée'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Qualité</Text>
              <View style={styles.settingOptions}>
                {([0.5, 0.8, 0.9] as const).map((q) => (
                  <Pressable
                    key={q}
                    style={[styles.settingChip, imageQuality === q && styles.settingChipActive]}
                    onPress={() => setImageQuality(q)}>
                    <Text style={[styles.settingChipText, imageQuality === q && styles.settingChipTextActive]}>
                      {Math.round(q * 100)}%
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Lampe torche</Text>
              <View style={styles.settingOptions}>
                {([true, false] as const).map((val) => (
                  <Pressable
                    key={String(val)}
                    style={[styles.settingChip, torchEnabled === val && styles.settingChipActive]}
                    onPress={() => setTorchEnabled(val)}>
                    <Text style={[styles.settingChipText, torchEnabled === val && styles.settingChipTextActive]}>
                      {val ? 'Allumée' : 'Éteinte'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function CornerQuadrilateral({
  corners,
  isStable,
}: {
  corners: CornerPoint[];
  isStable: boolean;
}) {
  const color = isStable ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 255, 255, 0.12)';
  const borderColor = isStable ? '#4ADE80' : '#FFFFFF';

  const top = Math.min(...corners.map((c) => c.y));
  const left = Math.min(...corners.map((c) => c.x));
  const right = Math.max(...corners.map((c) => c.x));
  const bottom = Math.max(...corners.map((c) => c.y));

  const width = right - left;
  const height = bottom - top;

  return (
    <View style={StyleSheet.absoluteFill}>
      {corners.map((corner, i) => {
        const next = corners[(i + 1) % 4];
        const dx = next.x - corner.x;
        const dy = next.y - corner.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        return (
          <View
            key={`line-${i}`}
            style={[
              styles.quadLine,
              {
                left: corner.x,
                top: corner.y,
                width: len,
                transform: [{ rotate: `${angle}deg` }],
                backgroundColor: borderColor,
              },
            ]}
          />
        );
      })}
      <View
        style={[
          styles.quadFill,
          {
            left,
            top,
            width,
            height,
            backgroundColor: color,
            borderColor: borderColor,
          },
        ]}
      />
    </View>
  );
}

function CornerOverlay({
  corners,
  isStable,
}: {
  corners: CornerPoint[];
  isStable: boolean;
}) {
  const color = isStable ? '#4ADE80' : '#FFFFFF';

  return (
    <View style={StyleSheet.absoluteFill}>
      {corners.map((corner, index) => (
        <View
          key={`dot-${index}`}
          style={[
            styles.overlayDot,
            {
              left: corner.x - 8,
              top: corner.y - 8,
              backgroundColor: color,
              borderColor: '#FFFFFF',
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#10111A',
  },
  header: {
    height: 56,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#6C5CFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  content: {
    flex: 1,
    paddingTop: 6,
    paddingHorizontal: 14,
  },
  scannerShell: {
    flex: 1,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1B1831',
    position: 'relative',
  },
  scannerTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(7, 8, 18, 0.15)',
  },
  a4Frame: {
    position: 'absolute',
    top: 32,
    left: 16,
    right: 16,
    bottom: 166,
    aspectRatio: 210 / 297,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameOutline: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
  },
  frameOutlineReady: {
    borderColor: 'rgba(74, 222, 128, 0.35)',
  },
  corner: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderWidth: 5,
    borderColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  cornerReady: {
    borderColor: '#4ADE80',
    shadowColor: '#4ADE80',
    shadowOpacity: 0.5,
    shadowRadius: 14,
  },
  cornerTopLeft: {
    top: 0,
    left: -22,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTopRight: {
    top: 0,
    right: -22,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: -22,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBottomRight: {
    bottom: 0,
    right: -22,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  guidanceWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 108,
    alignItems: 'center',
    gap: 6,
  },
  guidanceText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  manualCaptureWrap: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCaptureBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCaptureBtnDisabled: {
    borderColor: 'rgba(255, 255, 255, 0.4)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  manualCaptureInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
  },
  subText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  alignBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(74, 222, 128, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  alignBadgeText: {
    color: '#4ADE80',
    fontSize: 13,
    fontWeight: '700',
  },
  overlayDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 0,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  quadFill: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 4,
  },
  quadLine: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  permissionPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  permissionText: {
    color: '#D8DAEA',
    fontSize: 14,
    fontWeight: '700',
  },

  // Bottom sheet
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 13, 29, 0.55)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 34,
    gap: 12,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8DAEA',
    alignSelf: 'center',
    marginBottom: 4,
  },
  bottomSheetTitle: {
    color: '#121422',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 28,
  },
  bottomSheetSubtitle: {
    color: '#6A7283',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  bottomSheetSummaryCard: {
    backgroundColor: '#F6F7FC',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  bottomSheetSummaryItem: {
    gap: 2,
  },
  bottomSheetSummaryLabel: {
    color: '#6F4CEB',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  bottomSheetSummaryValue: {
    color: '#121422',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  bottomSheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  bsSecondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF1FB',
    borderWidth: 1,
    borderColor: '#E1E5F2',
    paddingHorizontal: 12,
  },
  bsSecondaryBtnText: {
    color: '#121422',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  bsPrimaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C5CFF',
    paddingHorizontal: 12,
  },
  bsPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 13, 29, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  settingsPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    gap: 16,
  },
  settingsTitle: {
    color: '#121422',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingRow: {
    gap: 8,
  },
  settingLabel: {
    color: '#657084',
    fontSize: 13,
    fontWeight: '700',
  },
  settingOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  settingChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#F6F7FC',
  },
  settingChipActive: {
    backgroundColor: '#6C5CFF',
  },
  settingChipText: {
    color: '#657084',
    fontSize: 12,
    fontWeight: '700',
  },
  settingChipTextActive: {
    color: '#FFFFFF',
  },
});
