import { randomUUID } from 'node:crypto';
import { assertV2Report, type CaptureIdentity } from './capture-report-v2';
export { assertV2Report } from './capture-report-v2';
import { Inject } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import type { InvitationBuilderEnvironment } from '../../../config/invitation-builder.environment';
import { INVITATION_BUILDER_CONFIG } from '../../../config/invitation-builder.environment';
import type {
  SupportedResolvedScene,
  ValidationIssue,
} from '../domain/document.types';

export class TrustedRenderError extends Error {
  constructor(
    readonly code:
      | 'RENDER_UNAVAILABLE'
      | 'RENDER_TIMEOUT'
      | 'RENDER_VERSION_MISMATCH'
      | 'FONT_UNAVAILABLE'
      | 'CONTENT_OVERFLOW',
    readonly issues: ValidationIssue[] = [],
  ) {
    super(code);
  }
}
export type RenderAsset = {
  bytes: Buffer;
  mimeType: 'image/webp' | 'image/png';
};
export type TrustedCapture = {
  png: Buffer;
  issues: ValidationIssue[];
  hasVisibleRsvp: boolean;
};
type RenderReport = {
  version: number;
  candidateHash: string;
  ready: boolean;
  issues: ValidationIssue[];
  captureRect: { x: number; y: number; width: number; height: number };
  hasVisibleRsvp: boolean;
};

export class ChromiumRenderer {
  constructor(
    @Inject(INVITATION_BUILDER_CONFIG)
    private readonly config: InvitationBuilderEnvironment,
  ) {}

