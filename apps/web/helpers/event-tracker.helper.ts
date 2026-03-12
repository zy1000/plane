/**
 * Event tracker helper - analytics/tracking stubs
 * Used for PostHog or similar analytics integration
 */

type CaptureClickParams = { elementName: string };
type CaptureErrorParams = { message?: string; [key: string]: unknown };
type CaptureSuccessParams = { message?: string; [key: string]: unknown };

export function captureClick(_params: CaptureClickParams): void {
  // Analytics stub - implement when PostHog/analytics is configured
}

export function captureError(_params: CaptureErrorParams): void {
  // Analytics stub - implement when PostHog/analytics is configured
}

export function captureSuccess(_params: CaptureSuccessParams): void {
  // Analytics stub - implement when PostHog/analytics is configured
}
