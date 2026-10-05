import { validateWhatsAppFinish, type WhatsAppSignupEvent, type WhatsAppOnboardingInput, type WhatsAppOnboardingResult } from '@shared/whatsapp-onboarding';
import type { SetupMessageParams } from '@shared/setup-messages';

type Options = Omit<WhatsAppOnboardingInput, 'sessionId' | 'signupData'>;
export interface WhatsAppOnboardingAdapter {
  listen: (callback: (event: WhatsAppSignupEvent) => void) => () => void;
  launch: (callback: (response: { authResponse?: { code?: string } | null }) => void) => void;
  exchange: (code: string, attemptId: string) => Promise<{ sessionId: string }>;
  complete: (input: WhatsAppOnboardingInput) => Promise<WhatsAppOnboardingResult>;
  update: (state: { busy: boolean; canRetry?: boolean; error?: string; errorCode?: string; errorParams?: SetupMessageParams; result?: WhatsAppOnboardingResult }) => void;
}

/** One controller per click: closures snapshot form values, never stale React state. */
export class WhatsAppOnboardingController {
  private disposed = false;
  private unsubscribe?: () => void;
  private timer?: ReturnType<typeof setTimeout>;
  private sessionId?: string;
  private finish?: WhatsAppSignupEvent;
  private exchanged = false;
  private submitting = false;
  private completed = false;
  constructor(private adapter: WhatsAppOnboardingAdapter, private options: Options, private attemptId: string) {}

  start() {
    this.adapter.update({ busy: true });
    this.unsubscribe = this.adapter.listen(event => {
      if (this.disposed || this.completed || this.submitting) return;
      try {
        validateWhatsAppFinish(event);
        this.finish = event;
        void this.submit();
      } catch (error) { this.fail(error, true); }
    });
    this.timer = setTimeout(() => this.fail(Object.assign(new Error('Meta did not return both authorization and account details. Check popup permissions and restart signup.'), { messageCode: 'WHATSAPP_AUTHORIZATION_TIMEOUT' }), true), 120_000);
    try {
      this.adapter.launch(response => {
        if (this.disposed || this.exchanged) return;
        const code = response.authResponse?.code;
        if (!code) { this.fail(Object.assign(new Error('Meta authorization was cancelled. Please restart signup.'), { messageCode: 'WHATSAPP_AUTHORIZATION_CANCELLED' }), true); return; }
        this.exchanged = true;
        // Exchange immediately, independently of session logging (code TTL is 30 seconds).
        void this.adapter.exchange(code, this.attemptId).then(result => {
          if (this.disposed) return;
          this.sessionId = result.sessionId;
          void this.submit();
        }).catch(error => this.fail(error, true));
      });
    } catch (error) { this.fail(error, true); }
  }

  async submit(selectedPhoneNumberId?: string) {
    if (this.disposed || this.submitting || this.completed || !this.sessionId || !this.finish) return;
    if (selectedPhoneNumberId) this.options.selectedPhoneNumberId = selectedPhoneNumberId;
    this.submitting = true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.adapter.update({ busy: true });
    try {
      const result = await this.adapter.complete({ ...this.options, sessionId: this.sessionId, signupData: this.finish });
      if (!this.disposed) {
        this.completed = result.status === 'ready';
        this.adapter.update({ busy: false, canRetry: result.status === 'incomplete', result });
      }
    } catch (error) { this.fail(error); }
    finally { this.submitting = false; }
  }

  private fail(error: unknown, terminal = false) {
    if (this.disposed) return;
    const structured = error && typeof error === 'object' ? error as { message?: string; messageCode?: string; messageParams?: SetupMessageParams } : undefined;
    this.adapter.update({ busy: false, canRetry: !terminal && !!this.sessionId && !!this.finish,
      error: structured?.message || 'Unable to connect WhatsApp.', errorCode: structured?.messageCode || 'SETUP_UNKNOWN_ERROR', errorParams: structured?.messageParams });
    if (terminal) this.dispose();
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.unsubscribe?.(); }
}