  async capture(input: {
    scene: SupportedResolvedScene;
    candidateHash: string;
    asOf: string;
    assets: Record<string, RenderAsset>;
    hasVisibleRsvp: boolean;
  }): Promise<TrustedCapture> {
    if (!(
      (input.scene.schemaVersion === 1 &&
        input.scene.rendererContractVersion === 1) ||
      (input.scene.schemaVersion === 2 &&
        input.scene.rendererContractVersion === 2)
    ))
      throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
    let browser: Browser | undefined, context: BrowserContext | undefined;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      void context?.close().catch(() => undefined);
      void browser?.close().catch(() => undefined);
    }, 30_000);
    const origin = this.config.renderOrigin;
    const url = new URL('/internal/invitation-renderer', origin).href;
    const scene = structuredClone(input.scene);
    // The harness pads the screenshot area; measurement retains canonical bounds.
    try {
      browser = await chromium.launch({
        headless: true,
        chromiumSandbox: true,
        timeout: 10_000,
      });
      context = await browser.newContext({
        viewport: { width: 390, height: 780 },
        deviceScaleFactor: 1,
        locale: 'vi-VN',
        timezoneId: 'Asia/Ho_Chi_Minh',
        reducedMotion: 'reduce',
        serviceWorkers: 'block',
        acceptDownloads: false,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10_000);
      const violations: string[] = [];
      page.on('popup', (popup) => {
        violations.push('POPUP_BLOCKED');
        void popup.close();
      });
      page.on('download', () => violations.push('DOWNLOAD_BLOCKED'));
      await context.route('**/*', async (route) => {
        const request = route.request(),
          requestUrl = new URL(request.url());
        if (requestUrl.origin !== origin || request.method() !== 'GET') {
          violations.push('OFF_ORIGIN_REQUEST');
          return route.abort('blockedbyclient');
        }
        if (requestUrl.href === url) return route.continue();
        if (requestUrl.pathname.startsWith('/_next/static/'))
          return route.continue();
        if (
          !requestUrl.search &&
          !requestUrl.hash &&
          /^\/fonts\/invitation-builder\/noto-(sans|serif)-v1-(vietnamese|latin)-(400|700)-(normal|italic)\.woff2$/.test(
            requestUrl.pathname,
          )
        )
          return route.continue();
        const match = /^\/__render-assets\/([0-9a-f-]{36})$/i.exec(
          requestUrl.pathname,
        );
        if (match && input.assets[match[1]]) {
          const asset = input.assets[match[1]];
          return route.fulfill({
            status: 200,
            contentType: asset.mimeType,
            body: asset.bytes,
            headers: {
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        violations.push('UNAPPROVED_REQUEST');
        return route.abort('blockedbyclient');
      });
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 10_000,
      });
      if (!response?.ok() || response.url() !== url)
        throw new TrustedRenderError('RENDER_UNAVAILABLE');
      await page.waitForFunction(
        () =>
          Boolean(
            (window as Window & { invitationRenderer?: unknown })
              .invitationRenderer,
          ),
        undefined,
        { timeout: 5_000 },
      );
      const assetUrls = Object.fromEntries(
        Object.keys(input.assets).map((id) => [id, `/__render-assets/${id}`]),
      );
      if (scene.schemaVersion === 2) {
        await page.waitForFunction(
          () =>
            Boolean(
              (
                window as Window & {
                  invitationRendererV2?: {
                    protocolVersion: number;
                    supportedScenePairs: number[][];
                    render: (request: unknown) => Promise<unknown>;
                  };
                }
              ).invitationRendererV2,
            ),
          undefined,
          { timeout: 5000 },
        );
        let mobilePng: Buffer | undefined;
        for (const [pass, containerWidth] of (
          [390, 900, 390] as const
        ).entries()) {
          await page.setViewportSize({ width: containerWidth, height: 780 });
          const identity: CaptureIdentity = {
            candidateHash: input.candidateHash,
            containerWidth,
            scenePair: [2, 2],
            correlationId: randomUUID(),
            hasVisibleRsvp: input.hasVisibleRsvp,
          };
          const report: unknown = await page.evaluate(
            async (request) => {
              const renderer = (
                window as Window & {
                  invitationRendererV2?: {
                    protocolVersion: number;
                    supportedScenePairs: number[][];
                    render: (request: unknown) => Promise<unknown>;
                  };
                }
              ).invitationRendererV2;
              if (
                !renderer ||
                renderer.protocolVersion !== 2 ||
                JSON.stringify(renderer.supportedScenePairs) !== '[[1,1],[2,2]]'
              )
                throw new Error('RENDER_VERSION_MISMATCH');
              return renderer.render(request);
            },
            {
              protocolVersion: 2 as const,
              candidateHash: identity.candidateHash,
              scene,
              context: {
                mode: 'capture' as const,
                asOf: input.asOf,
                assetUrls,
              },
              states: 'publication-validation' as const,
              containerWidth,
              scenePair: [2, 2] as [2, 2],
              correlationId: identity.correlationId,
            },
          );
          assertV2Report(report, identity);
          if (violations.length)
            throw new TrustedRenderError('RENDER_UNAVAILABLE');
          if (!report.ready)
            throw new TrustedRenderError(
              report.issues.some((issue) => issue.code === 'FONT_UNAVAILABLE')
                ? 'FONT_UNAVAILABLE'
                : 'CONTENT_OVERFLOW',
              report.issues,
            );
          const root = await page
            .locator('[data-testid="capture-root"] [data-invitation-root]')
            .boundingBox();
          const capture = await page
            .locator('[data-testid="capture-root"]')
            .boundingBox();
          if (
            !root ||
            !capture ||
            Math.abs(root.x - report.rootRect.x) > 1 ||
            Math.abs(root.y - report.rootRect.y) > 1 ||
            Math.abs(root.width - report.rootRect.width) > 1 ||
            Math.abs(root.height - report.rootRect.height) > 1 ||
            capture.x !== 0 ||
            capture.y !== 0 ||
            capture.width !== containerWidth ||
            capture.height < 520
          )
            throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
          if (pass === 2)
            mobilePng = await page.screenshot({
              type: 'png',
              clip: { x: 0, y: 0, width: 390, height: 520 },
              animations: 'disabled',
              timeout: 10000,
            });
        }
        if (!mobilePng?.length)
          throw new TrustedRenderError('RENDER_UNAVAILABLE');
        return {
          png: mobilePng,
          issues: [],
          hasVisibleRsvp: input.hasVisibleRsvp,
        };
      }
      const report = await page.evaluate(
        async (request) => {
          const renderer = (
            window as Window & {
              invitationRenderer?: {
                render: (value: unknown) => Promise<RenderReport>;
              };
            }
          ).invitationRenderer;
          if (!renderer) throw new Error('RENDERER_NOT_READY');
          return renderer.render(request);
        },
        {
          candidateHash: input.candidateHash,
          scene,
          context: { mode: 'capture', asOf: input.asOf, assetUrls },
          states: 'publication-validation',
        },
      );
      if (
        report.version !== 1 ||
        report.candidateHash !== input.candidateHash ||
        report.captureRect.x !== 0 ||
        report.captureRect.y !== 0 ||
        report.captureRect.width !== 390 ||
        report.captureRect.height !== 520 ||
        report.hasVisibleRsvp !== input.hasVisibleRsvp
      )
        throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
      if (violations.length) throw new TrustedRenderError('RENDER_UNAVAILABLE');
      if (!report.ready) {
        const fontMissing = report.issues.some(
          (issue) => issue.code === 'FONT_UNAVAILABLE',
        );
        throw new TrustedRenderError(
          fontMissing ? 'FONT_UNAVAILABLE' : 'CONTENT_OVERFLOW',
          report.issues,
        );
      }
      // Compare the report against actual DOM geometry before clipping at the origin.
      const rect = await page
        .locator('[data-testid="capture-root"]')
        .boundingBox();
      if (
        !rect ||
        rect.x !== 0 ||
        rect.y !== 0 ||
        rect.width !== 390 ||
        rect.height < 520
      )
        throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
      const png = await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width: 390, height: 520 },
        animations: 'disabled',
        timeout: 10_000,
      });
      if (png.length === 0) throw new TrustedRenderError('RENDER_UNAVAILABLE');
      return {
        png,
        issues: report.issues,
        hasVisibleRsvp: report.hasVisibleRsvp,
      };
    } catch (error) {
      if (error instanceof TrustedRenderError) throw error;
      if (
        /RENDER_VERSION_MISMATCH/.test(
          error instanceof Error ? error.message : '',
        )
      )
        throw new TrustedRenderError('RENDER_VERSION_MISMATCH');
      if (timedOut) throw new TrustedRenderError('RENDER_TIMEOUT');
      const message = error instanceof Error ? error.message : '';
      throw new TrustedRenderError(
        /timeout|timed out/i.test(message)
          ? 'RENDER_TIMEOUT'
          : 'RENDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
      await context?.close().catch(() => undefined);
      await browser?.close().catch(() => undefined);
    }
  }
}
