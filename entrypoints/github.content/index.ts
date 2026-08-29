import { defineContentScript } from 'wxt/utils/define-content-script';
import { startController } from '../../src/app/controller.ts';
import { createEngine } from '../../src/engine/engine.ts';
import { settleMutations } from '../../src/engine/settle.ts';
import { createRegistry } from '../../src/selectors/registry.ts';
import { createLogger } from '../../src/shared/logger.ts';
import { createDomClock } from '../../src/shared/time.ts';
import cssText from './style.css?inline';

/**
 * Content-script entrypoint. Wires collaborators only; no route or engine
 * rules live here.
 */
export default defineContentScript({
  matches: ['https://github.com/*'],
  cssInjectionMode: 'manual',
  runAt: 'document_idle',
  main(ctx) {
    if (!ctx.isValid) {
      return;
    }

    const clock = createDomClock();
    const logger = createLogger(import.meta.env.DEV);
    const registry = createRegistry();
    const engine = createEngine({
      clock,
      settle: settleMutations,
      logger,
    });
    const controller = startController({
      document,
      window,
      engine,
      rules: registry.rules,
      logger,
      clock,
      settle: settleMutations,
      cssText,
    });

    ctx.onInvalidated(() => {
      controller.stop();
    });
  },
});
