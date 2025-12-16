import type { BridgeMessage } from '@/utils/bridge/msg';
import type { BridgeHandler } from '../types';
import Analytics from '@/utils/ga';

/**
 * Analytics bridge handler
 * Handles all analytics.* method calls
 */
export class AnalyticsHandler implements BridgeHandler {
  namespace = 'analytics';

  async handle(message: BridgeMessage): Promise<any> {
    const { name, params } = message;
    const method = name.split('.').slice(1).join('.');

    switch (method) {
      case 'fireEvent':
        return this.fireEvent(params);

      case 'firePageViewEvent':
        return this.firePageViewEvent(params);

      case 'fireErrorEvent':
        return this.fireErrorEvent(params);

      default:
        throw new Error(`Unknown analytics method: ${method}`);
    }
  }

  private async fireEvent(params: any): Promise<void> {
    await Analytics.fireEvent(params.name, params.params);
  }

  private async firePageViewEvent(params: any): Promise<void> {
    await Analytics.firePageViewEvent(
      params.pageTitle,
      params.pageLocation,
      params.additionalParams
    );
  }

  private async fireErrorEvent(params: any): Promise<void> {
    await Analytics.fireErrorEvent(params.error, params.additionalParams);
  }
}

